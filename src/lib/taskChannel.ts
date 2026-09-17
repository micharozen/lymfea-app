import type { TaskChannel } from "@/hooks/tasks/useTasks";

/**
 * Traduit le canal d'arrivée d'une demande en `bookings.source`.
 *
 * Les deux domaines ne se recouvrent pas : `channel` dit par où le client a
 * écrit, `source` dit d'où vient la saisie de la réservation. Le mapping est
 * donc explicite, et tout canal sans équivalent retombe sur "admin" — une
 * réservation créée par un opérateur depuis l'admin.
 */
const CHANNEL_TO_SOURCE: Partial<Record<TaskChannel, string>> = {
  phone: "phone",
  email: "email",
  website: "client",
};

export function channelToBookingSource(channel: TaskChannel | null | undefined): string {
  if (!channel) return "admin";
  return CHANNEL_TO_SOURCE[channel] ?? "admin";
}
