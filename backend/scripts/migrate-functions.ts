#!/usr/bin/env bun
/**
 * Nightly Edge Function Migration — Orchestrator
 *
 * This script handles the bookkeeping (state tracking, drift detection,
 * dependency resolution). The actual code conversion is done by Claude Code
 * CLI (`claude -p`), which reads the source files itself and writes the output.
 *
 * Usage:
 *   bun run scripts/migrate-functions.ts [--count 3] [--dry-run] [--sync-only]
 *
 * Requires: `claude` CLI available in PATH (installed via npm i -g @anthropic-ai/claude-code)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

// ─── Config ─────────────────────────────────────────────────────

const ROOT = join(import.meta.dir, "..");
const PROJECT_ROOT = join(ROOT, "..");
const STATE_FILE = join(ROOT, "migration-state.json");
const SUPABASE_FUNCTIONS_DIR = join(PROJECT_ROOT, "supabase", "functions");

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

interface MigrationState {
  config: { functionsPerRun: number };
  sharedModules: Record<string, SharedModule>;
  functions: FunctionEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────

function hashSource(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function loadState(): MigrationState {
  return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state: MigrationState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

function readEdgeFunctionSource(name: string): string {
  const indexPath = join(SUPABASE_FUNCTIONS_DIR, name, "index.ts");
  if (!existsSync(indexPath)) throw new Error(`Not found: ${indexPath}`);
  return readFileSync(indexPath, "utf-8");
}

// ─── Drift Detection ────────────────────────────────────────────

function detectDrift(state: MigrationState): FunctionEntry[] {
  const drifted: FunctionEntry[] = [];
  for (const fn of state.functions) {
    if (fn.status !== "migrated" || !fn.sourceHash) continue;
    try {
      const currentHash = hashSource(readEdgeFunctionSource(fn.name));
      if (currentHash !== fn.sourceHash) {
        console.log(`  🔀 Drift: ${fn.name} (${fn.sourceHash} → ${currentHash})`);
        fn.status = "outdated";
        drifted.push(fn);
      }
    } catch {
      // Edge function removed
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

  const outdated = state.functions
    .filter((f) => f.status === "outdated")
    .filter((f) => f.deps.every((dep) => migratedShared.has(dep)));

  const pending = state.functions
    .filter((f) => f.status === "pending")
    .filter((f) => f.deps.every((dep) => migratedShared.has(dep)))
    .sort((a, b) => a.priority - b.priority);

  return [...outdated, ...pending].slice(0, count);
}

function getBlockingSharedModules(state: MigrationState): string[] {
  const migratedShared = new Set(
    Object.entries(state.sharedModules)
      .filter(([, m]) => m.status === "migrated")
      .map(([name]) => name)
  );
  const needed = new Set<string>();
  for (const fn of state.functions.filter((f) => f.status === "pending")) {
    for (const dep of fn.deps) {
      if (!migratedShared.has(dep)) needed.add(dep);
    }
  }
  return [...needed];
}

// ─── Claude Code CLI ────────────────────────────────────────────

function runClaudeCode(prompt: string): boolean {
  try {
    execSync(`claude -p ${JSON.stringify(prompt)} --allowedTools "Read,Write,Edit,Glob,Grep"`, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      timeout: 120_000,
    });
    return true;
  } catch (err) {
    console.error("Claude Code failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

function buildPromptForSharedModule(name: string, targetPath: string): string {
  return `Migrate the Supabase Edge Function shared module "supabase/functions/_shared/${name}.ts" to the Hono/Bun backend.

Read the source file, then read the existing backend libs in backend/src/lib/ for patterns.

Write the converted module to "backend/${targetPath}".

Rules:
- Replace Deno.env.get("X") with process.env.X
- Replace esm.sh/deno.land imports with npm packages (@supabase/supabase-js, stripe, resend)
- Replace _shared/ imports with relative imports to backend/src/lib/
- Keep all type exports and function signatures identical
- If it imports brand.json, use: import brandConfig from "../../brand.json"
- No "migrated from" comments. Clean code only.
- Match the style of existing files in backend/src/lib/`;
}

function buildPromptForFunction(fn: FunctionEntry): string {
  const isInternal = fn.route === null;
  const routeInfo = isInternal
    ? `This is an INTERNAL SERVICE (no HTTP endpoint). Export async functions that other routes can import directly. Do NOT create a Hono router.`
    : `This is a ${fn.auth ? "authenticated" : "public"} POST endpoint at ${fn.route}`;

  return `Migrate the Supabase Edge Function "supabase/functions/${fn.name}/index.ts" to the Hono/Bun backend.

Read the source file first. Then read backend/src/index.ts and a few existing routes in backend/src/routes/ to understand the patterns.

${routeInfo}

Write the result to "backend/${fn.target}". If the file already exists (other functions share the same file), append the new handler — don't overwrite existing code.

Conversion rules:
- serve(async (req) => {}) → Hono route handlers: app.post("/path", async (c) => {})
- Deno.env.get("X") → process.env.X
- esm.sh/deno.land imports → npm imports
- Use existing shared libs: import { supabaseAdmin } from "../lib/supabase", import { stripe } from "../lib/stripe", import { sendEmail } from "../lib/email"
- Remove all manual corsHeaders — handled globally by Hono middleware
- new Response(JSON.stringify(x)) → c.json(x)
- await req.json() → await c.req.json()
- await req.text() → await c.req.text() (for Stripe webhooks)
${fn.auth ? '- Add auth middleware: import { authMiddleware } from "../middleware/auth" and router.use("/*", authMiddleware)' : "- No auth middleware needed"}
- For supabase.functions.invoke('other-fn', { body }) calls: keep as-is with a TODO comment, they still work during transition
- Keep the exact same business logic. Do not refactor or optimize.
- No "migrated from" comments. Clean code only.`;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("🔄 Edge Function Migration (Claude Code)");
  console.log(`   Mode: ${dryRun ? "DRY RUN" : syncOnly ? "SYNC ONLY" : "LIVE"}\n`);

  const state = loadState();
  const count = isNaN(countOverride) ? state.config.functionsPerRun : countOverride;

  // Drift detection
  console.log("🔍 Checking for drift...");
  const drifted = detectDrift(state);
  console.log(drifted.length > 0
    ? `   ${drifted.length} function(s) changed since last migration`
    : "   No drift detected");

  if (syncOnly) {
    if (!dryRun) saveState(state);
    console.log("\n✅ Sync check complete.");
    return;
  }

  // Stats
  const total = state.functions.length;
  const migrated = state.functions.filter((f) => f.status === "migrated").length;
  const outdated = state.functions.filter((f) => f.status === "outdated").length;
  const pending = state.functions.filter((f) => f.status === "pending").length;
  const skipped = state.functions.filter((f) => f.status === "skip").length;

  console.log(`\n📊 ${migrated} migrated, ${outdated} outdated, ${pending} pending, ${skipped} skipped, ${total} total`);
  console.log(`   Target: ${count} functions this run\n`);

  // Pick candidates
  const targets = pickNextFunctions(state, count);

  if (targets.length === 0) {
    // Check for blocked shared modules
    const blocking = getBlockingSharedModules(state);
    if (blocking.length > 0 && pending > 0) {
      console.log(`⚠️  ${pending} functions blocked by shared modules: ${blocking.join(", ")}`);
      console.log("   Migrating shared modules first...\n");

      for (const moduleName of blocking.slice(0, count)) {
        const moduleInfo = state.sharedModules[moduleName];
        if (!moduleInfo) continue;

        console.log(`🔧 Migrating shared module: ${moduleName}`);
        if (dryRun) {
          console.log(`  [DRY RUN] → ${moduleInfo.target}\n`);
          continue;
        }

        const prompt = buildPromptForSharedModule(moduleName, moduleInfo.target);
        const success = runClaudeCode(prompt);
        if (success) {
          moduleInfo.status = "migrated";
          console.log(`  ✅ ${moduleName} → ${moduleInfo.target}\n`);
        } else {
          console.error(`  ❌ Failed: ${moduleName}\n`);
        }
      }

      if (!dryRun) saveState(state);
      console.log("✅ Shared modules done. Run again for functions.");
      return;
    }

    console.log("✅ Nothing to migrate!");
    return;
  }

  console.log(`🎯 Selected:`);
  for (const fn of targets) {
    console.log(`   - ${fn.name} (p${fn.priority}, ${fn.group})`);
  }

  // Migrate
  for (const fn of targets) {
    console.log(`\n🔄 ${fn.name}`);

    if (dryRun) {
      console.log(`  [DRY RUN] → ${fn.target}`);
      continue;
    }

    try {
      const source = readEdgeFunctionSource(fn.name);
      const prompt = buildPromptForFunction(fn);
      const success = runClaudeCode(prompt);

      if (success) {
        fn.status = "migrated";
        fn.migratedAt = new Date().toISOString();
        fn.sourceHash = hashSource(source);
        fn.error = undefined;
        console.log(`  ✅ ${fn.name} → ${fn.target} (hash: ${fn.sourceHash})`);
      } else {
        fn.status = "failed";
        fn.error = "Claude Code returned non-zero exit code";
        console.error(`  ❌ ${fn.name} failed`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fn.status = "failed";
      fn.error = message;
      console.error(`  ❌ ${fn.name}: ${message}`);
    }
  }

  if (!dryRun) {
    saveState(state);
    console.log("\n💾 State saved");
  }

  const newMigrated = state.functions.filter((f) => f.status === "migrated").length;
  const failed = state.functions.filter((f) => f.status === "failed").length;
  console.log(`\n📊 ${newMigrated} migrated (+${newMigrated - migrated}), ${failed} failed, ${pending - targets.length} remaining`);
  console.log("\n⚠️  Functions ported but NOT activated — uncomment in migratedFunctions to enable.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
