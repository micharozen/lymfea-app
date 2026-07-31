/**
 * Hôtes autorisés pour une redirection vers Stripe Checkout.
 * `payment.saoma.io` est le domaine personnalisé Checkout configuré sur le compte Stripe :
 * les sessions créées y pointent à la place de checkout.stripe.com.
 */
const TRUSTED_CHECKOUT_HOSTS = ['checkout.stripe.com', 'payment.saoma.io'];

export function isTrustedCheckoutUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && TRUSTED_CHECKOUT_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Valide l'URL renvoyée par Stripe puis redirige le navigateur.
 * @throws si l'URL n'est pas un hôte Checkout de confiance.
 */
export function redirectToCheckout(rawUrl: string): void {
  if (!isTrustedCheckoutUrl(rawUrl)) {
    throw new Error('Invalid redirect URL');
  }
  window.location.href = rawUrl;
}
