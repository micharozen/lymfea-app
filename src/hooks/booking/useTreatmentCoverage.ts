import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  useVenuesTreatmentMenus,
  type VenueTreatmentMenu,
} from "@/hooks/useVenueTreatmentMenus";
import { parseShifts, timeToMinutes } from "./useTherapistDayPlanning";
import {
  compareTherapists,
  useVenueTherapists,
  type TherapistLite,
} from "./useVenueTherapists";

/** PostgREST plafonne une réponse à 1000 lignes ; sans filtre de lieu on dépasse vite. */
const PAGE_SIZE = 1000;

/** Statut d'un thérapeute qualifié sur un jour donné. */
export interface TherapistDayStatus {
  present: boolean;
  /** « 9h–17h », ou null si absent / non planifié. */
  shiftLabel: string | null;
  reason: "absent" | "no_schedule" | null;
}

export interface TreatmentCoverageCell {
  date: string;
  /** La prestation est proposée ce jour-là (`available_days`). */
  offered: boolean;
  /** X : qualifiés ET présents. */
  availableTherapists: TherapistLite[];
}

export interface TreatmentCoverageRow {
  treatment: VenueTreatmentMenu;
  venueId: string;
  venueName: string;
  /** Y : qualifiés, indépendamment de la date. */
  qualifiedTherapists: TherapistLite[];
  cells: TreatmentCoverageCell[];
  /** Jour → statut, pour chaque thérapeute qualifié (ligne dépliée). */
  statusByTherapist: Map<string, Map<string, TherapistDayStatus>>;
  /** Cellules proposées sans aucun thérapeute disponible. */
  gapCount: number;
}

export interface TreatmentCoverage {
  rows: TreatmentCoverageRow[];
  days: Date[];
  /** Lignes présentant au moins un trou. */
  totalGaps: number;
  isLoading: boolean;
}

interface UseTreatmentCoverageOptions {
  /** Lieux visibles par l'utilisateur — déjà chargés par la page, pas de requête en plus. */
  venues: { id: string; name: string }[];
  startDate: Date;
  dayCount: number;
  enabled?: boolean;
}

function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Couverture des prestations : pour chaque prestation de chaque lieu et chaque
 * jour de la période, combien de thérapeutes qualifiés sont réellement présents.
 *
 * Les deux règles structurantes sont reprises telles quelles du moteur
 * d'attribution — diverger ici signalerait des trous que le picker accepte :
 *
 *   - qualification : un thérapeute *sans aucune* ligne `therapist_treatments`
 *     est polyvalent, mais seulement sur les lieux où il est rattaché ; dès
 *     qu'il en a une, seules les prestations listées comptent
 *     (cf. `isQualifiedFor` dans useTherapistDayPlanning).
 *   - présence : strictement déclarative, une journée sans ligne
 *     `therapist_availability` vaut « indisponible » et non « ouvert »
 *     (cf. useAvailableTherapistsForSlot).
 *
 * La vue mesure une couverture en compétences, pas une réservabilité : salles,
 * buffers et charge de travail sont volontairement ignorés.
 */
