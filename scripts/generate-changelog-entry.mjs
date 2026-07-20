#!/usr/bin/env node
/**
 * Draft a changelog entry from the PRs merged since the last published entry.
 *
 * Runs in CI on every push to `main` (see .github/workflows/changelog.yml).
 * It collects the merged PR titles/bodies, hands them to Claude with a strict
 * schema and an editorial brief, validates the JSON it gets back, and writes
 * `src/content/changelog/<date>-<slug>.json`. The workflow then opens a PR —
 * nothing is published without a human merging it.
 *
 * Prints `SKIP` (and exits 0) when there is nothing a spa manager would notice,
 * so the workflow can bail out without opening an empty PR.
 *
 * Requires: `gh` (authenticated via GH_TOKEN) and `claude` CLI (ANTHROPIC_API_KEY).
 */

import { execFileSync } from "node:child_process";
import { readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CONTENT_DIR = resolve(__dirname, "..", "src", "content", "changelog");

const TYPES = ["new", "improved", "fixed"];
const AUDIENCES = ["admin", "therapist", "client"];

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }).trim();
}

/** Date of the most recent published entry, or 30 days ago on a cold start. */
async function lastPublishedDate() {
  if (!existsSync(CONTENT_DIR)) return null;
  const files = (await readdir(CONTENT_DIR)).filter((f) => f.endsWith(".json"));
  const dates = files.map((f) => f.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (dates.length === 0) return null;
  return dates.sort().at(-1);
}

function fallbackDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

/** Merged PRs since `since` (exclusive-ish; same-day PRs are re-checked and deduped by the model). */
function mergedPullRequests(since) {
  const raw = run("gh", [
    "pr",
    "list",
    "--state",
    "merged",
    "--base",
    "main",
    "--limit",
    "50",
    "--search",
    `merged:>=${since}`,
    "--json",
    "number,title,body,mergedAt,files",
  ]);
  const prs = JSON.parse(raw);
  return prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    body: (pr.body || "").slice(0, 2000),
    mergedAt: pr.mergedAt,
    files: (pr.files || []).map((f) => f.path).slice(0, 40),
  }));
}

const SCHEMA_BRIEF = `
Réponds UNIQUEMENT avec un objet JSON valide, sans bloc de code, sans commentaire.

Schéma exact :
{
  "date": "YYYY-MM-DD",
  "slug": "kebab-case-court-en-francais",
  "title": { "fr": "…", "en": "…" },
  "summary": { "fr": "1 à 2 phrases", "en": "1 to 2 sentences" },
  "items": [
    {
      "type": "new" | "improved" | "fixed",
      "audience": "admin" | "therapist" | "client",
      "title": { "fr": "…", "en": "…" },
      "body": { "fr": "2 à 3 phrases", "en": "2 to 3 sentences" }
    }
  ]
}

Règles éditoriales — le lecteur est un gérant de spa ou un directeur d'hôtel, pas un développeur :
- Ne retiens QUE ce qu'un client remarque en utilisant le produit. Ignore totalement :
  refactorings, CI, tests, migrations de base, montées de version de dépendances,
  corrections de typage, changements de configuration interne.
- Ne mentionne jamais un nom de fichier, de fonction, de table, de branche ou un numéro de PR.
- Décris le bénéfice concret, pas l'implémentation.
- Vocabulaire produit obligatoire : « thérapeute » (jamais « coiffeur »/« hairdresser »),
  « salle de soin » (jamais « trunk »), « lieu » (hôtel ou spa).
  En anglais : "therapist", "treatment room", "venue".
- "audience" : "admin" = back-office, "therapist" = app mobile thérapeute,
  "client" = parcours de réservation en ligne.
- FR et EN doivent porter le même sens ; l'anglais n'est pas une traduction littérale mais un texte naturel.
- 1 à 6 items maximum, les plus marquants d'abord.

Si aucune des PR n'apporte de changement visible pour un client, réponds exactement : SKIP
`;

function buildPrompt(prs, date) {
  return `Tu rédiges la note de version publique de Saoma, une plateforme de gestion de spa pour hôtels.

Date de la release : ${date}

Voici les pull requests mergées sur main depuis la dernière note publiée :

${JSON.stringify(prs, null, 2)}

${SCHEMA_BRIEF}`;
}

/**
 * Pinned to Sonnet on purpose: this runs on every push to main, and the task is
 * short bilingual prose from an already-structured PR list — not deep reasoning.
 * Leaving the model implicit would follow the CLI default, which shifts between
 * releases (the workflow always installs the latest) and can land on Opus.
 */
const MODEL = "claude-sonnet-5";

function callClaude(prompt) {
  return run("claude", ["-p", prompt, "--model", MODEL, "--output-format", "text"]);
}

function assertLocalized(value, path) {
  if (!value || typeof value.fr !== "string" || typeof value.en !== "string") {
    throw new Error(`${path} doit contenir les clés "fr" et "en" (chaînes)`);
  }
  if (!value.fr.trim() || !value.en.trim()) {
    throw new Error(`${path} contient une traduction vide`);
  }
}

/** Fail loudly on a malformed draft rather than committing a broken entry. */
function validateEntry(entry) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error("date invalide");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.slug)) throw new Error("slug invalide");
  assertLocalized(entry.title, "title");
  assertLocalized(entry.summary, "summary");
  if (!Array.isArray(entry.items) || entry.items.length === 0) {
    throw new Error("items doit être un tableau non vide");
  }
  entry.items.forEach((item, i) => {
    if (!TYPES.includes(item.type)) throw new Error(`items[${i}].type invalide: ${item.type}`);
    if (!AUDIENCES.includes(item.audience)) {
      throw new Error(`items[${i}].audience invalide: ${item.audience}`);
    }
    assertLocalized(item.title, `items[${i}].title`);
    assertLocalized(item.body, `items[${i}].body`);
  });
}

/** Strip an accidental ```json fence — the model is told not to, but be forgiving. */
function parseResponse(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned);
}

async function main() {
  const since = (await lastPublishedDate()) || fallbackDate();
  const today = new Date().toISOString().slice(0, 10);

  const prs = mergedPullRequests(since);
  if (prs.length === 0) {
    console.log("SKIP");
    return;
  }

  const raw = callClaude(buildPrompt(prs, today));
  if (raw.trim() === "SKIP" || raw.trim().endsWith("SKIP")) {
    console.log("SKIP");
    return;
  }

  const entry = parseResponse(raw);
  entry.date = today;
  validateEntry(entry);

  await mkdir(CONTENT_DIR, { recursive: true });
  const file = join(CONTENT_DIR, `${entry.date}-${entry.slug}.json`);
  await writeFile(file, `${JSON.stringify(entry, null, 2)}\n`, "utf8");

  console.log(`WROTE ${file}`);
}

main().catch((err) => {
  console.error(`Échec de la génération : ${err.message}`);
  process.exit(1);
});
