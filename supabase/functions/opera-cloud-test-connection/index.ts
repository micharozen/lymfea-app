import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { testOperaConnection } from "../_shared/opera-cloud.ts";

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

    console.log('[opera-cloud-test-connection] Testing for hotel:', hotelId);

    // Load PMS config from dedicated table
    const { data: pmsConfig, error: configError } = await supabase
      .from('hotel_pms_configs')
      .select('*')
      .eq('hotel_id', hotelId)
      .single();

    if (configError || !pmsConfig) {
      console.error('[opera-cloud-test-connection] PMS config not found:', configError);
      return new Response(
        JSON.stringify({ connected: false, error: 'PMS configuration not found for this hotel' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const result = await testOperaConnection({
      gatewayUrl: pmsConfig.gateway_url,
      clientId: pmsConfig.client_id,
      clientSecret: pmsConfig.client_secret,
      appKey: pmsConfig.app_key,
      enterpriseId: pmsConfig.enterprise_id,
      pmsHotelId: pmsConfig.pms_hotel_id,
    });

    console.log('[opera-cloud-test-connection] Result:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[opera-cloud-test-connection] Error:', error);
    return new Response(
      JSON.stringify({ connected: false, error: error.message || 'Unexpected error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
