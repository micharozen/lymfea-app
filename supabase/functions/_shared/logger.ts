// BetterStack Telemetry logger for Supabase Edge Functions (Deno).
//
// Buffers structured log entries during a request and ships them in a single
// fire-and-forget POST to BetterStack at the end of the handler (via flush()).
// If BETTERSTACK_SOURCE_TOKEN is unset, the logger silently no-ops (logs still
// go to console for local dev).
//
// Usage:
//   const log = createLogger({ function: 'create-client-booking', req });
//   log.info('booking.created', { bookingId, hotelId });
//   log.error('rpc.reserve.failed', err, { hotelId, bookingDate });
//   await log.flush(); // before returning the Response

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  dt: string;
  level: LogLevel;
  message: string;
  function: string;
  request_id: string;
  env: string;
  duration_ms?: number;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

interface LoggerOptions {
  function: string;
  req?: Request;
}

const INGEST_URL = Deno.env.get('BETTERSTACK_INGEST_URL');
const ENV = Deno.env.get('APP_ENV') ?? 'development';

function serializeError(err: unknown): LogEntry['error'] {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === 'string') return { name: 'Error', message: err };
  try {
    return { name: 'Error', message: JSON.stringify(err) };
  } catch {
    return { name: 'Error', message: String(err) };
  }
}

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (
    message: string,
    err?: unknown,
    context?: Record<string, unknown>,
  ) => void;
  flush: () => Promise<void>;
  /** Augment every subsequent log with these fields (e.g. bookingId, hotelId). */
  bind: (fields: Record<string, unknown>) => void;
}

export function createLogger(options: LoggerOptions): Logger {
  const requestId =
    options.req?.headers.get('x-request-id') ?? crypto.randomUUID();
  const startedAt = Date.now();
  const buffer: LogEntry[] = [];
  let bound: Record<string, unknown> = {};

  const push = (
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ) => {
    const entry: LogEntry = {
      dt: new Date().toISOString(),
      level,
      message,
      function: options.function,
      request_id: requestId,
      env: ENV,
      duration_ms: Date.now() - startedAt,
      context: { ...bound, ...(context ?? {}) },
    };
    if (error !== undefined) entry.error = serializeError(error);
    buffer.push(entry);

    // Mirror to console so logs remain visible in `supabase functions serve`
    // and the Supabase log viewer.
    const consoleLine = `[${options.function}] ${message}`;
    if (level === 'error') console.error(consoleLine, entry.context, entry.error ?? '');
    else if (level === 'warn') console.warn(consoleLine, entry.context);
    else console.log(consoleLine, entry.context);
  };

  return {
    debug: (message, context) => push('debug', message, context),
    info: (message, context) => push('info', message, context),
    warn: (message, context) => push('warn', message, context),
    error: (message, err, context) => push('error', message, context, err),
    bind: (fields) => {
      bound = { ...bound, ...fields };
    },
    flush: async () => {
      if (buffer.length === 0) return;
      const token = Deno.env.get('BETTERSTACK_SOURCE_TOKEN');
      if (!token || !INGEST_URL) return; // No-op when not configured

      const payload = buffer.splice(0, buffer.length);
      try {
        const res = await fetch(INGEST_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          console.error(
            `[logger] BetterStack ingest failed: ${res.status} ${res.statusText}`,
          );
        }
      } catch (err) {
        console.error('[logger] BetterStack ingest threw:', err);
      }
    },
  };
}

/**
 * Wrap a Deno `serve` handler so request entry / exit / unhandled errors are
 * logged automatically and the buffer is flushed before the response leaves.
 *
 *   serve(withLogging('create-client-booking', async (req, log) => { ... }));
 */
export function withLogging(
  functionName: string,
  handler: (req: Request, log: Logger) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const log = createLogger({ function: functionName, req });
    log.info('request.received', {
      method: req.method,
      path: new URL(req.url).pathname,
    });

    try {
      const response = await handler(req, log);
      log.info('request.completed', { status: response.status });
      await log.flush();
      return response;
    } catch (err) {
      log.error('request.unhandled_error', err);
      await log.flush();
      throw err;
    }
  };
}
