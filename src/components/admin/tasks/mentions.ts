/**
 * Mentions dans un commentaire de tâche.
 *
 * Le corps est stocké tel qu'il se lit — « Peux-tu voir @Marie Dupont ? » —
 * et non sous forme de jeton technique : c'est ce texte que l'auteur a sous
 * les yeux pendant qu'il écrit, et tout jeton y serait illisible.
 *
 * Les destinataires ne sont donc pas déduits du texte à la lecture : ils sont
 * résolus une fois à l'écriture et figés dans `task_comments.mentioned_user_ids`.
 * Un collègue renommé plus tard garde ainsi sa notification ; seule la mise en
 * évidence du nom dans le fil retombe alors en texte simple.
 */

export interface MentionTarget {
  user_id: string;
  first_name: string;
  last_name: string;
}

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; target: MentionTarget };

export function mentionLabel(target: MentionTarget): string {
  return `${target.first_name} ${target.last_name}`.trim();
}

/** Le texte inséré dans le corps : « @Marie Dupont ». */
export function mentionToken(target: MentionTarget): string {
  return `@${mentionLabel(target)}`;
}

/**
 * Découpe le corps en segments de texte et de mentions reconnues.
 *
 * Les libellés les plus longs sont testés en premier : « @Marie Dupont » doit
 * l'emporter sur « @Marie Du », si les deux existent.
 */
export function parseMentions(
  content: string,
  candidates: MentionTarget[],
): MentionSegment[] {
  const tokens = candidates
    .map((target) => ({ token: mentionToken(target), target }))
    .filter(({ token }) => token.length > 1)
    .sort((a, b) => b.token.length - a.token.length);

  const segments: MentionSegment[] = [];
  let text = "";
  let index = 0;

  const flush = () => {
    if (text) {
      segments.push({ type: "text", value: text });
      text = "";
    }
  };

  while (index < content.length) {
    const hit =
      content[index] === "@"
        ? tokens.find(({ token }) => content.startsWith(token, index))
        : undefined;

    if (hit) {
      flush();
      segments.push({
        type: "mention",
        value: mentionLabel(hit.target),
        target: hit.target,
      });
      index += hit.token.length;
      continue;
    }

    text += content[index];
    index += 1;
  }

  flush();
  return segments;
}

/**
 * Destinataires d'un commentaire : tout collègue dont le nom est mentionné,
 * qu'il ait été choisi dans la liste ou saisi à la main.
 *
 * Deux homonymes seraient notifiés tous les deux — le fil ne peut pas les
 * départager, et prévenir une personne de trop vaut mieux qu'en oublier une.
 */
export function collectMentionedUserIds(
  content: string,
  candidates: MentionTarget[],
): string[] {
  const seen = new Set<string>();
  for (const segment of parseMentions(content, candidates)) {
    if (segment.type === "mention") seen.add(segment.target.user_id);
  }
  return [...seen];
}

/**
 * Mention en cours de saisie à la position du curseur : le « @ » le plus
 * proche à gauche, s'il ouvre bien un mot (début de ligne ou espace devant).
 *
 * La requête s'arrête au premier espace : on cherche sur le prénom ou le nom,
 * pas sur les deux — le nom complet, lui, est inséré d'un bloc à la sélection.
 */
export function findActiveMention(
  value: string,
  cursor: number,
): { query: string; start: number; end: number } | null {
  const before = value.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;

  const charBefore = at > 0 ? before[at - 1] : " ";
  if (!/\s/.test(charBefore)) return null;

  const query = before.slice(at + 1);
  if (/\s/.test(query)) return null;

  return { query, start: at, end: cursor };
}

/** Insère « @Prénom Nom » à la place de la saisie, et rend le nouveau curseur. */
export function applyMention(
  value: string,
  range: { start: number; end: number },
  target: MentionTarget,
): { value: string; cursor: number } {
  const token = `${mentionToken(target)} `;
  const next = value.slice(0, range.start) + token + value.slice(range.end);
  return { value: next, cursor: range.start + token.length };
}
