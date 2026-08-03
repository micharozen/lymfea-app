import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

/**
 * Blocages ponctuels datés d'un lieu : une plage horaire neutralisée un jour
 * donné, sans booking associé (shooting, maintenance, fermeture exceptionnelle).
 *
 * Stockés dans `venue_blocked_slots` avec `block_date` renseigné — les lignes à
 * `block_date IS NULL` sont les blocages récurrents hebdomadaires, gérés
 * ailleurs (fiche lieu, onglet Déploiement) et volontairement exclus ici.
 *
 * `room_id IS NULL` = tout le lieu. `group_id` regroupe les lignes créées
 * ensemble (plusieurs salles et/ou plusieurs jours) pour l'affichage et la
 * suppression en bloc.
 */
export interface RoomBlockRow {
  id: string;
  group_id: string | null;
  label: string;
  block_date: string;
  start_time: string;
  end_time: string;
  room_id: string | null;
  room_name: string | null;
}

/** Un groupe de lignes créées ensemble, tel que présenté à l'admin. */
export interface RoomBlockGroup {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  /** Noms des salles visées. Vide = tout le lieu. */
  roomNames: string[];
  isWholeVenue: boolean;
  rows: RoomBlockRow[];
}

interface RoomBlocksParams {
  venueId: string | undefined;
  /** Bornes incluses (YYYY-MM-DD). */
  from: string;
  to: string;
}

const toRows = (data: unknown[]): RoomBlockRow[] =>
  (data as Array<RoomBlockRow & { treatment_rooms: { name: string } | null }>).map(
    ({ treatment_rooms, ...row }) => ({ ...row, room_name: treatment_rooms?.name ?? null }),
  );

export function useRoomBlocks({ venueId, from, to }: RoomBlocksParams) {
  return useQuery({
    queryKey: ["room-blocks", venueId, from, to],
    enabled: !!venueId,
    staleTime: 60_000,
    queryFn: async (): Promise<RoomBlockRow[]> => {
      const { data, error } = await supabase
        .from("venue_blocked_slots")
        .select("id, group_id, label, block_date, start_time, end_time, room_id, treatment_rooms(name)")
        .eq("hotel_id", venueId!)
        .eq("is_active", true)
        .not("block_date", "is", null)
        .gte("block_date", from)
        .lte("block_date", to)
        .order("block_date")
        .order("start_time");
      if (error) throw error;
      return toRows(data || []);
    },
  });
}

/**
 * Regroupe les lignes par `group_id` (repli sur l'id pour les lignes créées
 * avant l'introduction du champ) et résume la plage couverte.
 */
export function groupRoomBlocks(rows: RoomBlockRow[]): RoomBlockGroup[] {
  const byKey = new Map<string, RoomBlockRow[]>();
  for (const row of rows) {
    const key = row.group_id ?? row.id;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }

  return [...byKey.entries()]
    .map(([key, groupRows]) => {
      const dates = groupRows.map((r) => r.block_date).sort();
      const roomNames = [
        ...new Set(groupRows.map((r) => r.room_name).filter((n): n is string => !!n)),
      ].sort();
      return {
        key,
        label: groupRows[0].label,
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        startTime: groupRows[0].start_time.substring(0, 5),
        endTime: groupRows[0].end_time.substring(0, 5),
        roomNames,
        isWholeVenue: groupRows.some((r) => r.room_id === null),
        rows: groupRows,
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime));
}

export interface CreateRoomBlockPayload {
  venueId: string;
  label: string;
  /** YYYY-MM-DD, bornes incluses. */
  startDate: string;
  endDate: string;
  /** HH:MM. */
  startTime: string;
  endTime: string;
  /** Vide = tout le lieu (une seule ligne par jour, room_id null). */
  roomIds: string[];
}

/** Expansion (jours × salles) : une ligne par couple, toutes liées par un group_id. */
function expandRows(payload: CreateRoomBlockPayload, groupId: string) {
  const rooms: Array<string | null> = payload.roomIds.length > 0 ? payload.roomIds : [null];
  const rows = [];
  for (
    let day = parseISO(payload.startDate);
    format(day, "yyyy-MM-dd") <= payload.endDate;
    day = addDays(day, 1)
  ) {
    const blockDate = format(day, "yyyy-MM-dd");
    for (const roomId of rooms) {
      rows.push({
        hotel_id: payload.venueId,
        label: payload.label,
        block_date: blockDate,
        start_time: `${payload.startTime}:00`,
        end_time: `${payload.endTime}:00`,
        room_id: roomId,
        group_id: groupId,
        // days_of_week doit rester NULL : la contrainte
        // blocked_slot_dated_xor_recurring interdit de cumuler les deux.
        days_of_week: null,
        is_active: true,
      });
    }
  }
  return rows;
}

export function useCreateRoomBlock() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("admin");

  return useMutation({
    mutationFn: async (payload: CreateRoomBlockPayload) => {
      const rows = expandRows(payload, crypto.randomUUID());
      const { error } = await supabase.from("venue_blocked_slots").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["room-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["venue-availability"] });
      queryClient.invalidateQueries({ queryKey: ["therapist-day-planning"] });
      toast.success(t("roomBlocks.created", { count }));
    },
    onError: (error: Error) => {
      toast.error(t("roomBlocks.createError", { message: error.message }));
    },
  });
}

export function useDeleteRoomBlock() {
  const queryClient = useQueryClient();
  const { t } = useTranslation("admin");

  return useMutation({
    mutationFn: async (group: Pick<RoomBlockGroup, "key" | "rows">) => {
      const ids = group.rows.map((r) => r.id);
      const { error } = await supabase.from("venue_blocked_slots").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["room-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["venue-availability"] });
      queryClient.invalidateQueries({ queryKey: ["therapist-day-planning"] });
      toast.success(t("roomBlocks.deleted"));
    },
    onError: (error: Error) => {
      toast.error(t("roomBlocks.deleteError", { message: error.message }));
    },
  });
}
