/**
 * Fetches a user-supplied public URL from an edge function without opening an
 * SSRF hole: http(s) only, default ports, hostnames resolving to public IPs
 * only (checked at every redirect), bounded time and size.
 */

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  url: string;
  contentType: string;
  bytes: Uint8Array;
}

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") ||
      v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff")) return true;
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported_protocol");
  if (url.username || url.password) throw new Error("credentials_in_url");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("unsupported_port");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("private_host");
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateIPv4(host)) throw new Error("private_host");
    return;
  }
  if (host.includes(":")) {
    if (isPrivateIPv6(host)) throw new Error("private_host");
    return;
  }

  const [v4, v6] = await Promise.all([
    Deno.resolveDns(host, "A").catch(() => [] as string[]),
    Deno.resolveDns(host, "AAAA").catch(() => [] as string[]),
  ]);
  if (v4.length === 0 && v6.length === 0) throw new Error("dns_failed");
  if (v4.some(isPrivateIPv4) || v6.some(isPrivateIPv6)) throw new Error("private_host");
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, Math.min(c.length, out.length - offset));
    out.set(slice, offset);
    offset += slice.length;
  }
  return out;
}

export async function safeFetch(rawUrl: string, maxBytes: number): Promise<SafeFetchResult> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SaomaOnboardingBot/1.0; +https://saoma.io)",
          Accept: "text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5",
          "Accept-Language": "fr,en;q=0.8",
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel();
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      const bytes = await readCapped(res, maxBytes);
      return {
        ok: res.ok,
        status: res.status,
        url: url.toString(),
        contentType: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(),
        bytes,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("too_many_redirects");
}
