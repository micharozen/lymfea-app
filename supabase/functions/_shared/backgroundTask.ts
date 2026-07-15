// Background task helper for edge functions.
//
// Lets a handler return its HTTP response as soon as the essential work is done,
// while slower fire-and-forget work (notification fan-out, emails, dispatch)
// continues afterwards.

type EdgeRuntimeLike = { waitUntil?: (p: Promise<unknown>) => void };

/**
 * Run `work` in the background so the HTTP response can return immediately.
 *
 * On the Supabase edge runtime, `EdgeRuntime.waitUntil` keeps the worker alive
 * until the promise settles — so we schedule it and return without awaiting.
 * When `waitUntil` is unavailable (local `deno test`, older runtimes) we await
 * inline so the work still runs to completion.
 *
 * Errors are always caught and logged: background work must never reject into
 * the caller (the response has already been sent) nor surface as an unhandled
 * rejection that could take the worker down.
 */
export async function runInBackground(
  work: Promise<unknown>,
  label: string,
): Promise<void> {
  const guarded = Promise.resolve(work).catch((err) =>
    console.error(`${label} failed:`, err)
  );
  const edgeRuntime =
    (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(guarded);
  } else {
    await guarded;
  }
}
