// Frontend logger that ships structured entries to BetterStack Telemetry.
//
// - Buffers entries in memory, flushes every 5s, on `pagehide` (with
//   `keepalive: true`), and when the buffer hits MAX_BATCH.
// - No-op when VITE_BETTERSTACK_FRONTEND_TOKEN is unset (dev / preview).
// - Always mirrors to console so devs still see output.
//
// Convention: messages are short, dot-separated event names
// (e.g. "payment.declined", "booking.creation_failed"). Free-form context goes
// in the second arg.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  dt: string;
  level: LogLevel;
  message: string;
  env: string;
  context: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

const TOKEN = import.meta.env.VITE_BETTERSTACK_FRONTEND_TOKEN as
  | string
  | undefined;
const INGEST_URL = import.meta.env.VITE_BETTERSTACK_INGEST_URL as
  | string
  | undefined;
const ENV = (import.meta.env.VITE_ENV as string | undefined) ?? 'development';

const MAX_BATCH = 20;
const FLUSH_INTERVAL_MS = 5_000;

const buffer: LogEntry[] = [];
let globalContext: Record<string, unknown> = {};
let flushTimer: ReturnType<typeof setInterval> | null = null;

// Stable per-page-load id that ties together every log emitted from a single
// browser session — useful for correlating logs from anonymous flows (e.g.
// public client booking) where there is no userId.
const SESSION_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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

function baseContext(): Record<string, unknown> {
  return {
    ...globalContext,
    session_id: SESSION_ID,
    url:
      typeof window !== 'undefined' ? window.location.pathname : undefined,
    user_agent:
      typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };
}

function enqueue(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: unknown,
) {
  const entry: LogEntry = {
    dt: new Date().toISOString(),
    level,
    message,
    env: ENV,
    context: { ...baseContext(), ...(context ?? {}) },
  };
  if (error !== undefined) entry.error = serializeError(error);

  // Mirror to console.
  const line = `[logger] ${message}`;
  if (level === 'error') console.error(line, entry.context, error ?? '');
  else if (level === 'warn') console.warn(line, entry.context);
  else console.log(line, entry.context);

  buffer.push(entry);
  if (buffer.length >= MAX_BATCH) void flush();
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  if (!TOKEN || !INGEST_URL) {
    buffer.length = 0;
    return;
  }

  const payload = buffer.splice(0, buffer.length);
  const body = JSON.stringify(payload);

  try {
    await fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body,
      keepalive: true,
    });
  } catch (err) {
    console.error('[logger] flush failed', err);
  }
}

function startFlushLoop() {
  if (flushTimer || typeof window === 'undefined') return;
  flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  window.addEventListener('pagehide', () => void flush());
}

export const logger = {
  debug: (msg: string, context?: Record<string, unknown>) =>
    enqueue('debug', msg, context),
  info: (msg: string, context?: Record<string, unknown>) =>
    enqueue('info', msg, context),
  warn: (msg: string, context?: Record<string, unknown>) =>
    enqueue('warn', msg, context),
  error: (msg: string, err?: unknown, context?: Record<string, unknown>) =>
    enqueue('error', msg, context, err),

  /** Set fields included in every subsequent log (e.g. userId, role, hotelId). */
  setContext(fields: Record<string, unknown>) {
    globalContext = { ...globalContext, ...fields };
  },

  /** Clear a previously-set context field (e.g. on sign-out). */
  clearContext(keys?: string[]) {
    if (!keys) {
      globalContext = {};
      return;
    }
    for (const k of keys) delete globalContext[k];
  },

  /** Force-flush the buffer (e.g. before a hard navigation). */
  flush,
};

/**
 * Install global error handlers. Call once at app boot.
 * Captures uncaught exceptions, unhandled promise rejections, and starts the
 * periodic flush loop.
 */
export function initErrorTracking() {
  if (typeof window === 'undefined') return;
  startFlushLoop();

  window.addEventListener('error', (event) => {
    // Skip the chunk-reload signal we already handle in main.tsx — those
    // aren't real errors, they're deploy-driven module misses.
    const msg = event.message?.toLowerCase() ?? '';
    if (
      msg.includes('dynamically imported module') ||
      msg.includes('importing a module script failed')
    ) {
      return;
    }
    logger.error('window.error', event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logger.error('window.unhandledrejection', event.reason);
  });
}
