// Centralized Status Configuration
// All database values are in English, UI labels can be localized

export type BookingStatus = 'pending' | 'assigned' | 'confirmed' | 'completed' | 'cancelled' | 'awaiting_validation';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'charged_to_room';
export type EntityStatus = 'active' | 'pending' | 'inactive' | 'maintenance';

interface StatusConfig {
  label: string;
  badgeClass: string;
  cardClass: string;
  hexColor: string; // For emails
}

// Booking Status Configuration
export const bookingStatusConfig: Record<BookingStatus, StatusConfig> = {
  pending: {
    label: 'En attente',
    badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20',
    cardClass: 'bg-amber-500 text-white border-amber-600',
    hexColor: '#f59e0b',
  },
  assigned: {
    label: 'Assigné',
    badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/30 hover:bg-blue-500/20',
    cardClass: 'bg-blue-500 text-white border-blue-600',
    hexColor: '#3b82f6',
  },
  confirmed: {
    label: 'Confirmé',
    badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/30 hover:bg-blue-500/20',
    cardClass: 'bg-blue-500 text-white border-blue-600',
    hexColor: '#3b82f6',
  },
  completed: {
    label: 'Terminé',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20',
    cardClass: 'bg-emerald-500 text-white border-emerald-600',
    hexColor: '#10b981',
  },
  cancelled: {
    label: 'Annulé',
    badgeClass: 'bg-red-500/10 text-red-700 border-red-500/30 hover:bg-red-500/20',
    cardClass: 'bg-red-500 text-white border-red-600',
    hexColor: '#ef4444',
  },
  awaiting_validation: {
    label: 'Validation',
    badgeClass: 'bg-purple-500/10 text-purple-700 border-purple-500/30 hover:bg-purple-500/20',
    cardClass: 'bg-purple-500 text-white border-purple-600',
    hexColor: '#8b5cf6',
  },
};

// Payment Status Configuration
export const paymentStatusConfig: Record<PaymentStatus, StatusConfig> = {
  pending: {
    label: 'En attente',
    badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20',
    cardClass: 'bg-amber-500 text-white border-amber-600',
    hexColor: '#f59e0b',
  },
  paid: {
    label: 'Payé',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20',
    cardClass: 'bg-emerald-500 text-white border-emerald-600',
    hexColor: '#10b981',
  },
  failed: {
    label: 'Échoué',
    badgeClass: 'bg-red-500/10 text-red-700 border-red-500/30 hover:bg-red-500/20',
    cardClass: 'bg-red-500 text-white border-red-600',
    hexColor: '#ef4444',
  },
  refunded: {
    label: 'Remboursé',
    badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/30 hover:bg-slate-500/20',
    cardClass: 'bg-slate-500 text-white border-slate-600',
    hexColor: '#64748b',
  },
  charged_to_room: {
    label: 'Chambre',
    badgeClass: 'bg-blue-500/10 text-blue-700 border-blue-500/30 hover:bg-blue-500/20',
    cardClass: 'bg-blue-500 text-white border-blue-600',
    hexColor: '#3b82f6',
  },
};

// Entity Status Configuration (Hairdressers, Concierges, Admins, Treatments, Trunks)
export const entityStatusConfig: Record<EntityStatus, StatusConfig> = {
  active: {
    label: 'Actif',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20',
    cardClass: 'bg-emerald-500 text-white border-emerald-600',
    hexColor: '#10b981',
  },
  pending: {
    label: 'En attente',
    badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20',
    cardClass: 'bg-amber-500 text-white border-amber-600',
    hexColor: '#f59e0b',
  },
  inactive: {
    label: 'Inactif',
    badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/30 hover:bg-slate-500/20',
    cardClass: 'bg-slate-500 text-white border-slate-600',
    hexColor: '#64748b',
  },
  maintenance: {
    label: 'Maintenance',
    badgeClass: 'bg-red-500/10 text-red-700 border-red-500/30 hover:bg-red-500/20',
    cardClass: 'bg-red-500 text-white border-red-600',
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
  const normalizedStatus = status.toLowerCase() as BookingStatus;
  return bookingStatusConfig[normalizedStatus] || {
    label: capitalizeFirst(status),
    badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/30',
    cardClass: 'bg-slate-500 text-white border-slate-600',
    hexColor: '#64748b',
  };
}

export function getPaymentStatusConfig(status: string): StatusConfig {
  const normalizedStatus = status.toLowerCase() as PaymentStatus;
  return paymentStatusConfig[normalizedStatus] || {
    label: capitalizeFirst(status),
    badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/30',
    cardClass: 'bg-slate-500 text-white border-slate-600',
    hexColor: '#64748b',
  };
}

export function getEntityStatusConfig(status: string): StatusConfig {
  const normalizedStatus = status.toLowerCase() as EntityStatus;
  return entityStatusConfig[normalizedStatus] || {
    label: capitalizeFirst(status),
    badgeClass: 'bg-slate-500/10 text-slate-700 border-slate-500/30',
    cardClass: 'bg-slate-500 text-white border-slate-600',
    hexColor: '#64748b',
  };
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
      return '#64748b';
  }
}
