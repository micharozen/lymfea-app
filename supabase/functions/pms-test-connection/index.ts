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

    const { hotelId } = await req.json();

    if (!hotelId) {
      return new Response(
        JSON.stringify({ connected: false, error: 'hotelId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('[pms-test-connection] Testing for hotel:', hotelId);

    const { data: pmsConfig, error: configError } = await supabase
      .from('hotel_pms_configs')
      .select('*')
      .eq('hotel_id', hotelId)
      .single();

    if (configError || !pmsConfig) {
      console.error('[pms-test-connection] PMS config not found:', configError);
      return new Response(
        JSON.stringify({ connected: false, error: 'PMS configuration not found for this hotel' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const pmsType = pmsConfig.pms_type;
    const config = buildPmsConfigFromRow(pmsType, pmsConfig);
    const client = getPmsClient(pmsType, config);
    const result = await client.testConnection();

    console.log('[pms-test-connection] Result:', result);

    // Persist connection status
    await supabase
      .from('hotel_pms_configs')
      .update({
        connection_status: result.connected ? 'connected' : 'failed',
        ...(result.connected ? { connection_verified_at: new Date().toISOString() } : {}),
      })
      .eq('hotel_id', hotelId);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[pms-test-connection] Error:', error);
    return new Response(
      JSON.stringify({ connected: false, error: error.message || 'Unexpected error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
