import { supabase } from "@/integrations/supabase/client";
import type { FunctionsResponse } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export interface InvokeOptions<T = unknown> {
  body?: T;
  /** If true, skip authentication (for public edge functions) */
  skipAuth?: boolean;
  /** Extra fields attached to logger.error calls on failure (e.g. flow name, business ids). */
  logContext?: Record<string, unknown>;
}

export interface InvokeResult<T> {
  data: T | null;
  error: Error | null;
}

/**
 * Error returned when an edge function call fails. Carries the server
 * response context (status, parsed body, request_id) so callers can branch on
 * `status` / `body.reason` and so Better Stack logs always contain enough
 * detail to debug without the Supabase dashboard.
 */
export class EdgeFunctionError extends Error {
  readonly requestId: string;
  readonly status?: number;
  readonly body?: unknown;
  readonly functionName: string;
  readonly transport: "supabase" | "backend";

  constructor(
    message: string,
    opts: {
      requestId: string;
      functionName: string;
      transport: "supabase" | "backend";
      status?: number;
      body?: unknown;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "EdgeFunctionError";
    this.requestId = opts.requestId;
    this.status = opts.status;
    this.body = opts.body;
    this.functionName = opts.functionName;
    this.transport = opts.transport;
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
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
  // "get-availability": "/availability/check",
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
 * // This call works whether get-availability is on Supabase or Hono:
 * const { data, error } = await invokeEdgeFunction('get-availability', {
 *   body: { hotelId, date },
 *   skipAuth: true
 * });
 */
export async function invokeEdgeFunction<TRequest = unknown, TResponse = unknown>(
  functionName: string,
  options: InvokeOptions<TRequest> = {}
): Promise<InvokeResult<TResponse>> {
  const { body, skipAuth = false, logContext } = options;
  const requestId = generateRequestId();

  // Route to Hono backend if the function has been migrated
  const backendPath = migratedFunctions[functionName];
  if (BACKEND_URL && backendPath) {
    return invokeBackend<TRequest, TResponse>(
      functionName,
      backendPath,
      body,
      skipAuth,
      requestId,
      logContext,
    );
  }

  // Otherwise, call Supabase Edge Function as before
  return invokeSupabase<TRequest, TResponse>(
    functionName,
    body,
    skipAuth,
    requestId,
    logContext,
  );
}

// ─── Stripe payment helper ──────────────────────────────────────
//
// All Stripe operations are routed through a single endpoint that
// resolves the right Stripe key per venue (Vault-backed) with fallback
// to the global key.
//
// When VITE_API_URL is set, calls go to the Hono backend's unified
// dispatcher at POST /payments/stripe (action contract preserved).
// Otherwise, they go to the legacy Supabase Edge Function `stripe-payment`.

export type StripeAction =
  | "create-setup-intent"
  | "confirm-setup-intent"
  | "charge-saved-card"
  | "create-bundle-payment"
  | "purchase-bundle"
  | "create-checkout-session"
  | "handle-checkout-success"
  | "finalize-payment"
  | "send-payment-link"
  | "check-expired-payment-links";

// Actions already migrated to the Hono backend. Once an action ships
// here, add it to route through the backend transparently.
//
// NOTE: The Stripe migration to Hono is NOT done yet. Even though
// VITE_API_URL is set (to exercise other backend routes), Stripe must
// keep going through the Supabase Edge Function `stripe-payment`.
// Keep this set EMPTY until each action is actually live on the backend.
const BACKEND_STRIPE_ACTIONS: ReadonlySet<StripeAction> = new Set([]);

export async function invokeStripe<TResponse = unknown>(
  action: StripeAction,
  payload: Record<string, unknown>,
  options: { skipAuth?: boolean; logContext?: Record<string, unknown> } = {},
): Promise<InvokeResult<TResponse>> {
  if (BACKEND_URL && BACKEND_STRIPE_ACTIONS.has(action)) {
    const requestId = generateRequestId();
    return invokeBackend<Record<string, unknown>, TResponse>(
      `stripe-payment#${action}`,
      "/payments/stripe",
      { action, ...payload },
      options.skipAuth ?? false,
      requestId,
      { action, ...(options.logContext ?? {}) },
    );
  }

  return invokeEdgeFunction<Record<string, unknown>, TResponse>("stripe-payment", {
    body: { action, ...payload },
    skipAuth: options.skipAuth,
    logContext: { action, ...(options.logContext ?? {}) },
  });
}

// ─── Supabase Edge Function call ────────────────────────────────

async function invokeSupabase<TRequest, TResponse>(
  functionName: string,
  body: TRequest | undefined,
  skipAuth: boolean,
  requestId: string,
  logContext: Record<string, unknown> | undefined,
): Promise<InvokeResult<TResponse>> {
  try {
    const headers: Record<string, string> = {};

    if (!skipAuth) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        logger.error("edge_function.session_error", sessionError, {
          function: functionName,
          transport: "supabase",
          request_id: requestId,
          ...(logContext ?? {}),
        });
        return {
          data: null,
          error: new EdgeFunctionError(`Session error: ${sessionError.message}`, {
            requestId,
            functionName,
            transport: "supabase",
            cause: sessionError,
          }),
        };
      }

      if (!session) {
        logger.warn("edge_function.no_session", {
          function: functionName,
          transport: "supabase",
          request_id: requestId,
          ...(logContext ?? {}),
        });
        return {
          data: null,
          error: new EdgeFunctionError("No active session. Please log in again.", {
            requestId,
            functionName,
            transport: "supabase",
            status: 401,
          }),
        };
      }

      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response: FunctionsResponse<TResponse> = await supabase.functions.invoke<TResponse>(
      functionName,
      { body, headers },
    );

    if (response.error) {
      // Supabase FunctionsHttpError attaches the original Response on `.context`.
      // The SDK does not surface the JSON body's `error` field — extract it here
      // so callers see the actual server message (and reason code) instead of a
      // generic "Edge Function returned a non-2xx status code".
      const ctx = (response.error as { context?: Response }).context;
      const status = ctx?.status;
      let parsedBody: unknown = undefined;
      let serverMessage: string | undefined;

      if (ctx && typeof ctx.clone === "function") {
        try {
          parsedBody = await ctx.clone().json();
          if (
            parsedBody &&
            typeof parsedBody === "object" &&
            typeof (parsedBody as { error?: unknown }).error === "string"
          ) {
            serverMessage = (parsedBody as { error: string }).error;
          }
        } catch {
          // Body wasn't JSON — leave parsedBody undefined.
        }
      }

      const message = serverMessage ?? response.error.message;
      const wrapped = new EdgeFunctionError(message, {
        requestId,
        functionName,
        transport: "supabase",
        status,
        body: parsedBody,
        cause: response.error,
      });

      logger.error("edge_function.failed", wrapped, {
        function: functionName,
        transport: "supabase",
        request_id: requestId,
        status,
        body: parsedBody,
        server_message: serverMessage,
        ...(logContext ?? {}),
      });
      return { data: null, error: wrapped };
    }

    const payload = response.data as
      | { error?: string; success?: boolean; reason?: string }
      | null;
    if (payload && typeof payload === "object" && payload.error) {
      // 200 OK but business-level failure (success:false). Surface it as a
      // structured EdgeFunctionError so callers can branch on body.reason.
      const wrapped = new EdgeFunctionError(payload.error, {
        requestId,
        functionName,
        transport: "supabase",
        status: 200,
        body: payload,
      });
      logger.warn("edge_function.business_error", {
        function: functionName,
        transport: "supabase",
        request_id: requestId,
        reason: payload.reason,
        server_message: payload.error,
        ...(logContext ?? {}),
      });
      return { data: null, error: wrapped };
    }

    return { data: response.data, error: null };
  } catch (err) {
    const wrapped = new EdgeFunctionError(
      err instanceof Error ? err.message : "Unknown error occurred",
      {
        requestId,
        functionName,
        transport: "supabase",
        cause: err,
      },
    );
    logger.error("edge_function.threw", err, {
      function: functionName,
      transport: "supabase",
      request_id: requestId,
      ...(logContext ?? {}),
    });
    return { data: null, error: wrapped };
  }
}

// ─── Hono Backend call (migrated functions) ─────────────────────

async function invokeBackend<TRequest, TResponse>(
  functionName: string,
  path: string,
  body: TRequest | undefined,
  skipAuth: boolean,
  requestId: string,
  logContext: Record<string, unknown> | undefined,
): Promise<InvokeResult<TResponse>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (!skipAuth) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        logger.error("edge_function.session_error", sessionError, {
          function: functionName,
          transport: "backend",
          path,
          request_id: requestId,
          ...(logContext ?? {}),
        });
        return {
          data: null,
          error: new EdgeFunctionError(`Session error: ${sessionError.message}`, {
            requestId,
            functionName,
            transport: "backend",
            cause: sessionError,
          }),
        };
      }

