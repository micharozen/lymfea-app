/** Créneau tel que renvoyé par `availability-query`. */
export interface AvailableSlot {
  time: string;
  outOfHours: boolean;
  capacity: number;
}

export interface DateResolution {
  /** Date retenue, ou null si aucune des dates proposées n'est ouvrable. */
  date: string | null;
  /** Dates proposées mais écartées, avec la raison. */
  rejected: Array<{ date: string; reason: "not_deployed" | "no_slot" }>;
  /** true quand le client avait proposé plusieurs dates. */
  hadAlternatives: boolean;
}

/**
 * Choisit, parmi les dates proposées, la première réellement disponible.
 *
 * « Lundi ou mardi » exprime une préférence, pas une équivalence : on tente la
 * première, et on ne se replie sur la suivante que si elle ne peut pas être
 * honorée. Sans cette résolution, l'opérateur devrait vérifier à la main — ce
 * que la demande entrante est justement censée lui éviter.
 *
 * Fonction pure, isolée de la requête de disponibilité pour rester testable
 * depuis le front sans tirer les imports Deno de `availability-query`.
 */
export function pickFirstAvailableDate(
  dates: string[],
  slotsByDate: Map<string, AvailableSlot[]>,
  deployedDates: Set<string>,
): DateResolution {
  const rejected: DateResolution["rejected"] = [];

  for (const date of dates) {
    if (!deployedDates.has(date)) {
      rejected.push({ date, reason: "not_deployed" });
      continue;
    }
    if ((slotsByDate.get(date) ?? []).length === 0) {
      rejected.push({ date, reason: "no_slot" });
      continue;
    }
    return { date, rejected, hadAlternatives: dates.length > 1 };
  }

  return { date: null, rejected, hadAlternatives: dates.length > 1 };
}
