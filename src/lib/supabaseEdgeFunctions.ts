import { supabase } from "@/integrations/supabase/client";
import type { FunctionsResponse } from "@supabase/supabase-js";

export interface InvokeOptions<T = unknown> {
  body?: T;
  /** If true, skip authentication (for public edge functions) */
  skipAuth?: boolean;
}

export interface InvokeResult<T> {
  data: T | null;
  error: Error | null;
}

// ─── Backend Router ─────────────────────────────────────────────
//
// Maps Edge Function names to Hono backend routes.
// When a function is migrated to the backend, add it here.
// All other functions continue to go through Supabase Edge Functions.
//
// To migrate a function:
//   1. Port the logic to backend/src/routes/
//   2. Add the mapping below
//   3. Done — zero changes needed in the 25+ calling files
//
const BACKEND_URL = import.meta.env.VITE_API_URL || "";

const migratedFunctions: Record<string, string> = {
  // Uncomment as you migrate each function:
  // "check-availability": "/availability/check",
  // "finalize-payment": "/payments/finalize",
  // "create-checkout-session": "/payments/checkout",
  // "charge-saved-card": "/payments/charge-card",
  // "handle-booking-cancellation": "/bookings/cancel",
  // "validate-booking-slot": "/availability/validate",
  // "create-client-booking": "/bookings/create",
  // "propose-alternative": "/bookings/propose-alternative",
};

/**
 * Invoke a Supabase Edge Function with automatic JWT authentication.
 *
 * If the function has been migrated to the Hono backend (listed in
 * migratedFunctions above), the call is automatically routed there.
 * Otherwise, it goes through Supabase Edge Functions as before.
 *
 * This means **zero changes** are needed in any calling code when
 * migrating a function — just add the mapping above.
 *
 * @param functionName - Name of the edge function to invoke
 * @param options - Options including body and optional skipAuth flag
 * @returns Promise with data and error
 *
 * @example
 * // This call works whether check-availability is on Supabase or Hono:
 * const { data, error } = await invokeEdgeFunction('check-availability', {
 *   body: { hotelId, date },
 *   skipAuth: true
 * });
 */
export async function invokeEdgeFunction<TRequest = unknown, TResponse = unknown>(
  functionName: string,
  options: InvokeOptions<TRequest> = {}
): Promise<InvokeResult<TResponse>> {
  const { body, skipAuth = false } = options;

  // Route to Hono backend if the function has been migrated
  const backendPath = migratedFunctions[functionName];
  if (BACKEND_URL && backendPath) {
    return invokeBackend<TRequest, TResponse>(functionName, backendPath, body, skipAuth);
  }

  // Otherwise, call Supabase Edge Function as before
  return invokeSupabase<TRequest, TResponse>(functionName, body, skipAuth);
}

// ─── Supabase Edge Function call (existing behavior) ────────────

async function invokeSupabase<TRequest, TResponse>(
  functionName: string,
  body: TRequest | undefined,
  skipAuth: boolean
): Promise<InvokeResult<TResponse>> {
  try {
    let authHeaders: Record<string, string> = {};

    if (!skipAuth) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error(`[invokeEdgeFunction] Session error for ${functionName}:`, sessionError);
        return {
          data: null,
          error: new Error(`Session error: ${sessionError.message}`)
        };
      }

      if (!session) {
        console.warn(`[invokeEdgeFunction] No session for ${functionName}`);
        return {
          data: null,
          error: new Error("No active session. Please log in again.")
        };
      }

      authHeaders = {
        Authorization: `Bearer ${session.access_token}`,
      };
    }

    const response: FunctionsResponse<TResponse> = await supabase.functions.invoke<TResponse>(functionName, {
      body,
      headers: authHeaders,
    });

    if (response.error) {
      return { data: null, error: response.error };
    }

    return { data: response.data, error: null };

  } catch (err) {
    console.error(`[invokeEdgeFunction] Unexpected error for ${functionName}:`, err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Unknown error occurred")
    };
  }
}

// ─── Hono Backend call (migrated functions) ─────────────────────

async function invokeBackend<TRequest, TResponse>(
  functionName: string,
  path: string,
  body: TRequest | undefined,
  skipAuth: boolean
): Promise<InvokeResult<TResponse>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (!skipAuth) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        return {
          data: null,
          error: new Error(`Session error: ${sessionError.message}`)
        };
      }

      if (!session) {
        return {
          data: null,
          error: new Error("No active session. Please log in again.")
        };
      }

      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error || `API error: ${response.status}`;
      return { data: null, error: new Error(errorMessage) };
    }

    const data = (await response.json()) as TResponse;
    return { data, error: null };
  } catch (err) {
    console.error(`[invokeBackend] Error calling ${functionName} → ${path}:`, err);
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Unknown error")
    };
  }
}
