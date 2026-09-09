import type { EventDefinition, NotifyContext, NotifyEvent } from "./types.ts";

/**
 * REGISTRE DES ÉVÉNEMENTS
 *
 * Un événement déclare son public et ses canaux par défaut ; l'appelant se
 * contente de dire ce qui s'est passé. Ajouter une notification, c'est ajouter
 * une entrée ici — pas une edge function.
 *
 * Les événements sont ajoutés au fil de la migration des fonctions `notify-*` /
 * `send-*` existantes vers ce point d'entrée.
 */
export const EVENTS: Record<NotifyEvent, EventDefinition> = {
  // Date, heure ou soins changés après coup : le client doit connaître le
  // nouveau rendez-vous, les praticiens engagés ne doivent pas se déplacer sur
  // l'ancien créneau.
  booking_modified: {
    audiences: ["therapists", "client"],
    channels: ["email", "sms", "push", "in_app"],
    skipStatuses: ["cancelled", "draft", "completed", "no_show", "noshow"],
  },
};

/** Champs de la réservation modifiés, tels que transmis par l'appelant. */
interface ChangeFlags {
  date?: boolean;
  time?: boolean;
  treatments?: boolean;
}

function changeSummary(context: Record<string, unknown>): string {
  const changes = (context.changes ?? {}) as ChangeFlags;
  const parts: string[] = [];
  if (changes.date) parts.push("date");
  if (changes.time) parts.push("horaire");
  if (changes.treatments) parts.push("soins");
  return parts.length > 0 ? parts.join(", ") : "détails";
}

/**
 * Message destiné aux praticiens (push et notification in-app).
 *
 * En français : la PWA praticien n'est pas traduite, et les notifications
 * existantes suivent déjà cette convention.
 */
export function therapistMessage(
  event: NotifyEvent,
  ctx: NotifyContext,
): { title: string; body: string; long: string } {
  const { booking, shortDate, time } = ctx;
  const venue = booking.hotel_name ?? "";

  switch (event) {
    case "booking_modified": {
      return {
        title: "🔄 Réservation modifiée",
        body: `#${booking.booking_id} · ${shortDate} à ${time} · ${venue}`,
        long: `🔄 Réservation #${booking.booking_id} modifiée (${changeSummary(ctx.context)}) · ${shortDate} à ${time} · ${venue}`,
      };
    }
  }
}

/** Type de notification client attendu par `send-booking-notification`. */
export function clientNotificationType(event: NotifyEvent): string {
  switch (event) {
    case "booking_modified":
      return "modification";
  }
}
