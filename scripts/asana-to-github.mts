/**
 * Synchronise les tâches Asana (retours / bugs) vers des issues GitHub.
 *
 * Le pipeline complet :
 *   Asana ──(ce script, cron 15 min)──► issue GitHub (label `asana`)
 *        ◄──(commentaire avec le lien)─┘
 *   puis, quand tu poses le label `claude:fix` sur l'issue :
 *   claude-fix-issue.yml ──► branche auto/issue-N ──► PR draft
 *
 * Idempotence : chaque issue créée porte un marqueur `<!-- asana-gid:123 -->` dans son
 * body. Avant de créer quoi que ce soit, on liste toutes les issues portant le label
 * `asana` (ouvertes ET fermées) et on en extrait les GID déjà synchronisés. Pas de
 * fichier d'état à committer, pas de dépendance à l'indexation de la recherche GitHub.
 *
 * Usage :
 *   bun run asana:sync -- --dry-run          # montre ce qui serait créé, n'écrit rien
 *   bun run asana:sync                       # crée au plus --limit issues (défaut 10)
 *   bun run asana:sync -- --limit 50
 *   bun run asana:sync -- --since 2026-08-01 # ignore les tâches créées avant cette date
 *
 * Variables d'environnement requises :
 *   ASANA_PAT           token personnel Asana (app.asana.com/0/my-apps)
 *   ASANA_PROJECT_GID   GID du projet Asana à synchroniser
 *   GITHUB_TOKEN        token GitHub avec le scope `issues: write`
 *   GITHUB_REPOSITORY   "owner/repo" (fourni automatiquement par GitHub Actions)
 *
 * Optionnelles :
 *   ASANA_TAG_FILTER    ne synchronise que les tâches portant ce tag (ex. "bug")
 */

const ASANA_API = 'https://app.asana.com/api/1.0';
const GITHUB_API = 'https://api.github.com';

/** Plafond de sécurité : évite qu'un premier run sur un projet chargé n'ouvre 200 issues. */
const DEFAULT_LIMIT = 10;

const LABELS = [
  { name: 'asana', color: 'f06a6a', description: 'Issue synchronisée depuis Asana' },
  { name: 'bug', color: 'd73a4a', description: 'Dysfonctionnement signalé' },
] as const;

type AsanaTask = {
  gid: string;
  name: string;
  notes: string;
  permalink_url: string;
  created_at: string;
  completed: boolean;
  assignee: { name: string } | null;
  tags: { gid: string; name: string }[];
};

type GithubIssue = { number: number; body: string | null; html_url: string; pull_request?: unknown };

const parseArgs = (argv: string[]) => {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const rawLimit = get('--limit');
  const limit = rawLimit ? Number(rawLimit) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`--limit doit être un entier positif (reçu : ${rawLimit})`);
  }
  const rawSince = get('--since');
  if (rawSince && Number.isNaN(Date.parse(rawSince))) {
    throw new Error(`--since doit être une date ISO valide (reçu : ${rawSince})`);
  }
  return { dryRun: argv.includes('--dry-run'), limit, since: rawSince };
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
};

// --- Asana ------------------------------------------------------------------

const asanaFetch = async (path: string, pat: string, init?: RequestInit) => {
  const response = await fetch(`${ASANA_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Asana ${init?.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`);
  }
  return response.json();
};

/**
 * Récupère les tâches non terminées du projet. `completed_since=now` est l'idiome Asana
 * pour "uniquement les tâches ouvertes" — on ne recrée donc pas d'issue pour un retour
 * déjà traité côté Asana.
 */
const fetchOpenTasks = async (pat: string, projectGid: string): Promise<AsanaTask[]> => {
  const fields = 'name,notes,permalink_url,created_at,completed,assignee.name,tags.name';
  const tasks: AsanaTask[] = [];
  let path: string | null =
    `/tasks?project=${projectGid}&completed_since=now&opt_fields=${fields}&limit=100`;

  while (path) {
    const page = await asanaFetch(path, pat);
    tasks.push(...(page.data as AsanaTask[]));
    const offset = page.next_page?.offset;
    path = offset
      ? `/tasks?project=${projectGid}&completed_since=now&opt_fields=${fields}&limit=100&offset=${offset}`
      : null;
  }
  return tasks.filter((task) => !task.completed);
};

const commentOnAsanaTask = (pat: string, taskGid: string, text: string) =>
  asanaFetch(`/tasks/${taskGid}/stories`, pat, {
    method: 'POST',
    body: JSON.stringify({ data: { text } }),
  });

// --- GitHub -----------------------------------------------------------------