      if (!session) {
        logger.warn("edge_function.no_session", {
          function: functionName,
          transport: "backend",
          path,
          request_id: requestId,
          ...(logContext ?? {}),
        });
        return {
          data: null,
          error: new EdgeFunctionError("No active session. Please log in again.", {
            requestId,
            functionName,
            transport: "backend",
            status: 401,
          }),
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
      const errorMessage =
        errorData && typeof errorData === "object" && typeof (errorData as { error?: unknown }).error === "string"
          ? (errorData as { error: string }).error
          : `API error: ${response.status}`;
      const wrapped = new EdgeFunctionError(errorMessage, {
        requestId,
        functionName,
        transport: "backend",
        status: response.status,
        body: errorData,
      });
      logger.error("edge_function.failed", wrapped, {
        function: functionName,
        path,
        transport: "backend",
        request_id: requestId,
        status: response.status,
        body: errorData,
        ...(logContext ?? {}),
      });
      return { data: null, error: wrapped };
    }

    const data = (await response.json()) as TResponse;
    return { data, error: null };
  } catch (err) {
    const wrapped = new EdgeFunctionError(
      err instanceof Error ? err.message : "Unknown error",
      {
        requestId,
        functionName,
        transport: "backend",
        cause: err,
      },
    );
    logger.error("edge_function.threw", err, {
      function: functionName,
      path,
      transport: "backend",
      request_id: requestId,
      ...(logContext ?? {}),
    });
    return { data: null, error: wrapped };
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: not cryptographically strong, but acceptable as a correlation id.
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
