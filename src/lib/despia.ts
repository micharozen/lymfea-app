// Despia Native App Detection and Push Registration via URL Schemes

/**
 * Détecte si l'application tourne dans l'environnement natif Despia
 */
export const isDespia = (): boolean => {
  return window.navigator.userAgent.includes('Despia');
};

/**
 * Déclenche l'enregistrement aux notifications push via URL scheme Despia
 * @returns true si la demande a été envoyée, false si pas dans Despia
 */
export const registerForPush = (): boolean => {
  if (isDespia()) {
    console.log('[Despia] Requesting push notification permission via URL scheme');
    window.location.href = 'registerpush://';
    return true;
  } else {
    console.log('[Despia] Not in Despia environment, cannot use URL scheme');
    return false;
  }
};
