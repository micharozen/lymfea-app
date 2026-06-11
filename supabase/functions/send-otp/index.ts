import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { withLogging, type Logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
};

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxSendAttempts: 3, // Max OTP sends per phone per window
  windowMinutes: 15, // Time window in minutes
  blockDurationMinutes: 30, // How long to block after exceeding limit
};

// SECURITY: Only allow DEV_MODE in non-production environments
const isDevModeAllowed = (log: Logger): boolean => {
  const siteUrl = Deno.env.get('SITE_URL') || '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';

  const productionIndicators = [
    'lovable.app',
    'lovableproject.com',
    '.vercel.app',
    '.netlify.app',
  ];

  const isProduction = productionIndicators.some(domain =>
    siteUrl.includes(domain) || supabaseUrl.includes(domain)
  );

  const devModeEnv = Deno.env.get('DEV_MODE') === 'true';

  if (devModeEnv && isProduction) {
    log.warn('security.dev_mode_blocked_in_production');
    return false;
  }

  return devModeEnv;
};

interface RateLimitRecord {
  id: string;
  phone_number: string;
  request_type: string;
  attempt_count: number;
  first_attempt_at: string;
  last_attempt_at: string;
  blocked_until: string | null;
}

// Check and update rate limit, returns { allowed: boolean, retryAfterSeconds?: number }
async function checkRateLimit(
  supabase: any,
  phoneNumber: string,
  log: Logger,
): Promise<{ allowed: boolean; retryAfterSeconds?: number; error?: string }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_CONFIG.windowMinutes * 60 * 1000);

  // Check existing rate limit record
  const { data: existingLimit, error: fetchError } = await supabase
    .from('otp_rate_limits')
    .select('*')
    .eq('phone_number', phoneNumber)
    .eq('request_type', 'send')
    .maybeSingle();

  if (fetchError) {
    log.error('rate_limit.fetch_failed', fetchError);
    return { allowed: true };
  }

  const limit = existingLimit as RateLimitRecord | null;

  if (limit) {
    // Check if currently blocked
    if (limit.blocked_until && new Date(limit.blocked_until) > now) {
      const retryAfterSeconds = Math.ceil((new Date(limit.blocked_until).getTime() - now.getTime()) / 1000);
      log.warn('rate_limit.blocked', { retry_after_seconds: retryAfterSeconds });
      return {
        allowed: false,
        retryAfterSeconds,
        error: `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      };
    }

    // Check if within the rate limit window
    const firstAttempt = new Date(limit.first_attempt_at);

    if (firstAttempt > windowStart) {
      // Still within the window
      if (limit.attempt_count >= RATE_LIMIT_CONFIG.maxSendAttempts) {
        // Exceeded limit, block the phone number
        const blockedUntil = new Date(now.getTime() + RATE_LIMIT_CONFIG.blockDurationMinutes * 60 * 1000);

        await supabase
          .from('otp_rate_limits')
          .update({
            blocked_until: blockedUntil.toISOString(),
            last_attempt_at: now.toISOString(),
          })
          .eq('id', limit.id);

        const retryAfterSeconds = RATE_LIMIT_CONFIG.blockDurationMinutes * 60;
        log.warn('rate_limit.exceeded', {
          block_duration_minutes: RATE_LIMIT_CONFIG.blockDurationMinutes,
          attempt_count: limit.attempt_count,
        });
        return {
          allowed: false,
          retryAfterSeconds,
          error: `Trop de tentatives. Réessayez dans ${RATE_LIMIT_CONFIG.blockDurationMinutes} minutes.`,
        };
      }

      // Increment attempt count
      await supabase
        .from('otp_rate_limits')
        .update({
          attempt_count: limit.attempt_count + 1,
          last_attempt_at: now.toISOString(),
        })
        .eq('id', limit.id);

      log.info('rate_limit.attempt', {
        attempt: limit.attempt_count + 1,
        max: RATE_LIMIT_CONFIG.maxSendAttempts,
      });
    } else {
      // Window expired, reset the counter
      await supabase
        .from('otp_rate_limits')
        .update({
          attempt_count: 1,
          first_attempt_at: now.toISOString(),
          last_attempt_at: now.toISOString(),
          blocked_until: null,
        })
        .eq('id', limit.id);

      log.info('rate_limit.reset', { max: RATE_LIMIT_CONFIG.maxSendAttempts });
    }
  } else {
    // Create new rate limit record
    await supabase
      .from('otp_rate_limits')
      .insert({
        phone_number: phoneNumber,
        request_type: 'send',
        attempt_count: 1,
        first_attempt_at: now.toISOString(),
        last_attempt_at: now.toISOString(),
      });

    log.info('rate_limit.started', { max: RATE_LIMIT_CONFIG.maxSendAttempts });
  }

  return { allowed: true };
}

/** Build a JSON error Response with a structured reason code. */
function errorResponse(
  status: number,
  reason: string,
  message: string,
  extras: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({ success: false, reason, error: message, ...extras }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

serve(
  withLogging('send-otp', async (req, log) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const { phoneNumber, countryCode } = await req.json();

      if (!phoneNumber || !countryCode) {
        log.warn('request.missing_fields', {
          has_phone: !!phoneNumber,
          has_country: !!countryCode,
        });
        return errorResponse(
          400,
          'MISSING_FIELDS',
          'Phone number and country code are required',
        );
      }

      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Normalize phone number (remove spaces and leading 0)
      const normalizedPhone = phoneNumber.replace(/\s/g, '').replace(/^0/, '');

      // Format phone number with country code for rate limiting
      const fullPhoneNumber = `${countryCode}${normalizedPhone}`;

      log.bind({
        phone_tail: fullPhoneNumber.slice(-4),
        country_code: countryCode,
      });
      log.info('otp.send_attempt');

      // Check if phone number exists in therapists table
      const { data: therapists, error: dbError } = await supabase
        .from('therapists')
        .select('id, phone, country_code')
        .eq('country_code', countryCode);

      if (dbError) {
        log.error('therapist.lookup_failed', dbError);
        return errorResponse(500, 'DATABASE_ERROR', 'Database error');
      }

      // Check if any therapist matches the normalized phone number
      const therapistExists = therapists?.some((h: any) => {
        const dbNormalizedPhone = h.phone.replace(/\s/g, '').replace(/^0/, '');
        return dbNormalizedPhone === normalizedPhone;
      });

      if (!therapistExists) {
        log.warn('therapist.not_found');
        // Return 200 to avoid surfacing as a runtime/network error in the client.
        return new Response(
          JSON.stringify({
            success: false,
            reason: 'THERAPIST_NOT_FOUND',
            code: 'THERAPIST_NOT_FOUND',
            error: "Numéro de téléphone non trouvé. Veuillez contacter l'administrateur.",
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // SECURITY: Check rate limit before sending OTP
      const rateLimitResult = await checkRateLimit(supabase, fullPhoneNumber, log);
      if (!rateLimitResult.allowed) {
        log.warn('otp.blocked_by_rate_limit', {
          retry_after_seconds: rateLimitResult.retryAfterSeconds,
        });
        return new Response(
          JSON.stringify({
            success: false,
            reason: 'RATE_LIMITED',
            code: 'RATE_LIMITED',
            error: rateLimitResult.error,
            retryAfterSeconds: rateLimitResult.retryAfterSeconds,
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': String(rateLimitResult.retryAfterSeconds || 60),
            },
          },
        );
      }

      // SECURITY: Check DEV_MODE with production safeguard
      const DEV_MODE = isDevModeAllowed(log);

      if (DEV_MODE) {
        log.info('dev_mode.bypass_twilio');
        return new Response(
          JSON.stringify({
            success: true,
            status: 'pending',
            message: 'OTP sent successfully (DEV MODE)',
            // SECURITY: Never return devCode in response, even in dev mode
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
      const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
      const TWILIO_VERIFY_SERVICE_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
        log.error('twilio.config_missing', null, {
          has_account_sid: !!TWILIO_ACCOUNT_SID,
          has_auth_token: !!TWILIO_AUTH_TOKEN,
          has_verify_service_sid: !!TWILIO_VERIFY_SERVICE_SID,
        });
        return errorResponse(500, 'TWILIO_CONFIG_MISSING', 'Service configuration error');
      }

      log.info('twilio.send_started');

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
        },
      );

      const data = await response.json();

      if (!response.ok) {
        log.error('twilio.send_failed', null, {
          twilio_status: response.status,
          twilio_message: data?.message,
          twilio_code: data?.code,
          twilio_more_info: data?.more_info,
        });
        return errorResponse(
          response.status,
          'TWILIO_SEND_FAILED',
          data.message || 'Failed to send OTP',
        );
      }

      log.info('otp.send_success', { twilio_status: data.status });

      return new Response(
        JSON.stringify({
          success: true,
          status: data.status,
          message: 'OTP sent successfully',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (error) {
      log.error('unhandled_exception', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(500, 'INTERNAL_ERROR', errorMessage);
    }
  }),
);
