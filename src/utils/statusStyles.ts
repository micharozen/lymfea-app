// Centralized Status Configuration
// All database values are now in English

export type BookingStatus = 'pending' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled' | 'noshow' | 'quote_pending' | 'waiting_approval' | 'alternative_proposed' | 'awaiting_hairdresser_selection';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'charged_to_room' | 'pending_partner_billing' | 'card_saved';
export type EntityStatus = 'active' | 'pending' | 'inactive' | 'maintenance';

interface StatusConfig {
  label: string;
  badgeClass: string;
  cardClass: string;
  calendarCardClass?: string; // Pastel version for calendar cards
  hexColor: string; // For emails
  pulse?: boolean; // For animated badges
}

// Booking Status Configuration - matching real-world service lifecycle
export const bookingStatusConfig: Record<BookingStatus, StatusConfig> = {
  pending: {
    label: 'En attente',
    badgeClass: 'bg-orange-100 text-orange-800 border border-orange-300',
    cardClass: 'bg-orange-500 text-white',
    calendarCardClass: 'bg-orange-50 text-orange-900 dark:bg-orange-900/20 dark:text-orange-100',
    hexColor: '#f97316',
  },
  confirmed: {
    label: 'Confirmé',
    badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    cardClass: 'bg-emerald-500 text-white',
    calendarCardClass: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100',
    hexColor: '#10b981',
  },
  ongoing: {
    label: 'En cours',
    badgeClass: 'bg-indigo-100 text-indigo-800 border border-indigo-300 animate-pulse',
    cardClass: 'bg-indigo-600 text-white animate-pulse',
    calendarCardClass: 'bg-indigo-50 text-indigo-900 dark:bg-indigo-900/20 dark:text-indigo-100',
    hexColor: '#4f46e5',
    pulse: true,
  },
  completed: {
    label: 'Terminé',
    badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    cardClass: 'bg-emerald-400 text-white',
    calendarCardClass: 'bg-emerald-50/60 text-emerald-800 dark:bg-emerald-900/10 dark:text-emerald-200',
    hexColor: '#34d399',
  },
  cancelled: {
    label: 'Annulé',
    badgeClass: 'bg-gray-100 text-red-600 border border-gray-300 line-through',
    cardClass: 'bg-gray-400 text-white line-through',
    calendarCardClass: 'bg-cancelled-stripes text-red-700 dark:text-red-300 line-through',
    hexColor: '#9ca3af',
  },
  noshow: {
    label: 'No-show',
    badgeClass: 'bg-rose-100 text-rose-800 border border-rose-400 font-bold',
    cardClass: 'bg-rose-600 text-white',
    calendarCardClass: 'bg-rose-50 text-rose-900 dark:bg-rose-900/20 dark:text-rose-100',
    hexColor: '#e11d48',
  },
  quote_pending: {
    label: 'Devis',
    badgeClass: 'bg-violet-100 text-violet-800 border border-violet-300',
    cardClass: 'bg-violet-500 text-white',
    calendarCardClass: 'bg-violet-50 text-violet-900 dark:bg-violet-900/20 dark:text-violet-100',
    hexColor: '#8b5cf6',
  },
  waiting_approval: {
    label: 'Attente',
    badgeClass: 'bg-purple-100 text-purple-800 border border-purple-400',
    cardClass: 'bg-purple-500 text-white',
    calendarCardClass: 'bg-purple-50 text-purple-900 dark:bg-purple-900/20 dark:text-purple-100',
    hexColor: '#a855f7',
  },
  alternative_proposed: {
    label: 'Créneau proposé',
    badgeClass: 'bg-violet-100 text-violet-700 border border-violet-300',
    cardClass: 'bg-violet-500 text-white',
    calendarCardClass: 'bg-violet-50 text-violet-900 dark:bg-violet-900/20 dark:text-violet-100',
    hexColor: '#8b5cf6',
  },
  awaiting_hairdresser_selection: {
    label: 'Attente thérapeute',
    badgeClass: 'bg-violet-100 text-violet-800 border border-violet-300',
    cardClass: 'bg-violet-500 text-white',
    calendarCardClass: 'bg-violet-50 text-violet-900 dark:bg-violet-900/20 dark:text-violet-100',
    hexColor: '#8b5cf6',
    pulse: true,
  },
};

