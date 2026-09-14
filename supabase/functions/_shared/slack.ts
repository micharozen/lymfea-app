/**
 * Publication sur un webhook entrant Slack.
 * Ne lève jamais : Slack est une notification best-effort, jamais bloquante.
 */
export async function postSlackMessage(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return { ok: false, error: `${res.status} ${await res.text()}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
