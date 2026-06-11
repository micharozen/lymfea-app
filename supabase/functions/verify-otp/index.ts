import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { withLogging, type Logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
};

// Rate limiting configuration for verification attempts
const RATE_LIMIT_CONFIG = {
  maxVerifyAttempts: 5, // Max OTP verification attempts per phone per window
  windowMinutes: 15, // Time window in minutes
  blockDurationMinutes: 60, // How long to block after exceeding limit (longer for verify to prevent brute force)
};

// SECURITY: Only allow DEV_MODE in non-production environments
const isDevModeAllowed = (log: Logger): boolean => {
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

// Check and update rate limit for verification attempts
async function checkVerifyRateLimit(
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
    .eq('request_type', 'verify')
    .maybeSingle();

  if (fetchError) {
    log.error('rate_limit.fetch_failed', fetchError);
    // Allow request but log the error
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
        error: `Trop de tentatives de vérification. Réessayez dans ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      };
    }

    // Check if within the rate limit window
    const firstAttempt = new Date(limit.first_attempt_at);

    if (firstAttempt > windowStart) {
      // Still within the window
      if (limit.attempt_count >= RATE_LIMIT_CONFIG.maxVerifyAttempts) {
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
          error: `Trop de tentatives de vérification. Réessayez dans ${RATE_LIMIT_CONFIG.blockDurationMinutes} minutes.`,
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
        max: RATE_LIMIT_CONFIG.maxVerifyAttempts,
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

      log.info('rate_limit.reset', { max: RATE_LIMIT_CONFIG.maxVerifyAttempts });
    }
  } else {
    // Create new rate limit record
    await supabase
      .from('otp_rate_limits')
      .insert({
        phone_number: phoneNumber,
        request_type: 'verify',
        attempt_count: 1,
        first_attempt_at: now.toISOString(),
        last_attempt_at: now.toISOString(),
      });

    log.info('rate_limit.started', { max: RATE_LIMIT_CONFIG.maxVerifyAttempts });
  }

  return { allowed: true };
}

// Clear rate limit on successful verification
async function clearRateLimitOnSuccess(
  supabase: any,
  phoneNumber: string,
  log: Logger,
): Promise<void> {
  try {
    // Delete both send and verify rate limit records on successful login
    await supabase
      .from('otp_rate_limits')
      .delete()
      .eq('phone_number', phoneNumber);

    log.info('rate_limit.cleared_on_success');
  } catch (error) {
    log.error('rate_limit.clear_failed', error);
  }
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
  withLogging('verify-otp', async (req, log) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const { phoneNumber, countryCode, code } = await req.json();

      if (!phoneNumber || !countryCode || !code) {
        log.warn('request.missing_fields', {
          has_phone: !!phoneNumber,
          has_country: !!countryCode,
          has_code: !!code,
        });
        return errorResponse(
          400,
          'MISSING_FIELDS',
          'Phone number, country code, and verification code are required',
        );
      }

      // Initialize Supabase client early for rate limiting
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Normalize phone number (remove spaces and leading 0) - must match send-otp normalization
      const normalizedPhone = phoneNumber.replace(/\s/g, '').replace(/^0/, '');

      // Format phone number with country code
      const fullPhoneNumber = `${countryCode}${normalizedPhone}`;

      log.bind({
        phone_tail: fullPhoneNumber.slice(-4),
        country_code: countryCode,
      });
      log.info('otp.verify_attempt');

      // SECURITY: Check rate limit before attempting verification
      const rateLimitResult = await checkVerifyRateLimit(supabase, fullPhoneNumber, log);
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
        log.info('dev_mode.enabled');
        if (code !== '123456') {
          log.warn('dev_mode.invalid_code');
          return errorResponse(400, 'OTP_INVALID', 'Code de vérification invalide');
        }
        log.info('dev_mode.verified');
      } else {
        // Production mode: use Twilio for OTP verification
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
          },
        );

        const data = await response.json();

        if (!response.ok) {
          // 404 from Twilio Verify == the verification attempt has expired or was
          // already consumed. Surface as a distinct reason so the UI can prompt
          // for a fresh code.
          if (response.status === 404) {
            log.warn('twilio.verify.expired_or_used', {
              twilio_status: response.status,
              twilio_message: data?.message,
              twilio_code: data?.code,
            });
            return errorResponse(
              404,
              'OTP_EXPIRED',
              'Ce code a expiré ou a déjà été utilisé. Demandez un nouveau code.',
            );
          }

          log.error('twilio.verify.failed', null, {
            twilio_status: response.status,
            twilio_message: data?.message,
            twilio_code: data?.code,
            twilio_more_info: data?.more_info,
          });
          return errorResponse(
            response.status,
            'TWILIO_ERROR',
            data.message || 'Failed to verify OTP',
          );
        }

        if (data.status !== 'approved') {
          log.warn('twilio.verify.unapproved', { twilio_status: data.status });
          return errorResponse(400, 'OTP_INVALID', 'Code de vérification invalide');
        }

        log.info('twilio.verify.approved');
      }

      // Find therapist by phone number.
      // The `phone` column is not strictly normalized in storage — some rows include
      // a leading 0 or spaces (e.g. "06 08 75 64 82"). Match the logic used in
      // `send-otp` by fetching all therapists for the country code and normalizing
      // both sides in JS before comparing.
      const { data: candidates, error: dbError } = await supabase
        .from('therapists')
        .select('*')
        .eq('country_code', countryCode);

      if (dbError) {
        log.error('therapist.lookup_failed', dbError, { has_db_error: true });
        return errorResponse(500, 'DATABASE_ERROR', 'Database error');
      }

      const matches = (candidates ?? []).filter((row: { phone?: string | null }) => {
        if (!row.phone) return false;
        const dbNormalizedPhone = row.phone.replace(/\s/g, '').replace(/^0/, '');
        return dbNormalizedPhone === normalizedPhone;
      });

      if (matches.length === 0) {
        log.warn('therapist.not_found');
        return errorResponse(
          404,
          'THERAPIST_NOT_FOUND',
          'No therapist account found with this phone number',
        );
      }

      if (matches.length > 1) {
        log.error('therapist.duplicate_phone', null, {
          match_count: matches.length,
          therapist_ids: matches.map((m: { id: string }) => m.id),
        });
        return errorResponse(
          409,
          'THERAPIST_DUPLICATE',
          'Multiple therapist accounts share this phone number. Please contact support.',
        );
      }

      const therapist = matches[0];

      log.bind({ therapist_id: therapist.id });

      // Sign in or create user with Supabase Auth
      let authUser;

      if (therapist.user_id) {
        // User already exists, get their session
        const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(therapist.user_id);

        if (userError) {
          log.error('auth.user_fetch_failed', userError, { user_id: therapist.user_id });
          return errorResponse(500, 'USER_FETCH_FAILED', 'Authentication error');
        }

        authUser = user;
      } else {
        // First, check if a user with this email already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find((u: any) => u.email === therapist.email);

        if (existingUser) {
          log.info('auth.existing_user_linked', { user_id: existingUser.id });
          // Link the existing user to the therapist
          await supabase
            .from('therapists')
            .update({ user_id: existingUser.id })
            .eq('id', therapist.id);

          authUser = existingUser;
        } else {
          // Create new auth user
          const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
            email: therapist.email,
            email_confirm: true,
            user_metadata: {
              phone: fullPhoneNumber,
              first_name: therapist.first_name,
              last_name: therapist.last_name,
            },
          });

          if (createError || !user) {
            log.error('auth.user_create_failed', createError, {
              has_create_error: !!createError,
              has_user: !!user,
            });
            return errorResponse(500, 'USER_CREATE_FAILED', 'Failed to create user account');
          }

          // Update therapist with user_id
          await supabase
            .from('therapists')
            .update({ user_id: user.id })
            .eq('id', therapist.id);

          authUser = user;
          log.info('auth.user_created', { user_id: user.id });
        }
      }

      // Generate session using user_id directly to avoid email conflicts
      const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: authUser!.email!,
      });

      if (sessionError || !sessionData) {
        log.error('auth.session_generate_failed', sessionError, {
          user_id: authUser!.id,
        });
        return errorResponse(500, 'SESSION_GEN_FAILED', 'Failed to create session');
      }

      // Verify the hashed token to get real session tokens
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: sessionData.properties.hashed_token,
        type: 'magiclink',
      });

      if (verifyError || !verifyData.session) {
        log.error('auth.session_verify_failed', verifyError, {
          user_id: authUser!.id,
          has_session: !!verifyData?.session,
        });
        return errorResponse(500, 'SESSION_VERIFY_FAILED', 'Failed to create session');
      }

      // Verify the session is for the correct user
      if (verifyData.user?.id !== authUser!.id) {
        log.error('auth.session_user_mismatch', null, {
          expected_user_id: authUser!.id,
          got_user_id: verifyData.user?.id,
        });
        return errorResponse(
          500,
          'SESSION_USER_MISMATCH',
          'Session conflict - please contact administrator',
        );
      }

      // SECURITY: Clear rate limits on successful verification
      await clearRateLimitOnSuccess(supabase, fullPhoneNumber, log);

      log.info('otp.verify_success', { user_id: authUser!.id });

      return new Response(
        JSON.stringify({
          success: true,
          user: verifyData.user,
          session: {
            access_token: verifyData.session.access_token,
            refresh_token: verifyData.session.refresh_token,
          },
          therapist: {
            id: therapist.id,
            status: therapist.status,
            first_name: therapist.first_name,
            last_name: therapist.last_name,
            password_set: therapist.password_set || false,
          },
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