// Payment Status Configuration - emoji only
export const paymentStatusConfig: Record<PaymentStatus, StatusConfig> = {
  pending: {
    label: '💳',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    cardClass: 'bg-yellow-500 text-white',
    hexColor: '#eab308',
  },
  paid: {
    label: '✅',
    badgeClass: 'bg-green-100 text-green-700',
    cardClass: 'bg-green-500 text-white',
    hexColor: '#22c55e',
  },
  failed: {
    label: '❌',
    badgeClass: 'bg-red-100 text-red-700',
    cardClass: 'bg-red-500 text-white',
    hexColor: '#ef4444',
  },
  refunded: {
    label: '↩️',
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
  },
  charged_to_room: {
    label: '🏨',
    badgeClass: 'bg-blue-100 text-blue-700',
    cardClass: 'bg-blue-500 text-white',
    hexColor: '#3b82f6',
  },
  pending_partner_billing: {
    label: 'Paiement partenaire',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    cardClass: 'bg-indigo-500 text-white',
    hexColor: '#6366f1',
  },
  card_saved: {
    label: 'Carte enregistrée',
    badgeClass: 'bg-purple-100 text-purple-700',
    cardClass: 'bg-purple-500 text-white',
    hexColor: '#a855f7',
  },
};

// Entity Status Configuration (Therapists, Concierges, Admins, Treatments, Treatment Rooms)
export const entityStatusConfig: Record<EntityStatus, StatusConfig> = {
  active: {
    label: 'Actif',
    badgeClass: 'bg-green-500/10 text-green-700',
    cardClass: 'bg-green-500 text-white',
    hexColor: '#22c55e',
  },
  pending: {
    label: 'En attente',
    badgeClass: 'bg-orange-500/10 text-orange-700',
    cardClass: 'bg-orange-500 text-white',
    hexColor: '#f97316',
  },
  inactive: {
    label: 'Inactif',
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
  },
  maintenance: {
    label: 'Maintenance',
    badgeClass: 'bg-red-500/10 text-red-700',
    cardClass: 'bg-red-500 text-white',
    hexColor: '#ef4444',
  },
};

// Helper function to capitalize first letter
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Helper functions
export function getBookingStatusConfig(status: string): StatusConfig {
  const raw = (status || "").toString();
  const normalized = raw.toLowerCase().trim();

  const aliases: Partial<Record<string, BookingStatus>> = {
    "en attente": "pending",
    "devis": "quote_pending",
    "en cours": "ongoing",
    "terminé": "completed",
    "termine": "completed",
    "annulé": "cancelled",
    "annule": "cancelled",
    "confirmé": "confirmed",
    "confirme": "confirmed",
    "créneau proposé": "alternative_proposed",
    "creneau propose": "alternative_proposed",
  };

  const key = (aliases[normalized] || (normalized as BookingStatus)) as BookingStatus;

  return bookingStatusConfig[key] || {
    label: capitalizeFirst(raw),
    badgeClass: 'bg-muted text-foreground border border-border',
    cardClass: 'bg-muted text-foreground',
    hexColor: '#6b7280',
  };
}

export function getPaymentStatusConfig(status: string | null | undefined): StatusConfig {
  // Handle null/undefined - return a "not set" state
  if (!status) {
    return {
      label: '⏳',
      badgeClass: 'bg-gray-100 text-gray-500',
      cardClass: 'bg-gray-400 text-white',
      hexColor: '#9ca3af',
    };
  }
  
  const normalizedStatus = status.toLowerCase() as PaymentStatus;
  return paymentStatusConfig[normalizedStatus] || {
    label: capitalizeFirst(status),
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
  };
}

