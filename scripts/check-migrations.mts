/**
 * Garde-fou anti-collision de migrations, à lancer AVANT d'ouvrir une PR.
 *
 * Le problème qu'il évite (vécu sur la PR #423) : deux branches créent chacune une
 * migration au même timestamp. La première mergée est appliquée, son numéro de version
 * est enregistré dans `supabase_migrations.schema_migrations`, et `supabase db push`
 * considère alors la seconde comme déjà appliquée — elle est sautée en silence.
 *
 * Deux vérifications :
 *   1. locale (toujours) — deux fichiers avec le même timestamp dans supabase/migrations
 *   2. distante (si SUPABASE_ACCESS_TOKEN) — un timestamp local déjà enregistré sur
 *      l'environnement de destination sous un AUTRE nom, ou une migration "hors ordre"
 *      (antérieure à la dernière appliquée, donc jamais poussée).
 *
 * Usage :
 *   bun run check:migrations                  # staging (défaut)
 *   bun run check:migrations -- --env prod
 *   bun run check:migrations -- --ref xxxx
 *
 * Le token distant vient de SUPABASE_ACCESS_TOKEN (`supabase login` l'écrit aussi dans
 * ~/.supabase/access-token, lu en dernier recours). Sans token, seule l'étape 1 tourne.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_REFS = {
  staging: 'xfkujlgettlxdgrnqluw',
  prod: 'wvderlgzetpptehxndqf',
} as const;

const MIGRATIONS_DIR = 'supabase/migrations';

type LocalMigration = { version: string; name: string; file: string };

const parseArgs = (argv: string[]) => {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const env = (get('--env') ?? 'staging') as keyof typeof PROJECT_REFS;
  if (!(env in PROJECT_REFS)) {
    throw new Error(`--env doit valoir ${Object.keys(PROJECT_REFS).join(' ou ')}`);
  }
  return { env, ref: get('--ref') ?? PROJECT_REFS[env] };
};

const readLocalMigrations = (): LocalMigration[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((file) => {
      const match = file.match(/^(\d{14})_(.+)\.sql$/);
      if (!match) throw new Error(`Nom de migration invalide : ${file} (attendu <14 chiffres>_<nom>.sql)`);
      return { version: match[1], name: match[2], file };
    })
    .sort((a, b) => a.version.localeCompare(b.version));

const readAccessToken = (): string | undefined => {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    return readFileSync(join(homedir(), '.supabase', 'access-token'), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
};

const fetchRemoteMigrations = async (ref: string, token: string) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'select version, name from supabase_migrations.schema_migrations order by version',
    }),
  });
  if (!res.ok) {
    throw new Error(`API Supabase ${res.status} : ${await res.text()}`);
  }
  return (await res.json()) as Array<{ version: string; name: string | null }>;
};

const main = async () => {
  const { env, ref } = parseArgs(process.argv.slice(2));
  const local = readLocalMigrations();
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Doublons de timestamp dans le repo
  const byVersion = new Map<string, LocalMigration[]>();
  for (const m of local) {
    byVersion.set(m.version, [...(byVersion.get(m.version) ?? []), m]);
  }
  for (const [version, group] of byVersion) {
    if (group.length > 1) {
      errors.push(`Timestamp ${version} utilisé par ${group.length} fichiers : ${group.map((g) => g.file).join(', ')}`);
    }
  }

  // 2. Collisions avec l'environnement de destination
  const token = readAccessToken();
  if (!token) {
    warnings.push(
      'SUPABASE_ACCESS_TOKEN absent — vérification distante ignorée (lance `supabase login` ou exporte le token).',
    );
  } else {
    const remote = await fetchRemoteMigrations(ref, token);
    const remoteByVersion = new Map(remote.map((r) => [r.version, r.name ?? '']));
    const lastRemote = remote.at(-1)?.version ?? '';

    for (const m of local) {
      const remoteName = remoteByVersion.get(m.version);
      if (remoteName === undefined) {
        if (m.version < lastRemote) {
          warnings.push(
            `${m.file} est antérieure à la dernière migration appliquée sur ${env} (${lastRemote}) : ` +
              `db push ne la jouera pas dans l'ordre attendu.`,
          );
        }
        continue;
      }
      if (remoteName !== m.name) {
        errors.push(
          `COLLISION sur ${env} : le timestamp ${m.version} y est déjà enregistré sous « ${remoteName} », ` +
            `mais localement c'est ${m.file}. Renomme ta migration avec un timestamp libre, sinon elle sera sautée.`,
        );
      }
    }
  }

  for (const w of warnings) console.warn(`⚠️  ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`❌ ${e}`);
    console.error(`\n${errors.length} problème(s) de migration — corrige avant d'ouvrir la PR.`);
    process.exit(1);
  }
  console.log(`✅ ${local.length} migrations locales, aucune collision avec ${env} (${ref}).`);
};

await main();
