import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SECURITY: Only allow DEV_MODE in non-production environments
const isDevModeAllowed = (): boolean => {
  const siteUrl = Deno.env.get('SITE_URL') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  
  // Block DEV_MODE if running on production domains
  const productionIndicators = [
    'lovable.app',
    'lovableproject.com',
    '.vercel.app',
    '.netlify.app',
  ];
  
  const isProduction = productionIndicators.some(domain => 
    siteUrl.includes(domain) || supabaseUrl.includes(domain)
  );
  
  // Only allow DEV_MODE if explicitly set AND not in production
  const devModeEnv = Deno.env.get('DEV_MODE') === 'true';
  
  if (devModeEnv && isProduction) {
    console.warn('⚠️ SECURITY: DEV_MODE is enabled but blocked in production environment');
    return false;
  }
  
  return devModeEnv;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, countryCode } = await req.json();
    
    if (!phoneNumber || !countryCode) {
      return new Response(
        JSON.stringify({ error: 'Phone number and country code are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Normalize phone number (remove spaces and leading 0)
    const normalizedPhone = phoneNumber.replace(/\s/g, '').replace(/^0/, '');
    
    console.log('Checking if phone exists in hairdressers:', normalizedPhone, countryCode);

    // Check if phone number exists in hairdressers table
    const { data: hairdressers, error: dbError } = await supabase
      .from('hairdressers')
      .select('id, phone, country_code')
      .eq('country_code', countryCode);

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if any hairdresser matches the normalized phone number
    const hairdresserExists = hairdressers?.some(h => {
      const dbNormalizedPhone = h.phone.replace(/\s/g, '').replace(/^0/, '');
      return dbNormalizedPhone === normalizedPhone;
    });

    if (!hairdresserExists) {
      console.log('Phone number not found in hairdressers table');
      // Return 200 to avoid surfacing as a runtime/network error in the client.
      return new Response(
        JSON.stringify({
          success: false,
          code: 'HAIRDRESSER_NOT_FOUND',
          error: "Numéro de téléphone non trouvé. Veuillez contacter l'administrateur.",
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format phone number with country code
    const fullPhoneNumber = `${countryCode}${normalizedPhone}`;
    
    // SECURITY: Check DEV_MODE with production safeguard
    const DEV_MODE = isDevModeAllowed();
    
    if (DEV_MODE) {
      console.log('🔧 DEV MODE: Skipping Twilio SMS (local development only)');
      console.log('📱 Use code: 123456 for phone:', fullPhoneNumber);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          status: 'pending',
          message: 'OTP sent successfully (DEV MODE)'
          // SECURITY: Never return devCode in response, even in dev mode
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_VERIFY_SERVICE_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
    
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
      console.error('Twilio credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Sending OTP to verified hairdresser:', fullPhoneNumber);

    // Use Twilio Verify API to send OTP
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/Verifications`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        },
        body: new URLSearchParams({
          To: fullPhoneNumber,
          Channel: 'sms',
        }),
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Twilio error:', data);
      return new Response(
        JSON.stringify({ error: data.message || 'Failed to send OTP' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('OTP sent successfully:', data.status);

    return new Response(
      JSON.stringify({ 
        success: true,
        status: data.status,
        message: 'OTP sent successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-otp function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
