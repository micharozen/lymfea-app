import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, countryCode, code } = await req.json();
    
    if (!phoneNumber || !countryCode || !code) {
      return new Response(
        JSON.stringify({ error: 'Phone number, country code, and verification code are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize phone number (remove spaces and leading 0) - must match send-otp normalization
    const normalizedPhone = phoneNumber.replace(/\s/g, '').replace(/^0/, '');
    
    // Format phone number with country code
    const fullPhoneNumber = `${countryCode}${normalizedPhone}`;
    
    console.log('=== OTP Verification Attempt ===');
    console.log('Phone Number:', fullPhoneNumber.slice(0, -4) + '****');
    console.log('OTP Code: [REDACTED]');
    console.log('===============================');

    // Production mode: use Twilio for OTP verification
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

    console.log('Service SID:', TWILIO_VERIFY_SERVICE_SID);

    // Use Twilio Verify API to check OTP
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        },
        body: new URLSearchParams({
          To: fullPhoneNumber,
          Code: code,
        }),
      }
    );

    const data = await response.json();
    console.log('Twilio response status:', response.status);
    console.log('Twilio response data:', JSON.stringify(data));
    
    if (!response.ok) {
      console.error('❌ Twilio verification error:');
      console.error('Status:', response.status);
      console.error('Error details:', JSON.stringify(data));
      
      // More helpful error message for 404
      if (response.status === 404) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Ce code a expiré ou a déjà été utilisé. Demandez un nouveau code.' 
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: data.message || 'Failed to verify OTP' 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (data.status !== 'approved') {
      console.log('⚠️ OTP verification failed - status:', data.status);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Code de vérification invalide' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ OTP verified successfully');

    // Find hairdresser by phone number
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use the same normalized phone for database lookup
    const { data: hairdresser, error: dbError } = await supabase
      .from('hairdressers')
      .select('*')
      .eq('country_code', countryCode)
      .or(`phone.eq.${normalizedPhone},phone.eq.${phoneNumber}`)
      .maybeSingle();

    if (dbError || !hairdresser) {
      console.error('Hairdresser not found:', dbError);
      return new Response(
        JSON.stringify({ error: 'No hairdresser account found with this phone number' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sign in or create user with Supabase Auth
    let authUser;
    
    if (hairdresser.user_id) {
      // User already exists, get their session
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(hairdresser.user_id);
      
      if (userError) {
        console.error('Error fetching user:', userError);
        return new Response(
          JSON.stringify({ error: 'Authentication error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      authUser = user;
    } else {
      // Create new auth user
      const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
        email: hairdresser.email,
        email_confirm: true,
        user_metadata: {
          phone: fullPhoneNumber,
          first_name: hairdresser.first_name,
          last_name: hairdresser.last_name,
        }
      });

      if (createError || !user) {
        console.error('Error creating user:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create user account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update hairdresser with user_id
      await supabase
        .from('hairdressers')
        .update({ user_id: user.id })
        .eq('id', hairdresser.id);

      authUser = user;
    }

    // Generate session token
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: hairdresser.email,
    });

    if (sessionError || !sessionData) {
      console.error('Error generating session:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the hashed token to get real session tokens
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: sessionData.properties.hashed_token,
      type: 'magiclink',
    });

    if (verifyError || !verifyData.session) {
      console.error('Error verifying token:', verifyError);
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Session created successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        user: verifyData.user,
        session: {
          access_token: verifyData.session.access_token,
          refresh_token: verifyData.session.refresh_token,
        },
        hairdresser: {
          id: hairdresser.id,
          status: hairdresser.status,
          first_name: hairdresser.first_name,
          last_name: hairdresser.last_name,
          password_set: hairdresser.password_set || false,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-otp function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
