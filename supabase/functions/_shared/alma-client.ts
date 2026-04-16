/**
 * Alma BNPL API client for Edge Functions (Deno runtime).
 *
 * Usage:
 *   import { createAlmaPayment, getAlmaPayment, checkAlmaEligibility } from '../_shared/alma-client.ts';
 *
 * Environment variables required:
 *   ALMA_API_KEY   — sk_test_* (sandbox) or sk_live_* (production)
 *   ALMA_API_MODE  — "test" | "live" (determines base URL)
 */

const BASE_URLS: Record<string, string> = {
  test: 'https://api.sandbox.getalma.eu',
  live: 'https://api.getalma.eu',
};

function getBaseUrl(): string {
  const mode = Deno.env.get('ALMA_API_MODE') || 'test';
  return BASE_URLS[mode] || BASE_URLS.test;
}

function getApiKey(): string {
  const key = Deno.env.get('ALMA_API_KEY');
  if (!key) throw new Error('ALMA_API_KEY is not set');
  return key;
}

/**
 * Low-level fetch wrapper with Alma auth header and error handling.
 */
export async function almaFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Alma-Auth ${getApiKey()}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> || {}),
  };

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[ALMA] ${init.method || 'GET'} ${path} → ${res.status}:`, body);
    throw new Error(`Alma API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AlmaEligibilityQuery {
  installments_count: number;
}

export interface AlmaEligibilityResult {
  eligible: boolean;
  installments_count: number;
  constraints?: { purchase_amount?: { minimum: number; maximum: number } };
  payment_plan?: Array<{
    purchase_amount: number;
    customer_fee: number;
    due_date: number; // unix timestamp
  }>;
}

export interface AlmaCreatePaymentPayload {
  payment: {
    purchase_amount: number; // in cents
    installments_count: number;
    return_url: string;
    ipn_callback_url: string;
    custom_data?: Record<string, string>;
    locale?: string;
  };
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
}

export interface AlmaPayment {
  id: string;
  url: string;
  state: string; // 'not_started' | 'in_progress' | 'paid' | 'expired' etc.
  purchase_amount: number;
  customer_fee: number;
  payment_plan: Array<{
    purchase_amount: number;
    customer_fee: number;
    due_date: number;
    state: string;
  }>;
  custom_data?: Record<string, string>;
  orders: Array<{ merchant_reference?: string }>;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Check payment plan eligibility for a given purchase amount.
 * Returns one result per queried installments_count.
 */
export async function checkAlmaEligibility(
  purchaseAmountCents: number,
  queries: AlmaEligibilityQuery[] = [
    { installments_count: 2 },
    { installments_count: 3 },
    { installments_count: 4 },
  ],
): Promise<AlmaEligibilityResult[]> {
  return almaFetch<AlmaEligibilityResult[]>('/v1/payments/eligibility', {
    method: 'POST',
    body: JSON.stringify({
      purchase_amount: purchaseAmountCents,
      queries,
    }),
  });
}

/**
 * Create an Alma payment and get the hosted checkout URL.
 */
export async function createAlmaPayment(
  payload: AlmaCreatePaymentPayload,
): Promise<AlmaPayment> {
  return almaFetch<AlmaPayment>('/v1/payments', {
    method: 'POST',
    body: JSON.stringify({
      origin: 'online',
      ...payload,
    }),
  });
}

/**
 * Re-fetch an Alma payment by ID (used in webhook to verify IPN).
 */
export async function getAlmaPayment(paymentId: string): Promise<AlmaPayment> {
  return almaFetch<AlmaPayment>(`/v1/payments/${paymentId}`);
}
