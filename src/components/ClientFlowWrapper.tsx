/**
 * Client Flow Wrapper
 *
 * This wrapper ensures that the client booking flow operates independently
 * from the staff/PWA auth session. When a staff member visits the client
 * flow, their Supabase session remains untouched.
 *
 * Key behaviors:
 * 1. Resolves a slug (or legacy UUID) in the URL to a canonical venue (UUID + slug)
 * 2. Redirects UUID → slug so the URL stays human-readable
 * 3. Initializes a guest session for the hotel
 * 4. Does NOT check or modify Supabase auth state
 * 5. Preserves staff session when they navigate back to /pwa
 * 6. Hydrates cart + booking date/time from URL query params (?t, ?date, ?time)
 */

import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientSession } from '@/hooks/useClientSession';
import { useClientPrefetch } from '@/hooks/useClientPrefetch';
import { useAxeptio } from '@/hooks/useAxeptio';
import { useVenueDefaultLanguage } from '@/hooks/useVenueDefaultLanguage';
import { PageTransition } from '@/components/client/PageTransition';
import { ClientFlowProvider, useClientFlow } from '@/pages/client/context/FlowContext';
import { AnalyticsProvider } from '@/pages/client/context/AnalyticsContext';
import {
  ClientVenueProvider,
  type PublicHotel,
} from '@/pages/client/context/ClientVenueContext';
import { CartProvider, useCart, type BasketItem } from '@/pages/client/context/CartContext';
import { useUrlBookingState } from '@/pages/client/hooks/useUrlBookingState';

interface ClientFlowWrapperProps {
  children: React.ReactNode;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ClientFlowWrapper = ({ children }: ClientFlowWrapperProps) => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { getSession, initSession } = useClientSession();

  // Fetch venue by slug or legacy UUID.
  const {
    data: venue,
    isLoading: isVenueLoading,
    isError: isVenueError,
  } = useQuery({
    queryKey: ['public-hotel-by-identifier', slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_hotel', {
        _identifier: slug!,
      });
      if (error) throw error;
      return (data?.[0] as PublicHotel | undefined) ?? null;
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const hotelId = venue?.id ?? null;

  // Prefetch data for the next page in the booking flow
  useClientPrefetch(hotelId);

  // Cookie consent banner (Axeptio)
  useAxeptio();

  // Set default language based on venue type and country
  const { isLanguageReady } = useVenueDefaultLanguage(hotelId, venue ?? null);

  useEffect(() => {
    if (!hotelId) return;
    const existingSession = getSession();
    if (!existingSession || existingSession.hotelId !== hotelId) {
      initSession(hotelId);
    }
  }, [hotelId]);

  // Loading state — wait until venue is resolved AND language is applied
  if (isVenueLoading || (venue && !isLanguageReady)) {
    return <div className="lymfea-client min-h-screen bg-white" />;
  }

  // Unknown slug / disabled venue — throw so ErrorBoundary renders ClientErrorFallback
  if (isVenueError || !venue) {
    throw new Error('venue-not-found');
  }

  // Legacy UUID in URL — redirect to canonical slug, preserving sub-path + query
  if (slug && UUID_RE.test(slug) && venue.slug && venue.slug !== slug) {
    const rest = location.pathname.replace(`/client/${slug}`, '');
    return (
      <Navigate to={`/client/${venue.slug}${rest}${location.search}`} replace />
    );
  }

  return (
    <ClientVenueProvider value={{ slug: venue.slug, hotelId: venue.id, venue }}>
      <AnalyticsProvider hotelId={venue.id}>
        <CartProvider hotelId={venue.id}>
          <ClientFlowProvider>
            <UrlStateHydrator hotelId={venue.id} />
            <PageTransition>
              <div className="lymfea-client">{children}</div>
            </PageTransition>
          </ClientFlowProvider>
        </CartProvider>
      </AnalyticsProvider>
    </ClientVenueProvider>
  );
};

export default ClientFlowWrapper;

/**
 * Invisible component that keeps URL <-> state in sync:
 *  - On cold load: hydrates cart from ?t= and bookingDateTime from ?date=&time=
 *  - On cart change: writes cart slugs back to ?t=
 *
 * Lives inside CartProvider + ClientFlowProvider so it can read/write both.
 */
interface PublicTreatment {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  category: string;
  duration: number | null;
  price: number | null;
  price_on_request: boolean | null;
  currency: string | null;
  image: string | null;
  is_addon: boolean | null;
  is_bundle: boolean | null;
}

function UrlStateHydrator({ hotelId }: { hotelId: string }) {
  const { items, addItem } = useCart();
  const { bookingDateTime, setBookingDateTime, therapistGenderPreference, setTherapistGenderPreference } = useClientFlow();
  const { treatmentSlugs, date, time, gender, setTreatmentSlugs, setDateTime, setGender } = useUrlBookingState();

  // Pull the treatments catalog (shared cache with Welcome/Treatments pages).
  const { data: treatments } = useQuery({
    queryKey: ['public-treatments', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_treatments', {
        _hotel_id: hotelId,
      });
      if (error) throw error;
      return (data ?? []) as PublicTreatment[];
    },
    enabled: !!hotelId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // ────────────────────────────────────────────────────────────
  // Hydrate cart from ?t= (only when cart is empty — URL wins on cold load only)
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated) return;
    if (!treatments || treatments.length === 0) return;
    if (items.length > 0) {
      setHydrated(true);
      return;
    }
    if (treatmentSlugs.length === 0) {
      setHydrated(true);
      return;
    }