const githubFetch = async (path: string, token: string, init?: RequestInit) => {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${init?.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`);
  }
  return response.json();
};

/** Crée les labels manquants, pour ne pas dépendre du comportement implicite de l'API. */
const ensureLabels = async (token: string, repo: string) => {
  for (const label of LABELS) {
    const response = await fetch(`${GITHUB_API}/repos/${repo}/labels/${label.name}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (response.ok) continue;
    if (response.status !== 404) {
      throw new Error(`GitHub GET label ${label.name} → ${response.status} ${await response.text()}`);
    }
    await githubFetch(`/repos/${repo}/labels`, token, {
      method: 'POST',
      body: JSON.stringify(label),
    });
    console.log(`🏷️  Label créé : ${label.name}`);
  }
};

const marker = (gid: string) => `<!-- asana-gid:${gid} -->`;

/** GID Asana déjà synchronisés, lus depuis les marqueurs des issues portant le label `asana`. */
const fetchSyncedGids = async (token: string, repo: string): Promise<Set<string>> => {
  const gids = new Set<string>();
  for (let page = 1; ; page++) {
    const issues: GithubIssue[] = await githubFetch(
      `/repos/${repo}/issues?labels=asana&state=all&per_page=100&page=${page}`,
      token,
    );
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const match = issue.body?.match(/<!-- asana-gid:(\d+) -->/);
      if (match) gids.add(match[1]);
    }
    if (issues.length < 100) return gids;
  }
};

const buildIssueBody = (task: AsanaTask): string => {
  const notes = task.notes?.trim() || '_Aucune description fournie dans Asana._';
  const assignee = task.assignee?.name ?? 'non assigné';
  return [
    notes,
    '',
    '---',
    '',
    `**Source Asana** : ${task.permalink_url}`,
    `**Assigné à** : ${assignee}`,
    `**Créé le** : ${task.created_at.slice(0, 10)}`,
    '',
    'Pose le label `claude:fix` sur cette issue pour que Claude Code propose un correctif en PR draft.',
    '',
    marker(task.gid),
  ].join('\n');
};

// --- Orchestration ----------------------------------------------------------

const main = async () => {
  const { dryRun, limit, since } = parseArgs(process.argv.slice(2));
  const pat = requireEnv('ASANA_PAT');
  const projectGid = requireEnv('ASANA_PROJECT_GID');
  const token = requireEnv('GITHUB_TOKEN');
  const repo = requireEnv('GITHUB_REPOSITORY');
  const tagFilter = process.env.ASANA_TAG_FILTER?.trim().toLowerCase();

  const [tasks, syncedGids] = await Promise.all([
    fetchOpenTasks(pat, projectGid),
    fetchSyncedGids(token, repo),
  ]);
  console.log(`📋 ${tasks.length} tâches ouvertes dans Asana, ${syncedGids.size} déjà synchronisées.`);

  let candidates = tasks.filter((task) => !syncedGids.has(task.gid));
  if (tagFilter) {
    candidates = candidates.filter((task) =>
      task.tags?.some((tag) => tag.name.toLowerCase() === tagFilter),
    );
    console.log(`🔖 Filtre tag "${tagFilter}" : ${candidates.length} tâches retenues.`);
  }
  if (since) {
    const threshold = Date.parse(since);
    candidates = candidates.filter((task) => Date.parse(task.created_at) >= threshold);
    console.log(`📅 Filtre --since ${since} : ${candidates.length} tâches retenues.`);
  }

  if (candidates.length === 0) {
    console.log('✅ Rien à synchroniser.');
    return;
  }

  const skipped = Math.max(0, candidates.length - limit);
  const batch = candidates.slice(0, limit);
  if (skipped > 0) {
    console.log(`⚠️  ${skipped} tâches au-delà de --limit ${limit}, elles passeront au prochain run.`);
  }

  if (dryRun) {
    console.log(`\n🔍 Dry-run — ${batch.length} issues seraient créées :`);
    for (const task of batch) console.log(`   • ${task.name} (${task.permalink_url})`);
    return;
  }

  await ensureLabels(token, repo);

  for (const task of batch) {
    const issue: GithubIssue = await githubFetch(`/repos/${repo}/issues`, token, {
      method: 'POST',
      body: JSON.stringify({
        title: task.name.slice(0, 250),
        body: buildIssueBody(task),
        labels: LABELS.map((label) => label.name),
      }),
    });
    console.log(`✅ Issue #${issue.number} créée — ${task.name}`);

    // Le commentaire Asana est un confort, pas la source d'idempotence : s'il échoue,
    // l'issue existe déjà et son marqueur empêchera tout doublon au prochain run.
    try {
      await commentOnAsanaTask(pat, task.gid, `Issue GitHub créée : ${issue.html_url}`);
    } catch (error) {
      console.warn(`⚠️  Commentaire Asana impossible sur ${task.gid} :`, error);
    }
  }

  console.log(`\n🎉 ${batch.length} issues créées.`);
};

main().catch((error) => {
  console.error('❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
