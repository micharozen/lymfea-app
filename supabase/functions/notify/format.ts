/** Date compacte « jeu. 10 sept. », en français : la PWA praticien n'est pas traduite. */
export function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Heure « HH:MM » depuis un `time` Postgres (« HH:MM:SS »). */
export function shortTime(timeStr: string | null | undefined): string {
  return String(timeStr ?? "").substring(0, 5);
}

/**
 * Créneau annoncé au praticien.
 *
 * Quand l'ancien créneau est connu, on montre le déplacement plutôt que le seul
 * résultat : « 10 sept. 14:00 → 16:00 » se lit d'un coup d'œil sur l'écran de
 * verrouillage, là où « 10 sept. à 16:00 » oblige à rouvrir l'app pour savoir
 * ce qui a bougé. La date n'est répétée que si elle a changé.
 */
export function slotTransition(
  previous: { date?: string; time?: string } | null,
  next: { date: string; time: string },
): string {
  const nextDate = shortDate(next.date);
  const nextTime = shortTime(next.time);

  if (!previous?.date || !previous?.time) {
    return `${nextDate} à ${nextTime}`;
  }

  const prevDate = shortDate(previous.date);
  const prevTime = shortTime(previous.time);
  const dateChanged = previous.date !== next.date;
  const timeChanged = prevTime !== nextTime;

  if (!dateChanged && !timeChanged) {
    return `${nextDate} à ${nextTime}`;
  }
  if (!dateChanged) {
    return `${nextDate} ${prevTime} → ${nextTime}`;
  }
  return `${prevDate} ${prevTime} → ${nextDate} ${nextTime}`;
}
