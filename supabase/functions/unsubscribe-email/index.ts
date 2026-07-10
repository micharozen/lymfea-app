import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * RFC 8058 one-click unsubscribe endpoint, targeted by the `List-Unsubscribe`
 * header of the checkout reminder emails.
 *
 * Gmail and Yahoo POST here directly, without ever loading the React page, and
 * only look at the status code. The human-facing `/unsubscribe` page in the app
 * calls the same `unsubscribe_email` RPC.
 *
 * A GET is answered with a redirect to that page rather than an opt-out: mailbox
 * security scanners pre-fetch links with GET, and would otherwise unsubscribe
 * guests who never clicked anything.
 */
serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token");
  const appUrl = Deno.env.get("PUBLIC_APP_URL") ?? "";

  if (req.method === "GET") {
    return Response.redirect(`${appUrl}/unsubscribe?token=${token ?? ""}`, 302);
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error } = await supabase.rpc("unsubscribe_email", { _token: token });
    if (error) throw error;

    // An unknown token returns `false`, not an error: we answer 200 either way so
    // the endpoint never confirms whether an address is known to us.
    return new Response("OK", { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[UNSUBSCRIBE] Failed:", message);
    return new Response("Internal error", { status: 500 });
  }
});
