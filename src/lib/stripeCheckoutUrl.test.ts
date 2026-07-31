import { describe, it, expect } from 'vitest';
import { isTrustedCheckoutUrl } from './stripeCheckoutUrl';

describe('isTrustedCheckoutUrl', () => {
  it('accepte le domaine Checkout standard', () => {
    expect(isTrustedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123')).toBe(true);
  });

  it('accepte le domaine personnalisé Checkout', () => {
    expect(isTrustedCheckoutUrl('https://payment.saoma.io/c/pay/cs_live_123')).toBe(true);
  });

  it('refuse un hôte qui se termine par un domaine de confiance', () => {
    expect(isTrustedCheckoutUrl('https://evil-checkout.stripe.com.attacker.io/c/pay/x')).toBe(false);
    expect(isTrustedCheckoutUrl('https://evilstripe.com/c/pay/x')).toBe(false);
  });

  it('refuse le HTTP non chiffré', () => {
    expect(isTrustedCheckoutUrl('http://checkout.stripe.com/c/pay/x')).toBe(false);
  });

  it('refuse une URL invalide', () => {
    expect(isTrustedCheckoutUrl('pas-une-url')).toBe(false);
  });
});