    const bySlug = new Map(treatments.map((t) => [t.slug, t]));
    for (const s of treatmentSlugs) {
      const t = bySlug.get(s);
      if (!t) continue;
      // Skip add-ons: they only make sense attached to a parent, which we
      // can't reconstruct from the URL.
      if (t.is_addon) continue;
      addItem({
        id: t.id,
        slug: t.slug,
        name: t.name,
        price: Number(t.price) || 0,
        currency: t.currency || 'EUR',
        duration: t.duration || 0,
        image: t.image || undefined,
        category: t.category,
        isPriceOnRequest: t.price_on_request || false,
        isBundle: t.is_bundle || false,
      });
    }
    setHydrated(true);
  }, [treatments, items.length, treatmentSlugs, addItem, hydrated]);

  // Hydrate booking date/time from URL (once)
  const dateTimeHydratedRef = useRef(false);
  useEffect(() => {
    if (dateTimeHydratedRef.current) return;
    if (bookingDateTime) {
      dateTimeHydratedRef.current = true;
      return;
    }
    if (date && time) {
      setBookingDateTime({ date, time });
    }
    dateTimeHydratedRef.current = true;
  }, [date, time, bookingDateTime, setBookingDateTime, dateTimeHydratedRef]);

  // ────────────────────────────────────────────────────────────
  // Hydrate gender preference from URL (once)
  const genderHydratedRef = useRef(false);
  useEffect(() => {
    if (genderHydratedRef.current) return;
    if (therapistGenderPreference) {
      genderHydratedRef.current = true;
      return;
    }
    if (gender) {
      setTherapistGenderPreference(gender);
    }
    genderHydratedRef.current = true;
  }, [gender, therapistGenderPreference, setTherapistGenderPreference]);

  // ────────────────────────────────────────────────────────────
  // Sync cart → ?t= (skip add-ons, dedupe by slug)
  useEffect(() => {
    if (!hydrated) return;
    const slugs = Array.from(
      new Set(
        items
          .filter((i: BasketItem) => !i.isAddon && !!i.slug)
          .map((i) => i.slug as string)
      )
    );
    setTreatmentSlugs(slugs);
  }, [items, setTreatmentSlugs, hydrated]);

  // Sync bookingDateTime → ?date= & ?time=
  useEffect(() => {
    if (bookingDateTime?.date) {
      setDateTime(bookingDateTime.date, bookingDateTime.time || '');
    }
  }, [bookingDateTime, setDateTime]);

  // Sync gender preference → ?gender=
  useEffect(() => {
    setGender(therapistGenderPreference);
  }, [therapistGenderPreference, setGender]);

  return null;
}