export function getEntityStatusConfig(status: string): StatusConfig {
  const normalizedStatus = status.toLowerCase() as EntityStatus;
  return entityStatusConfig[normalizedStatus] || {
    label: capitalizeFirst(status),
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Calendar flow stages
// Single source of truth for the planning/calendar cards AND the legend.
// Combines booking status + payment status into the reservation-flow stages
// shown on the bookings page (e.g. "awaiting therapist + payment").
// ─────────────────────────────────────────────────────────────────────────

export type CalendarFlowStageKey =
  | 'awaiting_therapist_payment'
  | 'awaiting_therapist'
  | 'payment_pending'
  | 'confirmed'
  | 'ongoing'
  | 'completed'
  | 'quote'
  | 'cancelled'
  | 'noshow';

interface CalendarFlowStage {
  key: CalendarFlowStageKey;
  label: string; // FR
  labelEn: string;
  swatchClass: string; // solid color for the legend swatch
  cardClass: string; // pastel background for the calendar card
}

// Ordered following the reservation lifecycle (used as-is by the legend).
export const calendarFlowStages: Record<CalendarFlowStageKey, CalendarFlowStage> = {
  awaiting_therapist_payment: {
    key: 'awaiting_therapist_payment',
    label: 'Attente thérapeute + paiement',
    labelEn: 'Awaiting therapist + payment',
    swatchClass: 'bg-amber-500',
    cardClass: 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100',
  },
  awaiting_therapist: {
    key: 'awaiting_therapist',
    label: 'Attente thérapeute',
    labelEn: 'Awaiting therapist',
    swatchClass: 'bg-violet-500',
    cardClass: 'bg-violet-50 text-violet-900 dark:bg-violet-900/20 dark:text-violet-100',
  },
  payment_pending: {
    key: 'payment_pending',
    label: 'Paiement en attente',
    labelEn: 'Payment pending',
    swatchClass: 'bg-blue-500',
    cardClass: 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100',
  },
  confirmed: {
    key: 'confirmed',
    label: 'Confirmé',
    labelEn: 'Confirmed',
    swatchClass: 'bg-emerald-500',
    cardClass: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100',
  },
  ongoing: {
    key: 'ongoing',
    label: 'En cours',
    labelEn: 'Ongoing',
    swatchClass: 'bg-indigo-500',
    cardClass: 'bg-indigo-50 text-indigo-900 dark:bg-indigo-900/20 dark:text-indigo-100',
  },
  completed: {
    key: 'completed',
    label: 'Terminé',
    labelEn: 'Completed',
    swatchClass: 'bg-emerald-300',
    cardClass: 'bg-emerald-50/60 text-emerald-800 dark:bg-emerald-900/10 dark:text-emerald-200',
  },
  quote: {
    key: 'quote',
    label: 'Devis / Proposé',
    labelEn: 'Quote / Proposed',
    swatchClass: 'bg-fuchsia-500',
    cardClass: 'bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-900/20 dark:text-fuchsia-100',
  },
  cancelled: {
    key: 'cancelled',
    label: 'Annulé',
    labelEn: 'Cancelled',
    swatchClass: 'bg-cancelled-stripes border border-gray-300',
    cardClass: 'bg-cancelled-stripes text-red-700 dark:text-red-300 line-through',
  },
  noshow: {
    key: 'noshow',
    label: 'No-show',
    labelEn: 'No-show',
    swatchClass: 'bg-rose-600',
    cardClass: 'bg-rose-50 text-rose-900 dark:bg-rose-900/20 dark:text-rose-100',
  },
};

// Stages in lifecycle order — drives the calendar legend.
export const calendarFlowStageOrder: CalendarFlowStageKey[] = [
  'awaiting_therapist_payment',
  'awaiting_therapist',
  'payment_pending',
  'confirmed',
  'ongoing',
  'completed',
  'quote',
  'cancelled',
  'noshow',
];

const QUOTE_STATUSES = new Set(['quote_pending', 'waiting_approval', 'alternative_proposed']);
const AWAITING_THERAPIST_STATUSES = new Set(['pending', 'awaiting_hairdresser_selection']);
// Empty/null payment, on-site pending, or a locked Stripe pre-reservation all
// mean "not yet paid". Partner billing, card-saved, paid, charged-to-room are settled.
const AWAITING_PAYMENT_STATUSES = new Set(['pending', 'awaiting_payment']);

/**
 * Resolve the reservation-flow stage for a calendar card from its booking +
 * payment status. Mirrors the dual badges shown on the bookings page.
 */
export function getCalendarFlowStage(
  status: string,
  paymentStatus?: string | null
): CalendarFlowStage {
  const s = (status || '').toLowerCase().trim();
  const p = (paymentStatus || '').toLowerCase().trim();

  if (s === 'cancelled') return calendarFlowStages.cancelled;
  if (s === 'noshow') return calendarFlowStages.noshow;
  if (s === 'completed') return calendarFlowStages.completed;
  if (QUOTE_STATUSES.has(s)) return calendarFlowStages.quote;

  const awaitingPayment = p === '' || AWAITING_PAYMENT_STATUSES.has(p);
  const awaitingTherapist = AWAITING_THERAPIST_STATUSES.has(s);

  if (awaitingTherapist && awaitingPayment) return calendarFlowStages.awaiting_therapist_payment;
  if (awaitingTherapist) return calendarFlowStages.awaiting_therapist;
  if (s === 'ongoing') return calendarFlowStages.ongoing;
  if (awaitingPayment) return calendarFlowStages.payment_pending;
  return calendarFlowStages.confirmed;
}

// Email color helper - returns hex color for status
export function getStatusHexColor(status: string, type: 'booking' | 'payment' | 'entity' = 'booking'): string {
  switch (type) {
    case 'booking':
      return getBookingStatusConfig(status).hexColor;
    case 'payment':
      return getPaymentStatusConfig(status).hexColor;
    case 'entity':
      return getEntityStatusConfig(status).hexColor;
    default:
      return '#6b7280';
  }
}
