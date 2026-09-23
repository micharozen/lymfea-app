import { brand } from "./brand.ts";

/**
 * Apps OneSignal web configurées.
 *
 * Une app OneSignal web est verrouillée sur un seul domaine, et la PWA est
 * servie sur deux : `app.eiaspa.fr` (thérapeutes Eïa déjà installés) et
 * `app.saoma.io` (toutes les autres organisations). Chaque thérapeute n'est
 * abonné que dans l'app du domaine où il a installé la PWA : on envoie donc par
 * chacune, avec un lien de clic sur *son* domaine — un lien vers un autre
 * domaine que la PWA ouvre Safari au lieu de l'app.
 */
export interface OneSignalApp {
  label: string;
  appId: string;
  restApiKey: string;
  /** Origine de la PWA abonnée à cette app, sans slash final. */
  siteUrl: string;
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

export function oneSignalApps(): OneSignalApp[] {
  const apps: OneSignalApp[] = [];

  const eiaAppId = Deno.env.get("ONESIGNAL_APP_ID");
  const eiaKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (eiaAppId && eiaKey) {
    apps.push({
      label: "eia",
      appId: eiaAppId,
      restApiKey: eiaKey,
      // Repli sur SITE_URL : comportement d'avant tant que ONESIGNAL_SITE_URL
      // n'est pas posé. SITE_URL reste réservée à Stripe OAuth à terme.
      siteUrl: trimSlash(
        Deno.env.get("ONESIGNAL_SITE_URL") || Deno.env.get("SITE_URL") || `https://${brand.appDomain}`,
      ),
    });
  }

  const saomaAppId = Deno.env.get("ONESIGNAL_SAOMA_APP_ID");
  const saomaKey = Deno.env.get("ONESIGNAL_SAOMA_REST_API_KEY");
  const saomaSiteUrl = Deno.env.get("ONESIGNAL_SAOMA_SITE_URL");
  if (saomaAppId && saomaKey && saomaSiteUrl) {
    apps.push({
      label: "saoma",
      appId: saomaAppId,
      restApiKey: saomaKey,
      siteUrl: trimSlash(saomaSiteUrl),
    });
  }

  return apps;
}
