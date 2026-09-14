import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import type { ClientLanguage } from "../_shared/client-language.ts";

/** Publics destinataires d'une notification. */
export type Audience = "client" | "therapists";

/** Canaux d'envoi. */
export type Channel = "email" | "sms" | "push" | "in_app";

/** Événements métier notifiables. Un événement décrit CE QUI s'est passé ;
 *  le registre décide qui prévenir et par quels canaux. */
export type NotifyEvent = "booking_modified";

export interface NotifyRequest {
  event: NotifyEvent;
  bookingId: string;
  /** Restreint les publics à prévenir. Par défaut : ceux du registre.
   *  Sert à ne pas doubler un public déjà servi par un autre chemin. */
  audiences?: Audience[];
  /** Restreint les canaux. Par défaut : ceux du registre, intersectés avec
   *  ce dont on dispose réellement (e-mail, téléphone, compte praticien). */
  channels?: Channel[];
  /** Force la langue des envois client, sinon résolue depuis la fiche client. */
  language?: ClientLanguage;
  /** Données propres à l'événement (ex. quels champs ont changé). */
  context?: Record<string, unknown>;
}

/** Réservation, chargée une fois et partagée par tous les publics. */
export interface NotifyBooking {
  id: string;
  booking_id: number;
  status: string;
  booking_date: string;
  booking_time: string;
  hotel_id: string;
  hotel_name: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  client_email: string | null;
  phone: string | null;
  therapist_id: string | null;
  language: string | null;
  customer_id: string | null;
  room_number: string | number | null;
  total_price: number | null;
  /** Majoration hors horaires, déjà comprise dans `total_price`. */
  surcharge_amount: number | null;
  is_out_of_hours: boolean | null;
}

/** Tout ce qu'un envoi doit connaître, résolu une seule fois par appel. */
export interface NotifyContext {
  supabase: SupabaseClient;
  serviceKey: string;
  booking: NotifyBooking;
  /** Langue de communication client (jamais celle des praticiens, qui
   *  travaillent en français dans la PWA). */
  language: ClientLanguage;
  /** Date compacte « jeu. 10 sept. », déjà localisée. */
  shortDate: string;
  /** Heure « HH:MM ». */
  time: string;
  context: Record<string, unknown>;
}

/** Résultat d'un envoi, un par (public × canal) réellement tenté. */
export interface DeliveryResult {
  audience: Audience;
  channel: Channel;
  /** Nombre de destinataires servis (un client, N praticiens). */
  sent: number;
  error?: string;
}

/** Description d'un événement : qui prévenir, comment, et quand se taire. */
export interface EventDefinition {
  audiences: Audience[];
  channels: Channel[];
  /** Statuts de réservation pour lesquels l'événement n'a aucun sens. */
  skipStatuses: string[];
  /** Se taire quand le créneau a déjà commencé. Vrai pour tout ce qui annonce
   *  un rendez-vous à venir ; faux pour ce qui porte sur un soin passé
   *  (facture, demande d'avis…). */
  skipWhenStarted: boolean;
}
