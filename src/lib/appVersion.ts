import { format, parseISO } from "date-fns";

/**
 * Identité du build, injectée par le bloc `define` de vite.config.ts.
 *
 * Les gardes `typeof` sont nécessaires : vitest.config.ts n'a pas de `define`,
 * donc un test qui importe (même indirectement) ce module lèverait sinon une
 * ReferenceError.
 */
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
export const APP_COMMIT_SHA = typeof __APP_COMMIT_SHA__ !== "undefined" ? __APP_COMMIT_SHA__ : "dev";
export const APP_BRANCH = typeof __APP_BRANCH__ !== "undefined" ? __APP_BRANCH__ : "local";
export const APP_BUILD_TIME =
  typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : new Date().toISOString();

export const APP_ENV =
  (import.meta.env.VITE_ENV as string | undefined) ??
  (import.meta.env.DEV ? "development" : "production");

/** Identifiant de release pour les logs : "1.0.0+a3f9c1". */
export const APP_RELEASE = `${APP_VERSION}+${APP_COMMIT_SHA}`;

function formatBuildTime(): string {
  try {
    return format(parseISO(APP_BUILD_TIME), "dd/MM HH:mm");
  } catch {
    return "—";
  }
}

/** Ligne de version affichée dans le PWA : "v1.0.0 · a3f9c1 · 26/08 14:32". */
export function formatVersionLine(): string {
  return `v${APP_VERSION} · ${APP_COMMIT_SHA} · ${formatBuildTime()}`;
}
