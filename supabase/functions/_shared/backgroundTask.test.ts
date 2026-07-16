import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { runInBackground } from "./backgroundTask.ts";

type EdgeRuntimeLike = { waitUntil?: (p: Promise<unknown>) => void };

// Save/restore the ambient EdgeRuntime so tests stay isolated.
function withEdgeRuntime(
  value: EdgeRuntimeLike | undefined,
  fn: () => Promise<void>,
): () => Promise<void> {
  return async () => {
    const g = globalThis as { EdgeRuntime?: EdgeRuntimeLike };
    const original = g.EdgeRuntime;
    if (value === undefined) delete g.EdgeRuntime;
    else g.EdgeRuntime = value;
    try {
      await fn();
    } finally {
      if (original === undefined) delete g.EdgeRuntime;
      else g.EdgeRuntime = original;
    }
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Swallow console.error so the intentional error-path logs don't pollute output,
// and let tests assert it was called.
function stubConsoleError(): { calls: unknown[][]; restore: () => void } {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  return { calls, restore: () => (console.error = original) };
}

// --- waitUntil PRESENT: schedule, don't block -------------------------------

Deno.test(
  "runInBackground: with waitUntil, returns without awaiting the work",
  withEdgeRuntime(
    // filled per-test below
    {},
    async () => {
      let scheduled: Promise<unknown> | null = null;
      (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime = {
        waitUntil: (p) => {
          scheduled = p;
        },
      };

      let workDone = false;
      const gate = deferred<void>();
      const work = gate.promise.then(() => {
        workDone = true;
      });

      await runInBackground(work, "test");

      // Non-blocking: the work is still pending when we return.
      assertEquals(workDone, false);
      assertStrictEquals(scheduled !== null, true);

      // Once released, the scheduled promise settles the work.
      gate.resolve();
      await scheduled;
      assertEquals(workDone, true);
    },
  ),
);

Deno.test(
  "runInBackground: with waitUntil, hands over a guarded (non-rejecting) promise",
  withEdgeRuntime({}, async () => {
    const err = stubConsoleError();
    try {
      let scheduled: Promise<unknown> | null = null;
      (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime = {
        waitUntil: (p) => {
          scheduled = p;
        },
      };

      const work = Promise.reject(new Error("boom"));
      await runInBackground(work, "boom-label");

      // The promise given to waitUntil must not reject (would be an unhandled
      // rejection on the worker) — the internal catch neutralises it.
      let threw = false;
      try {
        await scheduled;
      } catch {
        threw = true;
      }
      assertEquals(threw, false);
      assertEquals(err.calls.length, 1);
      assertEquals(err.calls[0][0], "boom-label failed:");
    } finally {
      err.restore();
    }
  }),
);

// --- waitUntil ABSENT: await inline -----------------------------------------

Deno.test(
  "runInBackground: without waitUntil, awaits the work inline",
  withEdgeRuntime(undefined, async () => {
    let workDone = false;
    const work = Promise.resolve().then(() => {
      workDone = true;
    });

    await runInBackground(work, "test");

    // Blocking fallback: the work has completed by the time we return.
    assertEquals(workDone, true);
  }),
);

Deno.test(
  "runInBackground: without waitUntil, a rejecting work never throws to the caller",
  withEdgeRuntime(undefined, async () => {
    const err = stubConsoleError();
    try {
      let threw = false;
      try {
        await runInBackground(Promise.reject(new Error("kaboom")), "label-x");
      } catch {
        threw = true;
      }
      assertEquals(threw, false);
      assertEquals(err.calls.length, 1);
      assertEquals(err.calls[0][0], "label-x failed:");
    } finally {
      err.restore();
    }
  }),
);

// --- runtime present but no waitUntil method (defensive) --------------------

Deno.test(
  "runInBackground: EdgeRuntime without waitUntil falls back to inline await",
  withEdgeRuntime({}, async () => {
    let workDone = false;
    const work = Promise.resolve().then(() => {
      workDone = true;
    });

    await runInBackground(work, "test");
    assertEquals(workDone, true);
  }),
);