export function useTreatmentCoverage({
  venues,
  startDate,
  dayCount,
  enabled = true,
}: UseTreatmentCoverageOptions): TreatmentCoverage {
  const venueIds = useMemo(() => venues.map((v) => v.id), [venues]);
  const venueNames = useMemo(
    () => new Map(venues.map((v) => [v.id, v.name])),
    [venues],
  );

  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(startDate, i)),
    [startDate, dayCount],
  );
  const dayKeys = useMemo(() => days.map((d) => format(d, "yyyy-MM-dd")), [days]);
  const fromDate = dayKeys[0];
  const toDate = dayKeys[dayKeys.length - 1];

  const activeVenueIds = enabled ? venueIds : [];

  const { data: menus, isLoading: isLoadingMenus } =
    useVenuesTreatmentMenus(activeVenueIds);
  const { data: therapistLinks, isLoading: isLoadingTherapists } =
    useVenueTherapists(activeVenueIds);

  const therapistIds = useMemo(() => {
    const ids = new Set((therapistLinks ?? []).map((l) => l.therapist.id));
    return [...ids].sort();
  }, [therapistLinks]);

  const { data: qualifications, isLoading: isLoadingQualifications } = useQuery({
    queryKey: ["treatment-coverage", "qualifications", therapistIds],
    enabled: therapistIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const rows: { therapist_id: string; treatment_menu_id: string }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("therapist_treatments")
          .select("therapist_id, treatment_menu_id")
          .in("therapist_id", therapistIds)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE_SIZE) break;
      }
      return rows;
    },
  });

  const { data: availabilities, isLoading: isLoadingAvailabilities } = useQuery({
    queryKey: ["treatment-coverage", "availability", therapistIds, fromDate, toDate],
    enabled: therapistIds.length > 0 && !!fromDate && !!toDate,
    staleTime: 30_000,
    queryFn: async () => {
      const rows: {
        therapist_id: string;
        date: string;
        is_available: boolean;
        shifts: unknown;
      }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("therapist_availability")
          .select("therapist_id, date, is_available, shifts")
          .in("therapist_id", therapistIds)
          .gte("date", fromDate)
          .lte("date", toDate)
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE_SIZE) break;
      }
      return rows;
    },
  });

  return useMemo<TreatmentCoverage>(() => {
    const isLoading =
      enabled &&
      (isLoadingMenus ||
        isLoadingTherapists ||
        isLoadingQualifications ||
        isLoadingAvailabilities);

    // Thérapeutes rattachés à chaque lieu.
    const therapistsByVenue = new Map<string, Map<string, TherapistLite>>();
    for (const link of therapistLinks ?? []) {
      const team = therapistsByVenue.get(link.hotelId) ?? new Map<string, TherapistLite>();
      team.set(link.therapist.id, link.therapist);
      therapistsByVenue.set(link.hotelId, team);
    }

    // Qualification : prestations déclarées par thérapeute. Un thérapeute absent
    // de cette map n'a aucune ligne — il est polyvalent sur ses lieux.
    const declaredByTherapist = new Map<string, Set<string>>();
    for (const row of qualifications ?? []) {
      const owned = declaredByTherapist.get(row.therapist_id) ?? new Set<string>();
      owned.add(row.treatment_menu_id);
      declaredByTherapist.set(row.therapist_id, owned);
    }

    // Présence : (therapist, date) → statut. Absence de clé = non planifié.
    const statusByKey = new Map<string, TherapistDayStatus>();
    for (const row of availabilities ?? []) {
      if (!row.is_available) {
        statusByKey.set(`${row.therapist_id}|${row.date}`, {
          present: false,
          shiftLabel: null,
          reason: "absent",
        });
        continue;
      }
      const shifts = parseShifts(row.shifts);
      // Disponible sans détail de shift = journée entière, comme le picker.
      const shiftLabel =
        shifts.length === 0
          ? null
          : shifts
              .map(
                (s) =>
                  `${minutesToLabel(timeToMinutes(s.start))}–${minutesToLabel(
                    timeToMinutes(s.end),
                  )}`,
              )
              .join(", ");
      statusByKey.set(`${row.therapist_id}|${row.date}`, {
        present: true,
        shiftLabel,
        reason: null,
      });
    }

    const statusFor = (therapistId: string, date: string): TherapistDayStatus =>
      statusByKey.get(`${therapistId}|${date}`) ?? {
        present: false,
        shiftLabel: null,
        reason: "no_schedule",
      };

    const rows: TreatmentCoverageRow[] = [];

    for (const treatment of menus ?? []) {
      const venueId = treatment.hotel_id;
      if (!venueId) continue;
      const team = therapistsByVenue.get(venueId);
      if (!team) {
        // Lieu sans aucun thérapeute rattaché : la prestation reste listée, à zéro.
        rows.push({
          treatment,
          venueId,
          venueName: venueNames.get(venueId) ?? "",
          qualifiedTherapists: [],
          cells: dayKeys.map((date) => ({
            date,
            offered: isOffered(treatment, date),
            availableTherapists: [],
          })),
          statusByTherapist: new Map(),
          gapCount: dayKeys.filter((date) => isOffered(treatment, date)).length,
        });
        continue;
      }

      const qualifiedTherapists = [...team.values()]
        .filter((therapist) => {
          const declared = declaredByTherapist.get(therapist.id);
          // Aucune déclaration = polyvalent sur ce lieu.
          if (!declared || declared.size === 0) return true;
          return declared.has(treatment.id);
        })
        .sort(compareTherapists);

      const statusByTherapist = new Map<string, Map<string, TherapistDayStatus>>();
      for (const therapist of qualifiedTherapists) {
        const perDay = new Map<string, TherapistDayStatus>();
        for (const date of dayKeys) perDay.set(date, statusFor(therapist.id, date));
        statusByTherapist.set(therapist.id, perDay);
      }

      let gapCount = 0;
      const cells = dayKeys.map((date) => {
        const offered = isOffered(treatment, date);
        const availableTherapists = qualifiedTherapists.filter(
          (therapist) => statusByTherapist.get(therapist.id)?.get(date)?.present,
        );
        if (offered && availableTherapists.length === 0) gapCount++;
        return { date, offered, availableTherapists };
      });

      rows.push({
        treatment,
        venueId,
        venueName: venueNames.get(venueId) ?? "",
        qualifiedTherapists,
        cells,
        statusByTherapist,
        gapCount,
      });
    }

    // Lieu, puis catégorie, puis nom : deux lieux proposant le même soin restent
    // deux lignes distinctes, chacune avec son équipe.
    rows.sort(
      (a, b) =>
        a.venueName.localeCompare(b.venueName) ||
        a.treatment.category.localeCompare(b.treatment.category) ||
        a.treatment.name.localeCompare(b.treatment.name),
    );

    return {
      rows,
      days,
      totalGaps: rows.filter((row) => row.gapCount > 0).length,
      isLoading,
    };
  }, [
    enabled,
    menus,
    venueNames,
    therapistLinks,
    qualifications,
    availabilities,
    dayKeys,
    days,
    isLoadingMenus,
    isLoadingTherapists,
    isLoadingQualifications,
    isLoadingAvailabilities,
  ]);
}

/**
 * `available_days` liste les jours d'ouverture (0 = dimanche) ; `null` ou vide = tous,
 * même convention que `resolveAvailableDays` et le panier client.
 *
 * On raisonne au niveau de la prestation, pas de ses variantes : une variante
 * peut restreindre davantage, mais la prestation reste proposée ce jour-là.
 */
function isOffered(treatment: VenueTreatmentMenu, date: string): boolean {
  const days = treatment.available_days;
  if (!days || days.length === 0) return true;
  // `date` est un yyyy-MM-dd local : parser en UTC décalerait d'un jour.
  const [y, m, d] = date.split("-").map(Number);
  return days.includes(new Date(y, m - 1, d).getDay());
}
