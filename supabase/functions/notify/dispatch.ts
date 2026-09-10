import { clientNotificationType, therapistMessage } from "./events.ts";
import { resolveClientChannels, resolveTherapists } from "./recipients.ts";
import type { Channel, DeliveryResult, NotifyContext, NotifyEvent } from "./types.ts";

/**
 * Praticiens : notification in-app (persistée) + push OneSignal.
 *
 * Le push part par `send-push-notification`, seule détentrice des credentials
 * OneSignal et fermée aux appels non service_role.
 */
export async function notifyTherapists(
  event: NotifyEvent,
  ctx: NotifyContext,
  channels: Channel[],
): Promise<DeliveryResult[]> {
  const therapists = await resolveTherapists(ctx);
  if (therapists.length === 0) {
    console.log("[notify] No therapist engaged on this booking");
    return [];
  }

  const message = therapistMessage(event, ctx);
  const results: DeliveryResult[] = [];

  if (channels.includes("in_app")) {
    const { error } = await ctx.supabase.from("notifications").insert(
      therapists.map((t) => ({
        user_id: t.user_id,
        booking_id: ctx.booking.id,
        type: event,
        message: message.long,
      })),
    );
    results.push({
      audience: "therapists",
      channel: "in_app",
      sent: error ? 0 : therapists.length,
      error: error?.message,
    });
    if (error) console.error("[notify] In-app notification error:", error);
  }

  if (channels.includes("push")) {
    const sentFlags = await Promise.all(
      therapists.map(async (t) => {
        try {
          const { error } = await ctx.supabase.functions.invoke("send-push-notification", {
            body: {
              userId: t.user_id,
              title: message.title,
              body: message.body,
              data: {
                bookingId: ctx.booking.id,
                type: event,
                url: `/pwa/booking/${ctx.booking.id}`,
              },
            },
            headers: { Authorization: `Bearer ${ctx.serviceKey}` },
          });
          if (error) {
            console.error(`[notify] Push error for ${t.first_name}:`, error);
            return false;
          }
          return true;
        } catch (e) {
          console.error(`[notify] Push exception for ${t.first_name}:`, e);
          return false;
        }
      }),
    );
    const sent = sentFlags.filter(Boolean).length;
    results.push({
      audience: "therapists",
      channel: "push",
      sent,
      error: sent === 0 ? "No push delivered" : undefined,
    });
  }

  return results;
}

/**
 * Client : e-mail et SMS.
 *
 * Délégué à `send-booking-notification`, qui porte les gabarits, la mise en
 * forme des prix et les garde-fous de paiement. `notify` reste responsable du
 * QUI et du QUAND ; le rendu migrera ici quand les gabarits seront factorisés.
 */
export async function notifyClient(
  event: NotifyEvent,
  ctx: NotifyContext,
  channels: Channel[],
): Promise<DeliveryResult[]> {
  const available = resolveClientChannels(ctx);
  const requested: ("email" | "sms")[] = [];
  if (channels.includes("email") && available.email) requested.push("email");
  if (channels.includes("sms") && available.sms) requested.push("sms");

  if (requested.length === 0) {
    console.log("[notify] No client contact details for requested channels");
    return [];
  }

  const { data, error } = await ctx.supabase.functions.invoke("send-booking-notification", {
    body: {
      bookingId: ctx.booking.id,
      language: ctx.language,
      channels: requested,
      type: clientNotificationType(event),
    },
    headers: { Authorization: `Bearer ${ctx.serviceKey}` },
  });

  if (error) {
    console.error("[notify] Client notification error:", error);
    return requested.map((channel) => ({
      audience: "client" as const,
      channel,
      sent: 0,
      error: error.message ?? "Client notification failed",
    }));
  }

  const sentByChannel: Record<string, boolean> = {
    email: data?.emailSent === true,
    sms: data?.smsSent === true,
  };
  const remoteErrors: string[] = data?.errors ?? [];

  return requested.map((channel) => ({
    audience: "client" as const,
    channel,
    sent: sentByChannel[channel] ? 1 : 0,
    error: sentByChannel[channel]
      ? undefined
      : remoteErrors.find((e) => e.toLowerCase().startsWith(channel)) ?? remoteErrors[0],
  }));
}
