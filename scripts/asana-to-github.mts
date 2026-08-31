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
 *   ASANA_TAG_FILTER            ne synchronise que les tâches portant ce tag (ex. "bug")
 *   SUPABASE_URL                projet Supabase hébergeant le bucket des pièces jointes
 *   SUPABASE_SERVICE_ROLE_KEY   clé d'écriture sur ce bucket
 *
 * Sans les deux variables Supabase, la synchro fonctionne toujours : les images
 * apparaissent alors comme des liens vers Asana au lieu d'aperçus inline.
 */

const ASANA_API = 'https://app.asana.com/api/1.0';
const GITHUB_API = 'https://api.github.com';

/** Plafond de sécurité : évite qu'un premier run sur un projet chargé n'ouvre 200 issues. */
const DEFAULT_LIMIT = 10;

/**
 * Les images sont recopiées dans un bucket Supabase public (voir la migration
 * `..._asana_attachments_storage_bucket.sql`) plutôt que liées directement à Asana :
 * le `download_url` d'Asana est une URL signée qui expire au bout d'environ une heure,
 * et le dépôt étant privé, GitHub ne rend une image que depuis une URL lisible sans
 * authentification par son proxy.
 */
const ATTACHMENT_BUCKET = 'asana-attachments';

/** Garde-fous : une vidéo de 200 Mo jointe à une tâche ne doit pas faire tomber le run. */
const MAX_ATTACHMENTS_PER_TASK = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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

type AsanaAttachment = {
  gid: string;
  name: string;
  download_url: string | null;
  permanent_url: string | null;
};

/** Une pièce jointe prête à être rendue : soit une image recopiée, soit un simple lien. */
type RenderedAttachment = { name: string; imageUrl?: string; linkUrl?: string };

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

const fetchAttachments = async (pat: string, taskGid: string): Promise<AsanaAttachment[]> => {
  const page = await asanaFetch(
    `/attachments?parent=${taskGid}&opt_fields=name,download_url,permanent_url&limit=100`,
    pat,
  );
  return page.data as AsanaAttachment[];
};

// --- Pièces jointes ---------------------------------------------------------

/** Rend un nom de fichier utilisable comme clé d'objet Supabase. */
const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(-80);

/**
 * Recopie une image d'Asana vers le bucket Supabase et renvoie son URL publique.
 * Renvoie null si ce n'est pas une image, si elle dépasse le plafond, ou si le
 * stockage n'est pas configuré — l'appelant retombe alors sur un lien Asana.
 */
const mirrorImage = async (
  attachment: AsanaAttachment,
  taskGid: string,
  supabase: { url: string; serviceKey: string } | null,
): Promise<string | null> => {
  if (!supabase || !attachment.download_url) return null;

  // Le download_url est une URL signée servie par le stockage d'Asana : on la requête
  // sans en-tête d'autorisation, pour ne pas exposer le PAT à un hôte tiers.
  const source = await fetch(attachment.download_url);
  if (!source.ok) {
    console.warn(`⚠️  Téléchargement impossible (${source.status}) : ${attachment.name}`);
    return null;
  }

  const contentType = source.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) return null;

  const declaredSize = Number(source.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_ATTACHMENT_BYTES) {
    console.warn(`⚠️  ${attachment.name} dépasse ${MAX_ATTACHMENT_BYTES / 1024 / 1024} Mo, ignorée.`);
    return null;
  }

  const bytes = await source.arrayBuffer();
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    console.warn(`⚠️  ${attachment.name} dépasse le plafond une fois téléchargée, ignorée.`);
    return null;
  }

  const path = `${taskGid}/${attachment.gid}-${slugify(attachment.name)}`;
  const upload = await fetch(
    `${supabase.url}/storage/v1/object/${ATTACHMENT_BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabase.serviceKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: bytes,
    },
  );

  if (!upload.ok) {
    console.warn(`⚠️  Upload Supabase échoué (${upload.status}) : ${await upload.text()}`);
    return null;
  }

  return `${supabase.url}/storage/v1/object/public/${ATTACHMENT_BUCKET}/${path}`;
};

const renderAttachments = async (
  pat: string,
  taskGid: string,
  supabase: { url: string; serviceKey: string } | null,
): Promise<RenderedAttachment[]> => {
  const attachments = (await fetchAttachments(pat, taskGid)).slice(0, MAX_ATTACHMENTS_PER_TASK);
  const rendered: RenderedAttachment[] = [];

  for (const attachment of attachments) {
    const imageUrl = await mirrorImage(attachment, taskGid, supabase);
    // Sans image exploitable, on garde au moins un lien vers la pièce jointe d'origine.
    rendered.push(
      imageUrl
        ? { name: attachment.name, imageUrl }
        : { name: attachment.name, linkUrl: attachment.permanent_url ?? undefined },
    );
  }
  return rendered;
};

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

const buildIssueBody = (task: AsanaTask, attachments: RenderedAttachment[]): string => {
  const notes = task.notes?.trim() || '_Aucune description fournie dans Asana._';
  const assignee = task.assignee?.name ?? 'non assigné';

  const attachmentLines = attachments.flatMap((attachment) => {
    if (attachment.imageUrl) return [`![${attachment.name}](${attachment.imageUrl})`, ''];
    if (attachment.linkUrl) return [`- [${attachment.name}](${attachment.linkUrl}) _(à ouvrir dans Asana)_`];
    return [`- ${attachment.name} _(non récupérable)_`];
  });

  return [
    notes,
    ...(attachmentLines.length > 0 ? ['', '## Pièces jointes', '', ...attachmentLines] : []),
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

  // Sans stockage configuré, la synchro continue : les images deviennent de simples
  // liens Asana au lieu d'aperçus inline. C'est dégradé, pas cassé.
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = supabaseUrl && supabaseKey ? { url: supabaseUrl, serviceKey: supabaseKey } : null;
  if (!supabase) {
    console.warn('⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents : les images ne seront pas recopiées.');
  }

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
    for (const task of batch) {
      // Lecture seule : on compte les pièces jointes sans rien télécharger ni uploader.
      const count = (await fetchAttachments(pat, task.gid)).length;
      const suffix = count > 0 ? ` — ${count} pièce(s) jointe(s)` : '';
      console.log(`   • ${task.name} (${task.permalink_url})${suffix}`);
    }
    return;
  }

  await ensureLabels(token, repo);

  for (const task of batch) {
    const attachments = await renderAttachments(pat, task.gid, supabase);
    const mirrored = attachments.filter((a) => a.imageUrl).length;

    const issue: GithubIssue = await githubFetch(`/repos/${repo}/issues`, token, {
      method: 'POST',
      body: JSON.stringify({
        title: task.name.slice(0, 250),
        body: buildIssueBody(task, attachments),
        labels: LABELS.map((label) => label.name),
      }),
    });
    const suffix = attachments.length > 0 ? ` (${mirrored}/${attachments.length} images recopiées)` : '';
    console.log(`✅ Issue #${issue.number} créée — ${task.name}${suffix}`);

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
