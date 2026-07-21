/**
 * Comparatif détaillé des offres Starter / Pro affiché sur la landing.
 *
 * Chaque ligne ne référence que des fonctionnalités réellement livrées. Les
 * fonctionnalités non livrées vivent dans la section `soon` et sont marquées
 * comme telles — ne jamais y mettre `yes`.
 *
 * Les libellés sont dans `landing.json` sous `planComparison.*`.
 */

/** Marque affichée dans une cellule, ou clé i18n d'une valeur textuelle. */
export type PlanMark = "yes" | "no" | "soon" | "onRequest";

export type PlanValue = PlanMark | { valueKey: string };

export interface PlanRow {
  /** Clé i18n : `planComparison.rows.<key>.label` et `.note` (optionnelle). */
  key: string;
  starter: PlanValue;
  pro: PlanValue;
  /** Différenciateur mis en avant visuellement. */
  highlight?: boolean;
}

export interface PlanSection {
  /** Clé i18n : `planComparison.sections.<key>`. */
  key: string;
  rows: PlanRow[];
}

export const PLAN_SECTIONS: PlanSection[] = [
  {
    key: "booking",
    rows: [
      {
        key: "onlineBookings",
        starter: { valueKey: "perMonth150" },
        pro: { valueKey: "unlimited" },
        highlight: true,
      },
      { key: "qrCode", starter: "yes", pro: "yes" },
      { key: "clientWebapp", starter: "yes", pro: "yes" },
      { key: "backOffice", starter: "yes", pro: "yes" },
      { key: "multiRoomAgenda", starter: "yes", pro: "yes" },
      { key: "duoBookings", starter: "yes", pro: "yes" },
      { key: "cancellationNoShow", starter: "yes", pro: "yes" },
      { key: "cures", starter: "no", pro: "yes", highlight: true },
      { key: "quotes", starter: "no", pro: "yes" },
      { key: "scheduleAlerts", starter: "no", pro: "yes" },
    ],
  },
  {
    key: "therapistApp",
    rows: [
      { key: "therapistMobileApp", starter: "yes", pro: "yes" },
      { key: "pushNotifications", starter: "yes", pro: "yes" },
      { key: "inRoomUpsell", starter: "yes", pro: "yes" },
      { key: "alternativeSlot", starter: "yes", pro: "yes" },
      { key: "therapistStats", starter: "yes", pro: "yes" },
      { key: "therapistInvoices", starter: "no", pro: "yes" },
    ],
  },
  {
    key: "branding",
    rows: [
      { key: "customization", starter: "yes", pro: "yes" },
      {
        key: "treatmentCategories",
        starter: { valueKey: "unlimited" },
        pro: { valueKey: "unlimited" },
      },
      { key: "whiteLabel", starter: "yes", pro: "yes" },
      {
        key: "emailCustomization",
        starter: { valueKey: "advanced" },
        pro: { valueKey: "bespoke" },
      },
      { key: "bilingual", starter: "yes", pro: "yes" },
    ],
  },
  {
    key: "payments",
    rows: [
      { key: "onlinePayment", starter: "yes", pro: "yes" },
      { key: "tapToPay", starter: "yes", pro: "yes" },
      { key: "paymentLinks", starter: "yes", pro: "yes" },
      { key: "giftCards", starter: "yes", pro: "yes" },
      { key: "promoCodes", starter: "no", pro: "onRequest" },
      { key: "roomCharge", starter: "no", pro: "yes", highlight: true },
      { key: "abandonedCart", starter: "no", pro: "yes", highlight: true },
      { key: "dailyClosure", starter: "no", pro: "yes" },
      { key: "autoInvoicing", starter: "no", pro: "yes", highlight: true },
    ],
  },
  {
    key: "integrations",
    rows: [
      { key: "stripe", starter: "yes", pro: "yes" },
      { key: "sms", starter: "yes", pro: "yes" },
      { key: "pms", starter: "no", pro: "yes", highlight: true },
      { key: "whatsapp", starter: "no", pro: "yes" },
      { key: "slack", starter: "no", pro: "yes" },
      { key: "publicApi", starter: "no", pro: "yes" },
      { key: "sso", starter: "no", pro: "onRequest" },
    ],
  },
  {
    key: "automation",
    rows: [
      { key: "confirmationEmails", starter: "yes", pro: "yes" },
      { key: "reminders", starter: "yes", pro: "yes" },
      { key: "staffNotifications", starter: "yes", pro: "yes" },
      { key: "satisfactionSurvey", starter: "yes", pro: "yes" },
      { key: "aiInbound", starter: "no", pro: "yes", highlight: true },
      { key: "unifiedInbox", starter: "no", pro: "yes" },
    ],
  },
  {
    key: "clients",
    rows: [
      { key: "clientRecords", starter: "yes", pro: "yes" },
      { key: "clientPortal", starter: "no", pro: "yes" },
    ],
  },
  {
    key: "administration",
    rows: [
      { key: "unlimitedSeats", starter: "yes", pro: "yes" },
      { key: "conciergeAccounts", starter: "yes", pro: "yes" },
      {
        key: "analyticsDashboard",
        starter: { valueKey: "complete" },
        pro: { valueKey: "complete" },
      },
      { key: "financialReports", starter: "yes", pro: "yes" },
      { key: "clientFunnel", starter: "no", pro: "yes", highlight: true },
      { key: "activityForecast", starter: "no", pro: "yes" },
      { key: "multiVenue", starter: "no", pro: "yes", highlight: true },
      { key: "supportTickets", starter: "no", pro: "yes" },
      {
        key: "onboarding",
        starter: { valueKey: "selfServe" },
        pro: { valueKey: "turnkey" },
      },
      {
        key: "support",
        starter: { valueKey: "supportEmail" },
        pro: { valueKey: "supportDedicated" },
      },
    ],
  },
  {
    key: "soon",
    rows: [
      { key: "pos", starter: "soon", pro: "soon" },
      { key: "marketingAutomation", starter: "soon", pro: "soon" },
      { key: "npsGoogle", starter: "soon", pro: "soon" },
      { key: "predictiveAnalytics", starter: "soon", pro: "soon" },
    ],
  },
];
