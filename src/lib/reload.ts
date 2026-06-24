const CACHE_BUST_PARAM = "__eia_reload";

export function reloadWithCacheBust(): void {
  const url = new URL(window.location.href);
  url.searchParams.set(CACHE_BUST_PARAM, Date.now().toString(36));
  window.location.replace(url.toString());
}
