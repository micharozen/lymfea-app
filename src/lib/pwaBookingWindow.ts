import { addDays, endOfMonth, format, startOfMonth, subDays } from "date-fns";

/** Bornes inclusives d'une fenêtre de chargement, au format `yyyy-MM-dd`. */
export interface BookingWindow {
  from: string;
  to: string;
}

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export const DASHBOARD_BACK_DAYS = 7;
export const DASHBOARD_FORWARD_DAYS = 30;

/**
 * Nombre de jours visibles au maximum d'un coup sur le planning (vue 3 jours).
 * Sert à vérifier que toute la plage affichée tient dans la fenêtre chargée.
 */
const VISIBLE_SPAN_DAYS = 3;

/** Marge autour du mois affiché, pour couvrir une vue à cheval sur deux mois. */
const MONTH_PADDING_DAYS = 7;

/**
 * Fenêtre du tableau de bord : J-7 → J+30.
 *
 * J-7 couvre les soins récents restant à finaliser, J+30 l'agenda à venir. La
 * page ne montre de toute façon que l'à-venir ; l'historique complet vit dans
 * l'onglet Historique (voir `historyWindow`) et dans les statistiques.
 *
 * C'est la fenêtre canonique : `planningWindow` s'aligne dessus dès que
 * possible pour que les deux écrans partagent une seule entrée de cache.
 */
export function dashboardWindow(today: Date = new Date()): BookingWindow {
  return {
    from: fmt(subDays(today, DASHBOARD_BACK_DAYS)),
    to: fmt(addDays(today, DASHBOARD_FORWARD_DAYS)),
  };
}

/**
 * Fenêtre du planning, dérivée de la date affichée.
 *
 * Si toute la plage visible depuis cette date tient déjà dans la fenêtre du
 * tableau de bord, on renvoie *exactement* ses bornes : même queryKey, donc
 * aucune requête réseau quand le thérapeute passe de l'accueil à l'agenda —
 * le cas de très loin le plus courant.
 *
 * Sinon on borne au mois de la date affichée, élargi d'une semaine de chaque
 * côté. Ce calage sur les bornes du mois (et non sur la date ± une semaine)
 * est ce qui rend la fenêtre stable : tous les jours d'un même mois donnent la
 * même clé, donc naviguer jour par jour ne relance pas une requête à chaque
 * pas.
 */
export function planningWindow(anchor: Date, today: Date = new Date()): BookingWindow {
  const base = dashboardWindow(today);
  const firstVisible = fmt(anchor);
  const lastVisible = fmt(addDays(anchor, VISIBLE_SPAN_DAYS));

  if (firstVisible >= base.from && lastVisible <= base.to) return base;

  return {
    from: fmt(subDays(startOfMonth(anchor), MONTH_PADDING_DAYS)),
    to: fmt(addDays(endOfMonth(anchor), MONTH_PADDING_DAYS)),
  };
}

/**
 * Fenêtre de l'onglet Historique : J-90 → J.
 *
 * Chargée paresseusement, seulement quand l'onglet devient actif — sans quoi
 * la fenêtre J-7 du tableau de bord tronquerait l'historique à une semaine.
 */
export function historyWindow(today: Date = new Date()): BookingWindow {
  return { from: fmt(subDays(today, 90)), to: fmt(today) };
}

/** Élargit une fenêtre vers le passé, pour le « voir plus ancien » de la vue Liste. */
export function extendWindowBack(window: BookingWindow, months: number): BookingWindow {
  const from = new Date(`${window.from}T00:00:00`);
  const widened = startOfMonth(from);
  return {
    from: fmt(startOfMonth(subDays(widened, (months - 1) * 28 + 1))),
    to: window.to,
  };
}
