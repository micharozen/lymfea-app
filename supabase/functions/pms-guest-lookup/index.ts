import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { getPmsClient, buildPmsConfigFromRow } from "../_shared/pms-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Staff-only: this endpoint returns guest PII (name, email, phone) and must
    // never be public. The client booking flow uses `pms-guest-verify` instead,
    // which only returns a boolean. Require an authenticated admin/concierge.
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let userId: string | undefined;
    try {
      const parts = token?.split('.') ?? [];
      if (parts.length === 3) {
        userId = JSON.parse(atob(parts[1]))?.sub;
      }
    } catch (_e) {
      userId = undefined;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { data: staffRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'concierge'])
      .maybeSingle();

    if (!staffRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden — staff access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

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
