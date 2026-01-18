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

/**
 * Invoke a Supabase Edge Function with automatic JWT authentication.
 *
 * This utility:
 * 1. Gets the current session
 * 2. Explicitly passes the access_token in the Authorization header
 * 3. Handles session errors gracefully
 *
 * @param functionName - Name of the edge function to invoke
 * @param options - Options including body and optional skipAuth flag
 * @returns Promise with data and error
 *
 * @example
 * // Authenticated call
 * const { data, error } = await invokeEdgeFunction('finalize-payment', {
 *   body: { booking_id, payment_method, final_amount }
 * });
 *
 * @example
 * // Public call (no auth required)
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
