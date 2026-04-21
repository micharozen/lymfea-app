import React, { createContext, useContext } from 'react';

export interface PublicHotel {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  image: string | null;
  cover_image: string | null;
  city: string | null;
  country: string | null;
  currency: string | null;
  status: string | null;
  vat: number | null;
  opening_time: string | null;
  closing_time: string | null;
  schedule_type: string | null;
  days_of_week: number[] | null;
  recurrence_interval: number | null;
  recurring_start_date: string | null;
  recurring_end_date: string | null;
  venue_type: string | null;
  description: string | null;
  description_en: string | null;
  landing_subtitle: string | null;
  landing_subtitle_en: string | null;
  offert: boolean | null;
  slot_interval: number | null;
  company_offered: boolean | null;
  pms_guest_lookup_enabled: boolean | null;
  address: string | null;
  postal_code: string | null;
  contact_phone: string | null;
}

interface ClientVenueContextValue {
  slug: string;
  hotelId: string;
  venue: PublicHotel;
}

const ClientVenueContext = createContext<ClientVenueContextValue | undefined>(undefined);

export function ClientVenueProvider({
  value,
  children,
}: {
  value: ClientVenueContextValue;
  children: React.ReactNode;
}) {
  return (
    <ClientVenueContext.Provider value={value}>
      {children}
    </ClientVenueContext.Provider>
  );
}

export function useClientVenue(): ClientVenueContextValue {
  const ctx = useContext(ClientVenueContext);
  if (!ctx) {
    throw new Error('useClientVenue must be used within ClientVenueProvider');
  }
  return ctx;
}

export function useClientVenueOptional(): ClientVenueContextValue | null {
  return useContext(ClientVenueContext) ?? null;
}
