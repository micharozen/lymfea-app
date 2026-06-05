import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { resolveVerifiedPmsGuest } from "../_shared/pms-verify.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
};

// INTERNAL, service-to-service only. Returns verified guest PII (name, email, phone)
// so the Hono backend (which has no PMS client) can resolve a PMS-verified hotel
// guest during the card flow. Guarded by the service role key — never callable from
// a browser. The public client flow uses `pms-guest-verify` (boolean only) instead.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token || token !== serviceKey) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
    const { hotelId, roomNumber, lastName } = await req.json();

    const guest = await resolveVerifiedPmsGuest(supabase, hotelId, roomNumber, lastName);
    if (!guest) {
      return new Response(
        JSON.stringify({ verified: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({
        verified: true,
        guest: {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email,
          phone: guest.phone,
          checkIn: guest.checkIn,
          checkOut: guest.checkOut,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[pms-resolve-guest] Error:', error);
    return new Response(
      JSON.stringify({ verified: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
