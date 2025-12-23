// Centralized Status Configuration
// Database values can be in French or English, UI labels are in French

export type BookingStatus = 'pending' | 'assigned' | 'confirmed' | 'completed' | 'cancelled' | 'awaiting_validation';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'charged_to_room';
export type EntityStatus = 'active' | 'pending' | 'inactive' | 'maintenance';

interface StatusConfig {
  label: string;
  badgeClass: string;
  cardClass: string;
  hexColor: string; // For emails
}

// Booking Status Configuration - matching PWA styles
export const bookingStatusConfig: Record<string, StatusConfig> = {
  // English keys
  pending: {
    label: 'En attente',
    badgeClass: 'bg-orange-500/10 text-orange-700',
    cardClass: 'bg-orange-500 text-white',
    hexColor: '#f97316',
  },
  assigned: {
    label: 'Assigné',
    badgeClass: 'bg-blue-500/10 text-blue-700',
    cardClass: 'bg-blue-500 text-white',
    hexColor: '#3b82f6',
  },
  confirmed: {
    label: 'Confirmé',
    badgeClass: 'bg-blue-500/10 text-blue-700',
    cardClass: 'bg-blue-500 text-white',
    hexColor: '#3b82f6',
  },
  completed: {
    label: 'Terminé',
    badgeClass: 'bg-green-500/10 text-green-700',
    cardClass: 'bg-green-500 text-white',
    hexColor: '#22c55e',
  },
  cancelled: {
    label: 'Annulé',
    badgeClass: 'bg-red-500/10 text-red-700',
    cardClass: 'bg-red-500 text-white',
    hexColor: '#ef4444',
  },
  awaiting_validation: {
    label: 'Validation',
    badgeClass: 'bg-purple-500/10 text-purple-700',
    cardClass: 'bg-purple-500 text-white',
    hexColor: '#8b5cf6',
  },
  // French keys (as stored in database)
  'en attente': {
    label: 'En attente',
    badgeClass: 'bg-orange-500/10 text-orange-700',
    cardClass: 'bg-orange-500 text-white',
    hexColor: '#f97316',
  },
  'assigné': {
    label: 'Assigné',
    badgeClass: 'bg-blue-500/10 text-blue-700',
    cardClass: 'bg-blue-500 text-white',
    hexColor: '#3b82f6',
  },
  'confirmé': {
    label: 'Confirmé',
    badgeClass: 'bg-blue-500/10 text-blue-700',
    cardClass: 'bg-blue-500 text-white',
    hexColor: '#3b82f6',
  },
  'terminé': {
    label: 'Terminé',
    badgeClass: 'bg-green-500/10 text-green-700',
    cardClass: 'bg-green-500 text-white',
    hexColor: '#22c55e',
  },
  'annulé': {
    label: 'Annulé',
    badgeClass: 'bg-red-500/10 text-red-700',
    cardClass: 'bg-red-500 text-white',
    hexColor: '#ef4444',
  },
  'validation': {
    label: 'Validation',
    badgeClass: 'bg-purple-500/10 text-purple-700',
    cardClass: 'bg-purple-500 text-white',
    hexColor: '#8b5cf6',
  },
};

// Payment Status Configuration - matching PWA styles
export const paymentStatusConfig: Record<string, StatusConfig> = {
  pending: {
    label: 'En attente',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    cardClass: 'bg-yellow-500 text-white',
    hexColor: '#eab308',
  },
  paid: {
    label: 'Payé',
    badgeClass: 'bg-green-100 text-green-700',
    cardClass: 'bg-green-500 text-white',
    hexColor: '#22c55e',
  },
  failed: {
    label: 'Échoué',
    badgeClass: 'bg-red-100 text-red-700',
    cardClass: 'bg-red-500 text-white',
    hexColor: '#ef4444',
  },
  refunded: {
    label: 'Remboursé',
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
  },
  charged_to_room: {
    label: 'Chambre',
    badgeClass: 'bg-blue-100 text-blue-700',
    cardClass: 'bg-blue-500 text-white',
    hexColor: '#3b82f6',
  },
  // French keys
  'en attente': {
    label: 'En attente',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    cardClass: 'bg-yellow-500 text-white',
    hexColor: '#eab308',
  },
  'payé': {
    label: 'Payé',
    badgeClass: 'bg-green-100 text-green-700',
    cardClass: 'bg-green-500 text-white',
    hexColor: '#22c55e',
  },
  'échoué': {
    label: 'Échoué',
    badgeClass: 'bg-red-100 text-red-700',
    cardClass: 'bg-red-500 text-white',
    hexColor: '#ef4444',
  },
  'remboursé': {
    label: 'Remboursé',
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
  },
  'chambre': {
    label: 'Chambre',
    badgeClass: 'bg-blue-100 text-blue-700',
    cardClass: 'bg-blue-500 text-white',
    hexColor: '#3b82f6',
  },
};

// Entity Status Configuration (Hairdressers, Concierges, Admins, Treatments, Trunks)
export const entityStatusConfig: Record<string, StatusConfig> = {
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
  // French keys
  'actif': {
    label: 'Actif',
    badgeClass: 'bg-green-500/10 text-green-700',
    cardClass: 'bg-green-500 text-white',
    hexColor: '#22c55e',
  },
  'en attente': {
    label: 'En attente',
    badgeClass: 'bg-orange-500/10 text-orange-700',
    cardClass: 'bg-orange-500 text-white',
    hexColor: '#f97316',
  },
  'inactif': {
    label: 'Inactif',
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
  },
};

// Helper function to capitalize first letter
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Helper functions
export function getBookingStatusConfig(status: string): StatusConfig {
  const normalizedStatus = status.toLowerCase();
  return bookingStatusConfig[normalizedStatus] || {
    label: capitalizeFirst(status),
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
  };
}

export function getPaymentStatusConfig(status: string): StatusConfig {
  const normalizedStatus = status.toLowerCase();
  return paymentStatusConfig[normalizedStatus] || {
    label: capitalizeFirst(status),
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
  };
}

export function getEntityStatusConfig(status: string): StatusConfig {
  const normalizedStatus = status.toLowerCase();
  return entityStatusConfig[normalizedStatus] || {
    label: capitalizeFirst(status),
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'bg-gray-500 text-white',
    hexColor: '#6b7280',
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
      return '#6b7280';
  }
}
