// Payment provider interface and factory.
// Mirrors the PMS pattern (_shared/pms-client.ts).
// Supports: Stripe, Adyen.

import Stripe from "stripe";

export type PaymentProviderType = "stripe" | "adyen";

export interface PaymentTestResult {
  connected: boolean;
  error?: string;
}

export interface PaymentProvider {
  testConnection(): Promise<PaymentTestResult>;
}

// ============================================================
// Stripe
// ============================================================

export interface StripeProviderConfig {
  secretKey: string;
}

export function createStripeProvider(config: StripeProviderConfig): PaymentProvider {
  return {
    async testConnection(): Promise<PaymentTestResult> {
      if (!config.secretKey) {
        return { connected: false, error: "Stripe secret key is missing" };
      }
      try {
        const stripe = new Stripe(config.secretKey, {
          apiVersion: "2025-08-27.basil",
        });
        await stripe.balance.retrieve();
        return { connected: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Stripe error";
        return { connected: false, error: message };
      }
    },
  };
}

// ============================================================
// Adyen (Management API GET /v3/me)
// ============================================================

export interface AdyenProviderConfig {
  apiKey: string;
  environment: "test" | "live";
}

export function createAdyenProvider(config: AdyenProviderConfig): PaymentProvider {
  return {
    async testConnection(): Promise<PaymentTestResult> {
      if (!config.apiKey) {
        return { connected: false, error: "Adyen API key is missing" };
      }
      const baseUrl =
        config.environment === "live"
          ? "https://management-live.adyen.com/v3"
          : "https://management-test.adyen.com/v3";

      try {
        const response = await fetch(`${baseUrl}/me`, {
          method: "GET",
          headers: {
            "X-API-Key": config.apiKey,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          return { connected: true };
        }

        const text = await response.text().catch(() => "");
        return {
          connected: false,
          error: `Adyen error (${response.status}): ${text || response.statusText}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Adyen error";
        return { connected: false, error: message };
      }
    },
  };
}

// ============================================================
// Factory
// ============================================================

// Build a provider config from a public row (non-sensitive metadata) plus a
// decrypted secrets payload pulled from Vault.
export function buildPaymentConfig(
  provider: PaymentProviderType,
  row: Record<string, any>,
  secrets: Record<string, any> | null,
): StripeProviderConfig | AdyenProviderConfig {
  switch (provider) {
    case "stripe":
      return { secretKey: secrets?.stripe_secret_key ?? "" } as StripeProviderConfig;
    case "adyen":
      return {
        apiKey: secrets?.adyen_api_key ?? "",
        environment: (row.adyen_environment === "live" ? "live" : "test"),
      } as AdyenProviderConfig;
    default:
      throw new Error(`Unsupported payment provider: ${provider}`);
  }
}

export function getPaymentProvider(
  provider: PaymentProviderType,
  config: StripeProviderConfig | AdyenProviderConfig,
): PaymentProvider {
  switch (provider) {
    case "stripe":
      return createStripeProvider(config as StripeProviderConfig);
    case "adyen":
      return createAdyenProvider(config as AdyenProviderConfig);
    default:
      throw new Error(`Unsupported payment provider: ${provider}`);
  }
}
