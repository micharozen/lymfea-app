// Petits utilitaires horaires partagés pour placer un accès amenity avant ou
// après un soin. Extraits de SchedulePanel pour être réutilisés par le drawer
// d'upsell et le hook de faisabilité. Toutes les fonctions sont pures.

/** "HH:MM" ou "HH:MM:SS" → minutes depuis minuit. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** minutes → "HH:MM:SS" (bornées sur 24h). */
export function minutesToClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
}

/** Décale un horaire "HH:MM"/"HH:MM:SS" de N minutes, renvoie "HH:MM". */
export function shiftTime(time: string, deltaMin: number): string {
  if (!time) return '';
  const total = ((timeToMinutes(time) + deltaMin) % 1440 + 1440) % 1440;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60)
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Fenêtre "HH:MM – HH:MM" de l'accès amenity selon le placement.
 * - before : l'accès se termine quand le soin commence.
 * - after  : l'accès démarre à la fin des soins.
 */
export function amenityWindow(
  timing: 'before' | 'after',
  soinStartTime: string,
  amenityDuration: number,
  serviceDurationSum: number,
): string {
  const start =
    timing === 'before'
      ? shiftTime(soinStartTime, -amenityDuration)
      : shiftTime(soinStartTime, serviceDurationSum);
  const end = shiftTime(start, amenityDuration);
  return `${start} – ${end}`;
}
