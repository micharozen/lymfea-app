/**
 * Venue Terms Hook
 *
 * This hook provides venue-type-aware terminology for the UI.
 * It returns the appropriate terms based on whether the venue is a hotel or coworking space.
 */

import { useTranslation } from 'react-i18next';

export type VenueType = 'hotel' | 'coworking' | 'enterprise';

export interface VenueTerms {
  /** The venue type label (Hotel / Coworking Space) */
  venueName: string;
  /** The location identifier label (Room / Workspace) */
  locationName: string;
  /** The location number label (Room Number / Workspace Number) */
  locationNumberLabel: string;
  /** The in-location disclaimer text */
  disclaimer: string;
  /** Whether this venue supports room payment */
  supportsRoomPayment: boolean;
  /** The "Add to Room/Workspace" payment label */
  addToLocationLabel: string;
  /** The "Add to Room/Workspace" payment description */
  addToLocationDesc: string;
  /** The exclusive service headline (EXCLUSIVE ROOM SERVICE / EXCLUSIVE WORKSPACE SERVICE) */
  exclusiveServiceLabel: string;
  /** The service description for the welcome page */
  serviceDescription: string;
}

/**
 * Hook to get venue-type-aware terminology
 *
 * @param venueType - The type of venue ('hotel' or 'coworking')
 * @returns Object with venue-specific terms
 *
 * @example
 * const { locationNumberLabel, supportsRoomPayment } = useVenueTerms('coworking');
 * // locationNumberLabel = "Workspace Number"
 * // supportsRoomPayment = false
 */
export const useVenueTerms = (venueType: VenueType | null | undefined): VenueTerms => {
  const { t } = useTranslation('client');

  const isCoworking = venueType === 'coworking';
  const isEnterprise = venueType === 'enterprise';
  const isNonHotel = isCoworking || isEnterprise;

  return {
    venueName: isEnterprise
      ? t('venue.enterprise', 'Enterprise')
      : isCoworking
      ? t('venue.coworking', 'Coworking Space')
      : t('venue.hotel', 'Hotel'),
    locationName: isNonHotel
      ? t('venue.workspace', 'Workspace')
      : t('venue.room', 'Room'),
    locationNumberLabel: isNonHotel
      ? t('venue.workspaceNumber', 'Workspace Number')
      : t('venue.roomNumber', 'Room Number'),
    disclaimer: isEnterprise
      ? t('venue.inEnterpriseDisclaimer', 'Our team comes directly to your offices.')
      : isCoworking
      ? t('venue.inWorkspaceDisclaimer', 'Service performed at your workspace.')
      : t('venue.inRoomDisclaimer', 'Service performed in the privacy of your room.'),
    supportsRoomPayment: !isNonHotel,
    addToLocationLabel: isNonHotel
      ? t('venue.addToWorkspace', 'Add to Workspace')
      : t('venue.addToRoom', 'Add to Room'),
    addToLocationDesc: isNonHotel
      ? t('venue.addToWorkspaceDesc', 'Charge will be added to your account')
      : t('venue.addToRoomDesc', 'Charge will be added to your room bill'),
    exclusiveServiceLabel: isEnterprise
      ? t('venue.exclusiveEnterpriseService', 'CORPORATE WELLNESS EXPERIENCE')
      : isCoworking
      ? t('venue.exclusiveWorkspaceService', 'EXCLUSIVE WORKSPACE SERVICE')
      : t('venue.exclusiveRoomService', 'EXCLUSIVE ROOM SERVICE'),
    serviceDescription: isEnterprise
      ? t('venue.enterpriseServiceDescription', 'Give your team a moment to disconnect. Our expert hairdressers and barbers set up directly in your offices — no commute, no stress, just care.')
      : isCoworking
      ? t('venue.workspaceServiceDescription', 'High-end hairdressing excellence, at your workspace. Our expert hairdressers and barbers come to you.')
      : t('venue.roomServiceDescription', 'High-end hairdressing excellence, in the privacy of your room. Our expert hairdressers and barbers come to your suite.'),
  };
};

/**
 * Get venue terms without React hook (for use in non-component contexts)
 *
 * @param venueType - The type of venue
 * @param t - Translation function from i18next
 * @returns Object with venue-specific terms
 */
export const getVenueTerms = (
  venueType: VenueType | null | undefined,
  t: (key: string, defaultValue?: string) => string
): VenueTerms => {
  const isCoworking = venueType === 'coworking';
  const isEnterprise = venueType === 'enterprise';
  const isNonHotel = isCoworking || isEnterprise;

  return {
    venueName: isEnterprise
      ? t('venue.enterprise', 'Enterprise')
      : isCoworking
      ? t('venue.coworking', 'Coworking Space')
      : t('venue.hotel', 'Hotel'),
    locationName: isNonHotel
      ? t('venue.workspace', 'Workspace')
      : t('venue.room', 'Room'),
    locationNumberLabel: isNonHotel
      ? t('venue.workspaceNumber', 'Workspace Number')
      : t('venue.roomNumber', 'Room Number'),
    disclaimer: isEnterprise
      ? t('venue.inEnterpriseDisclaimer', 'Our team comes directly to your offices.')
      : isCoworking
      ? t('venue.inWorkspaceDisclaimer', 'Service performed at your workspace.')
      : t('venue.inRoomDisclaimer', 'Service performed in the privacy of your room.'),
    supportsRoomPayment: !isNonHotel,
    addToLocationLabel: isNonHotel
      ? t('venue.addToWorkspace', 'Add to Workspace')
      : t('venue.addToRoom', 'Add to Room'),
    addToLocationDesc: isNonHotel
      ? t('venue.addToWorkspaceDesc', 'Charge will be added to your account')
      : t('venue.addToRoomDesc', 'Charge will be added to your room bill'),
    exclusiveServiceLabel: isEnterprise
      ? t('venue.exclusiveEnterpriseService', 'CORPORATE WELLNESS EXPERIENCE')
      : isCoworking
      ? t('venue.exclusiveWorkspaceService', 'EXCLUSIVE WORKSPACE SERVICE')
      : t('venue.exclusiveRoomService', 'EXCLUSIVE ROOM SERVICE'),
    serviceDescription: isEnterprise
      ? t('venue.enterpriseServiceDescription', 'Give your team a moment to disconnect. Our expert hairdressers and barbers set up directly in your offices — no commute, no stress, just care.')
      : isCoworking
      ? t('venue.workspaceServiceDescription', 'High-end hairdressing excellence, at your workspace. Our expert hairdressers and barbers come to you.')
      : t('venue.roomServiceDescription', 'High-end hairdressing excellence, in the privacy of your room. Our expert hairdressers and barbers come to your suite.'),
  };
};
