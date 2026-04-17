#!/usr/bin/env bun
/**
 * Nightly Edge Function Migration Script
 *
 * Reads migration-state.json, picks the next N pending functions (respecting
 * priority and dependency order), converts them from Deno Edge Functions to
 * Hono/Bun routes using the Claude API, and writes the result.
 *
 * DRIFT DETECTION: After migrating all functions, the script keeps running
 * nightly. It computes a hash of each Edge Function source and compares it
 * to the hash stored at migration time. If the source changed, the function
 * is marked "outdated" and re-migrated automatically. This ensures the
 * Hono backend stays in sync with Edge Function changes.
 *
 * IMPORTANT: This does NOT activate the migration. The functions are ported
 * but remain commented out in the frontend router. A human must:
 *   1. Review the generated code
 *   2. Test it
 *   3. Uncomment the line in src/lib/supabaseEdgeFunctions.ts
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... bun run scripts/migrate-functions.ts [--count 3] [--dry-run]
 *   ANTHROPIC_API_KEY=sk-... bun run scripts/migrate-functions.ts --sync-only
 *
 * Environment:
 *   ANTHROPIC_API_KEY — required
 *   MIGRATION_COUNT   — functions per run (default: 3, override with --count)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";

// ─── Config ─────────────────────────────────────────────────────

const ROOT = join(import.meta.dir, "..");
const PROJECT_ROOT = join(ROOT, "..");
const STATE_FILE = join(ROOT, "migration-state.json");
const SUPABASE_FUNCTIONS_DIR = join(PROJECT_ROOT, "supabase", "functions");
const BACKEND_SRC = join(ROOT, "src");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const syncOnly = args.includes("--sync-only");
const countFlagIdx = args.indexOf("--count");
const countOverride = countFlagIdx >= 0 ? parseInt(args[countFlagIdx + 1], 10) : NaN;

// ─── Types ──────────────────────────────────────────────────────

interface SharedModule {
  status: "migrated" | "pending";
  target: string;
  note?: string;
}

interface FunctionEntry {
  name: string;
  status: "pending" | "migrated" | "outdated" | "skip" | "failed";
  route: string | null;
  target: string;
  priority: number;
  group: string;
  auth: boolean;
  deps: string[];
  note?: string;
  migratedAt?: string;
  sourceHash?: string;
  error?: string;
}

// ─── Hashing ────────────────────────────────────────────────────

function hashSource(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

interface MigrationState {
  config: {
    functionsPerRun: number;
    sourceDir: string;
    targetDir: string;
    sharedDir: string;
  };
  sharedModules: Record<string, SharedModule>;
  functions: FunctionEntry[];
}

// ─── Load State ─────────────────────────────────────────────────

function loadState(): MigrationState {
  const raw = readFileSync(STATE_FILE, "utf-8");
  return JSON.parse(raw);
}

function saveState(state: MigrationState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

// ─── Drift Detection ────────────────────────────────────────────

function detectDrift(state: MigrationState): FunctionEntry[] {
  const drifted: FunctionEntry[] = [];

  for (const fn of state.functions) {
    if (fn.status !== "migrated" || !fn.sourceHash) continue;

    try {
      const currentSource = readEdgeFunctionSource(fn.name);
      const currentHash = hashSource(currentSource);

      if (currentHash !== fn.sourceHash) {
        console.log(`  🔀 Drift detected: ${fn.name} (hash ${fn.sourceHash} → ${currentHash})`);
        fn.status = "outdated";
        drifted.push(fn);
      }
    } catch {
      // Edge function removed — skip
    }
  }

  return drifted;
}

// ─── Pick Next Functions ────────────────────────────────────────

function pickNextFunctions(state: MigrationState, count: number): FunctionEntry[] {
  const migratedShared = new Set(
    Object.entries(state.sharedModules)
      .filter(([, m]) => m.status === "migrated")
      .map(([name]) => name)
  );

  // Outdated functions get priority (re-sync)
  const outdated = state.functions
    .filter((f) => f.status === "outdated")
    .filter((f) => f.deps.every((dep) => migratedShared.has(dep)));

  // Then pending functions
  const pending = state.functions
    .filter((f) => f.status === "pending")
    .filter((f) => f.deps.every((dep) => migratedShared.has(dep)))
    .sort((a, b) => a.priority - b.priority);

  return [...outdated, ...pending].slice(0, count);
}

// ─── Pick Next Shared Modules ───────────────────────────────────

function pickRequiredSharedModules(
  state: MigrationState,
  targetFunctions: FunctionEntry[]
): string[] {
  const needed = new Set<string>();
  for (const fn of targetFunctions) {
    for (const dep of fn.deps) {
      if (state.sharedModules[dep]?.status === "pending") {
        needed.add(dep);
      }
    }
  }
  return [...needed];
}

// ─── Read Edge Function Source ───────────────────────────────────

function readEdgeFunctionSource(name: string): string {
  const indexPath = join(SUPABASE_FUNCTIONS_DIR, name, "index.ts");
  if (!existsSync(indexPath)) {
    throw new Error(`Edge function not found: ${indexPath}`);
  }
  return readFileSync(indexPath, "utf-8");
}

function readSharedModuleSource(name: string): string {
  const filePath = join(SUPABASE_FUNCTIONS_DIR, "_shared", `${name}.ts`);
  if (!existsSync(filePath)) {
    throw new Error(`Shared module not found: ${filePath}`);
  }
  return readFileSync(filePath, "utf-8");
}

// ─── Read Existing Backend Files for Context ────────────────────

function readExistingBackendFiles(): string {
  const files = [
    "src/lib/supabase.ts",
    "src/lib/stripe.ts",
    "src/lib/email.ts",
    "src/middleware/auth.ts",
    "src/index.ts",
  ];

  let context = "";
  for (const file of files) {
    const fullPath = join(ROOT, file);
    if (existsSync(fullPath)) {
      context += `\n--- ${file} ---\n${readFileSync(fullPath, "utf-8")}\n`;
    }
  }
  return context;
}

// ─── Call Claude API ────────────────────────────────────────────

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  return textBlock?.text || "";
}

// ─── Build Migration Prompt ─────────────────────────────────────

function buildPromptForSharedModule(
  name: string,
  source: string,
  targetPath: string,
  existingBackend: string
): string {
  return `You are migrating a Supabase Edge Function shared module from Deno to Bun/Node.

## Task
Convert this shared module from Deno runtime to Bun/Node.js TypeScript.

## Source: supabase/functions/_shared/${name}.ts
\`\`\`typescript
${source}
\`\`\`

## Target path: backend/${targetPath}

## Existing backend code for context:
${existingBackend}

## Rules
1. Replace \`Deno.env.get("X")\` with \`process.env.X\`
2. Replace deno.land/std and esm.sh imports with npm packages (already in package.json: @supabase/supabase-js, stripe, resend)
3. Replace \`import X from "../_shared/Y.ts"\` with relative imports to the new locations in src/lib/
4. Keep all type exports and function signatures identical
5. Do NOT add comments like "// Migrated from..." — keep the code clean
6. Use the existing backend patterns (see context above)
7. If the module imports brand.json, use: \`import brandConfig from "../../brand.json"\` (we'll copy it)

## Output
Return ONLY the TypeScript code for the new file. No markdown fences, no explanation. Just the code.`;
}

function buildPromptForFunction(
  fn: FunctionEntry,
  source: string,
  existingBackend: string,
  sharedModuleSources: Record<string, string>
): string {
  const sharedContext = Object.entries(sharedModuleSources)
    .map(([name, src]) => `--- _shared/${name}.ts ---\n${src}`)
    .join("\n\n");

  const isInternalService = fn.route === null;
  const routeInfo = isInternalService
    ? `This is an INTERNAL SERVICE (no HTTP endpoint). Export async functions that other routes can import directly. Do NOT create a Hono router.`
    : `This maps to: ${fn.auth ? "authenticated" : "public"} POST ${fn.route}`;

  return `You are migrating a Supabase Edge Function to a Hono/Bun backend.

## Task
Convert this Edge Function to a Hono route module (or internal service).

## Source: supabase/functions/${fn.name}/index.ts
\`\`\`typescript
${source}
\`\`\`

## Shared modules used by this function:
${sharedContext || "(none)"}

## Function metadata
- Name: ${fn.name}
- Group: ${fn.group}
- ${routeInfo}
- Target file: backend/${fn.target}

## Existing backend code for patterns:
${existingBackend}

## Conversion Rules

1. **Handler pattern**: Replace \`serve(async (req) => {})\` with Hono route handlers
   - If this is an HTTP endpoint: \`const router = new Hono(); router.post("${fn.route?.split("/").pop() || "/"}", async (c) => {}); export default router;\`
   - If this is an internal service: Export named async functions, no Hono router
2. **Env vars**: \`Deno.env.get("X")\` → \`process.env.X\`
3. **Imports**: Replace esm.sh/deno.land imports with npm imports
   - \`import { supabaseAdmin } from "../lib/supabase"\`
   - \`import { stripe } from "../lib/stripe"\`
   - \`import { sendEmail } from "../lib/email"\`
4. **CORS**: Remove all manual corsHeaders — handled globally by Hono middleware
5. **Response**: \`new Response(JSON.stringify(x))\` → \`c.json(x)\`
6. **Request**: \`await req.json()\` → \`await c.req.json()\`
7. **Auth**: ${fn.auth ? 'Add `import { authMiddleware } from "../middleware/auth"` and `router.use("/*", authMiddleware)`' : "No auth middleware needed"}
8. **Inter-function calls**: Replace \`supabase.functions.invoke('other-fn', { body })\` with:
   - A TODO comment: \`// TODO: Import and call directly when other-fn is migrated\`
   - Keep the supabase.functions.invoke call for now (it still works during transition)
9. **Target file**: If the target file would contain routes from MULTIPLE functions (e.g., payments.ts), export the handler as a named function and document which route path it maps to. A parent file will mount them.
10. Do NOT add comments like "// Migrated from..." — keep the code clean
11. Keep the exact same business logic. Do not simplify, optimize, or refactor anything.
12. For \`await req.text()\` (used in Stripe webhooks), use \`await c.req.text()\`

## Output
Return ONLY the TypeScript code. No markdown fences, no explanation, no file path header. Just the raw code.`;
}

// ─── Extract Code from Response ─────────────────────────────────

function extractCode(response: string): string {
  // Strip markdown fences if Claude added them despite instructions
  let code = response.trim();
  if (code.startsWith("```")) {
    code = code.replace(/^```\w*\n/, "").replace(/\n```$/, "");
  }
  return code;
}

// ─── Write Generated Code ───────────────────────────────────────

function writeGeneratedFile(relativePath: string, code: string): void {
  const fullPath = join(ROOT, relativePath);
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // If file already exists, append with a clear separator
  if (existsSync(fullPath)) {
    const existing = readFileSync(fullPath, "utf-8");
    // Check if this code is already substantially there (avoid duplicates)
    const firstLine = code.split("\n")[0];
    if (existing.includes(firstLine) && firstLine.length > 20) {
      console.log(`  ⏭  Skipping ${relativePath} — content already exists`);
      return;
    }
    writeFileSync(fullPath, existing + "\n\n" + code);
    console.log(`  📝 Appended to ${relativePath}`);
  } else {
    writeFileSync(fullPath, code);
    console.log(`  ✅ Created ${relativePath}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("🔄 Edge Function Migration Script");
  console.log(`   Mode: ${dryRun ? "DRY RUN" : syncOnly ? "SYNC ONLY" : "LIVE"}`);
  console.log("");

  const state = loadState();
  const count = isNaN(countOverride) ? state.config.functionsPerRun : countOverride;

  // ─── Drift Detection (always runs) ────────────────────────────
  console.log("🔍 Checking for drift on migrated functions...");
  const drifted = detectDrift(state);
  if (drifted.length > 0) {
    console.log(`   ${drifted.length} function(s) changed since last migration`);
  } else {
    console.log("   No drift detected");
  }
  console.log("");

  // In sync-only mode, just detect drift and save, don't migrate new functions
  if (syncOnly) {
    if (!dryRun) saveState(state);
    if (drifted.length > 0) {
      console.log("📋 Outdated functions that need re-migration:");
      for (const fn of drifted) {
        console.log(`   - ${fn.name} (${fn.target})`);
      }
    }
    console.log("\n✅ Sync check complete.");
    return;
  }

  // Stats
  const total = state.functions.length;
  const migrated = state.functions.filter((f) => f.status === "migrated").length;
  const outdated = state.functions.filter((f) => f.status === "outdated").length;
  const skipped = state.functions.filter((f) => f.status === "skip").length;
  const pending = state.functions.filter((f) => f.status === "pending").length;

  console.log(`📊 Status: ${migrated} migrated, ${outdated} outdated, ${pending} pending, ${skipped} skipped, ${total} total`);
  console.log(`   Target: migrate ${count} functions this run`);
  console.log("");

  // Pick candidates (considering deps that need shared modules first)
  const targets = pickNextFunctions(state, count);

  if (targets.length === 0) {
    // Check if there are pending functions blocked by shared module deps
    const blockedCount = state.functions.filter((f) => f.status === "pending").length;
    if (blockedCount > 0) {
      console.log(`⚠️  ${blockedCount} functions pending but blocked by unmigrated shared modules.`);
      const requiredShared = pickRequiredSharedModules(state, state.functions.filter((f) => f.status === "pending"));
      console.log(`   Required shared modules: ${requiredShared.join(", ")}`);
      console.log("   Migrating shared modules first...");

      // Migrate the blocking shared modules
      const existingBackend = readExistingBackendFiles();
      for (const moduleName of requiredShared.slice(0, count)) {
        console.log(`\n🔧 Migrating shared module: ${moduleName}`);
        const moduleInfo = state.sharedModules[moduleName];
        const source = readSharedModuleSource(moduleName);

        if (dryRun) {
          console.log(`  [DRY RUN] Would convert ${moduleName} → ${moduleInfo.target}`);
          continue;
        }

        const prompt = buildPromptForSharedModule(moduleName, source, moduleInfo.target, existingBackend);
        const response = await callClaude(prompt);
        const code = extractCode(response);
        writeGeneratedFile(moduleInfo.target, code);
        moduleInfo.status = "migrated";
      }

      if (!dryRun) saveState(state);
      console.log("\n✅ Shared modules migrated. Run again to migrate functions.");
      return;
    }

    console.log("✅ Nothing to migrate — all functions are done!");
    return;
  }

  console.log(`🎯 Selected ${targets.length} functions:`);
  for (const fn of targets) {
    console.log(`   - ${fn.name} (priority ${fn.priority}, group: ${fn.group})`);
  }
  console.log("");

  // Read existing backend code for context
  const existingBackend = readExistingBackendFiles();

  // Migrate each function
  for (const fn of targets) {
    console.log(`\n🔄 Migrating: ${fn.name}`);

    try {
      // Read source
      const source = readEdgeFunctionSource(fn.name);
      console.log(`  📖 Read source (${source.length} chars)`);

      // Read shared module sources this function depends on
      const sharedSources: Record<string, string> = {};
      for (const dep of fn.deps) {
        try {
          sharedSources[dep] = readSharedModuleSource(dep);
        } catch {
          console.log(`  ⚠️  Could not read shared module: ${dep}`);
        }
      }

      if (dryRun) {
        console.log(`  [DRY RUN] Would convert → ${fn.target}`);
        console.log(`  [DRY RUN] Route: ${fn.route || "(internal service)"}`);
        console.log(`  [DRY RUN] Deps: ${fn.deps.join(", ") || "(none)"}`);
        continue;
      }

      // Call Claude API
      console.log("  🤖 Calling Claude API...");
      const prompt = buildPromptForFunction(fn, source, existingBackend, sharedSources);
      const response = await callClaude(prompt);
      const code = extractCode(response);

      if (!code || code.length < 50) {
        throw new Error(`Generated code too short (${code.length} chars) — likely an error`);
      }

      console.log(`  📝 Generated ${code.length} chars`);

      // Write the generated code
      writeGeneratedFile(fn.target, code);

      // Update state with hash for future drift detection
      fn.status = "migrated";
      fn.migratedAt = new Date().toISOString();
      fn.sourceHash = hashSource(source);

      console.log(`  ✅ ${fn.name} migrated → ${fn.target} (hash: ${fn.sourceHash})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed to migrate ${fn.name}: ${message}`);
      fn.status = "failed";
      fn.error = message;
    }
  }

  // Save updated state
  if (!dryRun) {
    saveState(state);
    console.log("\n💾 State saved to migration-state.json");
  }

  // Summary
  const newMigrated = state.functions.filter((f) => f.status === "migrated").length;
  const failed = state.functions.filter((f) => f.status === "failed").length;
  const newOutdated = state.functions.filter((f) => f.status === "outdated").length;
  console.log(`\n📊 Done: ${newMigrated} migrated (+${newMigrated - migrated}), ${newOutdated} outdated, ${failed} failed, ${pending - targets.length} remaining`);

  if (!dryRun) {
    console.log("\n⚠️  REMINDER: Functions are ported but NOT activated.");
    console.log("   To activate, uncomment the corresponding line in:");
    console.log("   src/lib/supabaseEdgeFunctions.ts → migratedFunctions map");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
