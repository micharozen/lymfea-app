import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getPmsClient, buildPmsConfigFromRow } from "../_shared/pms-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { hotelId, roomNumber } = await req.json();

    if (!hotelId || !roomNumber) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log('[pms-guest-lookup] Lookup for hotel:', hotelId, 'room:', roomNumber);

    // Quick check: is guest lookup enabled for this hotel?
    const { data: hotel } = await supabase
      .from('hotels')
      .select('pms_guest_lookup_enabled')
      .eq('id', hotelId)
      .single();

    if (!hotel?.pms_guest_lookup_enabled) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Load PMS config
    const { data: pmsConfig, error: configError } = await supabase
      .from('hotel_pms_configs')
      .select('*')
      .eq('hotel_id', hotelId)
      .single();

    if (configError || !pmsConfig) {
      console.error('[pms-guest-lookup] PMS config not found:', configError);
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const pmsType = pmsConfig.pms_type;
    const config = buildPmsConfigFromRow(pmsType, pmsConfig);
    const client = getPmsClient(pmsType, config);
    const guest = await client.lookupGuestByRoom(roomNumber);

    if (!guest) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Return guest info (excluding reservationId — kept server-side only)
    return new Response(
      JSON.stringify({
        found: true,
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

  } catch (error: any) {
    console.error('[pms-guest-lookup] Error:', error);
    // Silently return not found on any error (graceful degradation)
    return new Response(
      JSON.stringify({ found: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
