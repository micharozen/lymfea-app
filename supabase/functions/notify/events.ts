import { slotTransition } from "./format.ts";
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
    skipWhenStarted: true,
  },
};

/** Champs de la réservation modifiés, tels que transmis par l'appelant. */
interface ChangeFlags {
  date?: boolean;
  time?: boolean;
  treatments?: boolean;
}

/** Créneau avant modification, quand l'appelant le connaît. */
interface PreviousSlot {
  date?: string;
  time?: string;
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
  const { booking } = ctx;
  const venue = booking.hotel_name ?? "";

  switch (event) {
    case "booking_modified": {
      const changes = (ctx.context.changes ?? {}) as ChangeFlags;
      const previous = (ctx.context.previous ?? null) as PreviousSlot | null;
      // Le créneau porte déjà le déplacement (« 14:00 → 16:00 ») ; ne reste à
      // signaler que ce qu'il ne montre pas.
      const slot = slotTransition(changes.date || changes.time ? previous : null, {
        date: booking.booking_date,
        time: booking.booking_time,
      });
      const detail = changes.treatments ? " · soins modifiés" : "";
      const line = `#${booking.booking_id} · ${slot}${detail} · ${venue}`;

      return {
        title: "🔄 Réservation modifiée",
        body: line,
        long: `🔄 Réservation ${line}`,
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
