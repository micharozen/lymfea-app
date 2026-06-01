import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveVerifiedPmsGuest } from "../_shared/pms-verify.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Public endpoint for the client booking flow. Given a room number + last name,
// it tells the browser ONLY whether they match a current reservation in the PMS.
// It never returns guest PII (name, email, phone) — that stays server-side and is
// fetched at booking creation time. This prevents room-number enumeration from
// harvesting guest contact details or impersonating a guest.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { hotelId, roomNumber, lastName } = await req.json();

    if (!hotelId || !roomNumber || !lastName) {
      return new Response(
        JSON.stringify({ verified: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log('[pms-guest-verify] Verify hotel:', hotelId, 'room:', roomNumber);

    const guest = await resolveVerifiedPmsGuest(supabase, hotelId, roomNumber, lastName);

    return new Response(
      JSON.stringify({ verified: !!guest }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[pms-guest-verify] Error:', error);
    // Silently return not verified on any error (graceful degradation)
    return new Response(
      JSON.stringify({ verified: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
