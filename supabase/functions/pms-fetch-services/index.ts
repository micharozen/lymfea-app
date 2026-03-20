import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildPmsConfigFromRow } from "../_shared/pms-client.ts";
import { fetchMewsServices } from "../_shared/mews.ts";
import type { MewsConfig } from "../_shared/mews.ts";

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
        JSON.stringify({ services: [], error: 'hotelId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('[pms-fetch-services] Fetching for hotel:', hotelId);

    const { data: pmsConfig, error: configError } = await supabase
      .from('hotel_pms_configs')
      .select('*')
      .eq('hotel_id', hotelId)
      .single();

    if (configError || !pmsConfig) {
      return new Response(
        JSON.stringify({ services: [], error: 'PMS configuration not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (pmsConfig.pms_type !== 'mews') {
      return new Response(
        JSON.stringify({ services: [], error: 'Fetch services is only supported for Mews' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const config = buildPmsConfigFromRow('mews', pmsConfig) as MewsConfig;
    const services = await fetchMewsServices(config);

    return new Response(
      JSON.stringify({ services }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('[pms-fetch-services] Error:', error);
    return new Response(
      JSON.stringify({ services: [], error: error.message || 'Unexpected error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
