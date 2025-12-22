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
    badgeClass: 'bg-warning/15 text-warning-foreground border-warning/40 hover:bg-warning/25',
    cardClass: 'bg-warning text-warning-foreground border-warning/40',
    hexColor: '#f59e0b',
  },
  assigned: {
    label: 'Assigné',
    badgeClass: 'bg-info/15 text-info-foreground border-info/40 hover:bg-info/25',
    cardClass: 'bg-info text-info-foreground border-info/40',
    hexColor: '#3b82f6',
  },
  confirmed: {
    label: 'Confirmé',
    badgeClass: 'bg-info/15 text-info-foreground border-info/40 hover:bg-info/25',
    cardClass: 'bg-info text-info-foreground border-info/40',
    hexColor: '#3b82f6',
  },
  completed: {
    label: 'Terminé',
    badgeClass: 'bg-success/15 text-success-foreground border-success/40 hover:bg-success/25',
    cardClass: 'bg-success text-success-foreground border-success/40',
    hexColor: '#10b981',
  },
  cancelled: {
    label: 'Annulé',
    badgeClass: 'bg-destructive/15 text-destructive-foreground border-destructive/40 hover:bg-destructive/25',
    cardClass: 'bg-destructive text-destructive-foreground border-destructive/40',
    hexColor: '#ef4444',
  },
  awaiting_validation: {
    label: 'Validation',
    badgeClass: 'bg-accent/20 text-accent-foreground border-accent/40 hover:bg-accent/30',
    cardClass: 'bg-accent text-accent-foreground border-accent/40',
    hexColor: '#8b5cf6',
  },
};

// Payment Status Configuration
export const paymentStatusConfig: Record<PaymentStatus, StatusConfig> = {
  pending: {
    label: 'En attente',
    badgeClass: 'bg-warning/15 text-warning-foreground border-warning/40 hover:bg-warning/25',
    cardClass: 'bg-warning text-warning-foreground border-warning/40',
    hexColor: '#f59e0b',
  },
  paid: {
    label: 'Payé',
    badgeClass: 'bg-success/15 text-success-foreground border-success/40 hover:bg-success/25',
    cardClass: 'bg-success text-success-foreground border-success/40',
    hexColor: '#10b981',
  },
  failed: {
    label: 'Échoué',
    badgeClass: 'bg-destructive/15 text-destructive-foreground border-destructive/40 hover:bg-destructive/25',
    cardClass: 'bg-destructive text-destructive-foreground border-destructive/40',
    hexColor: '#ef4444',
  },
  refunded: {
    label: 'Remboursé',
    badgeClass: 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/50',
    cardClass: 'bg-muted text-foreground border-border',
    hexColor: '#64748b',
  },
  charged_to_room: {
    label: 'Chambre',
    badgeClass: 'bg-info/15 text-info-foreground border-info/40 hover:bg-info/25',
    cardClass: 'bg-info text-info-foreground border-info/40',
    hexColor: '#3b82f6',
  },
};

// Entity Status Configuration (Hairdressers, Concierges, Admins, Treatments, Trunks)
export const entityStatusConfig: Record<EntityStatus, StatusConfig> = {
  active: {
    label: 'Actif',
    badgeClass: 'bg-success/15 text-success-foreground border-success/40 hover:bg-success/25',
    cardClass: 'bg-success text-success-foreground border-success/40',
    hexColor: '#10b981',
  },
  pending: {
    label: 'En attente',
    badgeClass: 'bg-warning/15 text-warning-foreground border-warning/40 hover:bg-warning/25',
    cardClass: 'bg-warning text-warning-foreground border-warning/40',
    hexColor: '#f59e0b',
  },
  inactive: {
    label: 'Inactif',
    badgeClass: 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/50',
    cardClass: 'bg-muted text-foreground border-border',
    hexColor: '#64748b',
  },
  maintenance: {
    label: 'Maintenance',
    badgeClass: 'bg-destructive/15 text-destructive-foreground border-destructive/40 hover:bg-destructive/25',
    cardClass: 'bg-destructive text-destructive-foreground border-destructive/40',
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
