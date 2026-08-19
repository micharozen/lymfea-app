/**
 * Resume an abandoned checkout from a reminder email link.
 *
 * The email carries `?token=<resume_token>`; `resume_checkout_intent` gives back
 * the cart snapshot, the requested slot and the guest's identity. The snapshot
 * only stores what the reminder email needs (id, quantity, price…), so each line
 * is rebuilt against the live catalog: prices, durations and availability must
 * come from the treatments themselves, never from a snapshot taken days ago.
 *
 * A treatment that disappeared from the catalog is silently dropped — better a
 * partial cart than a booking on a soin the venue no longer offers.
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useClientVenue } from '@/pages/client/context/ClientVenueContext';
import { useClientFlow } from '@/pages/client/context/FlowContext';
import { useCart, type BasketItem } from '@/pages/client/context/CartContext';
import { resolveAvailableDays } from '@/lib/availableDays';
import { totalTreatmentCount } from '@/lib/multiTimeBooking';
import { splitPhoneNumber } from '@/lib/phone';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useLocalizedField } from '@/hooks/useLocalizedField';

/** Slack absorbing the gap between the browser's timezone and the venue's. */
const TZ_TOLERANCE_MS = 3 * 60 * 60 * 1000;

interface SnapshotItem {
  treatmentId?: string;
  quantity?: number;
  variantId?: string | null;
  guestCount?: number;
}

interface TreatmentVariant {
  id: string;
  label: string | null;
  label_en: string | null;
  duration: number;
  price: number | null;
  price_on_request: boolean;
  available_days?: number[] | null;
}

export default function Resume() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  // The reminder's "choose another time" link — restore the cart, drop the slot.
  const forceSchedule = searchParams.get('step') === 'schedule';
  const navigate = useNavigate();
  const { slug, hotelId } = useClientVenue();
  const { replaceBasket } = useCart();
  const {
    setBookingDateTime,
    setClientInfo,
    setTherapistGenderPreference,
    setDraftBookingId,
    setBookingIds,
    setGroupId,
    setHoldExpiresAt,
  } = useClientFlow();
  const isDesktop = useIsDesktop();
  const { t } = useTranslation('client');
  const localize = useLocalizedField();

  // Strict-mode double-invoke would otherwise replay the whole restore.
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const restore = async () => {
      if (!token) {
        navigate(`/client/${slug}`, { replace: true });
        return;
      }

      const { data: intents, error } = await supabase.rpc('resume_checkout_intent', {
        _token: token,
      });
      const intent = intents?.[0];

      // Expired, already converted, or a token for another venue.
      if (error || !intent || intent.hotel_id !== hotelId) {
        toast.info(t('resume.expired', 'Ce lien a expiré. Reprenez votre sélection ci-dessous.'));
        navigate(`/client/${slug}/treatments`, { replace: true });
        return;
      }

      const { data: treatments } = await supabase.rpc('get_public_treatments', {
        _hotel_id: hotelId,
      });
      const byId = new Map((treatments ?? []).map((treatment) => [treatment.id, treatment]));

      const snapshotItems = (intent.cart_snapshot as { items?: SnapshotItem[] })?.items ?? [];
      const items: BasketItem[] = [];

      for (const line of snapshotItems) {
        const treatment = line.treatmentId ? byId.get(line.treatmentId) : undefined;
        if (!treatment) continue;

        const variants = (treatment.variants ?? []) as TreatmentVariant[];
        const variant = line.variantId
          ? variants.find((v) => v.id === line.variantId)
          : undefined;

        items.push({
          id: treatment.id,
          slug: treatment.slug,
          variantId: variant?.id,
          variantLabel:
            (variant ? localize(variant.label, variant.label_en) : undefined) ||
            (variant ? `${variant.duration} min` : undefined),
          name: localize(treatment.name, treatment.name_en),
          price: Number(variant?.price ?? treatment.price) || 0,
          currency: treatment.currency || 'EUR',
          duration: variant?.duration ?? treatment.duration ?? 0,
          quantity: Math.max(1, line.quantity ?? 1),
          image: treatment.image || undefined,
          category: treatment.category,
          isPriceOnRequest: variant?.price_on_request ?? treatment.price_on_request ?? false,
          isBundle: treatment.is_bundle || false,
          isAmenity: !!treatment.amenity_id,
          guestCount: line.guestCount,
          availableDays: resolveAvailableDays(treatment.available_days, variant?.available_days),
        });
      }

      if (items.length === 0) {
        navigate(`/client/${slug}/treatments`, { replace: true });
        return;
      }

      const { countryCode, phone } = splitPhoneNumber(intent.client_phone ?? '');

      replaceBasket(items);
      setClientInfo({
        firstName: intent.client_first_name,
        lastName: intent.client_last_name ?? '',
        email: intent.client_email,
        roomNumber: intent.room_number ?? '',
        phone,
        countryCode,
      });

      const rawGender = (intent.cart_snapshot as { therapistGenderPreference?: unknown } | null)
        ?.therapistGenderPreference;
      const therapistGender = rawGender === 'male' || rawGender === 'female' ? rawGender : null;
      if (therapistGender) setTherapistGenderPreference(therapistGender);

      const slot =
        !forceSchedule && intent.booking_date && intent.booking_time
          ? { date: intent.booking_date, time: intent.booking_time.slice(0, 5) }
          : null;

      if (!slot) {
        navigate(`/client/${slug}/schedule`, { replace: true });
        return;
      }

      // An intent created before the phone was carried over, or a customer row
      // without one: guest-info is the only place that can collect it.
      if (!phone) {
        setBookingDateTime(slot);
        navigate(`/client/${slug}/guest-info`, { replace: true });
        return;
      }

      // The stored slot is only a preference — the hold that reserved it expired
      // long before the reminder went out. Take a fresh one before showing a
      // payment screen, otherwise we would charge a slot nothing is holding.
      if (isSlotPast(slot) || !(await placeHold(slot, items, therapistGender))) {
        navigate(`/client/${slug}/schedule`, { replace: true });
        toast.info(t('resume.slotGone', "Ce créneau n'est plus disponible. Choisissez-en un autre."));
        return;
      }

      setBookingDateTime(slot);
      // Desktop pays in a panel opened from guest-info; mobile has its own page.
      navigate(
        isDesktop ? `/client/${slug}/guest-info` : `/client/${slug}/payment`,
        { replace: true, state: isDesktop ? { openCheckout: true } : undefined },
      );
    };

    /**
     * Coarse guard for a reminder opened after the slot has come and gone: the
     * venue timezone is unknown here, so only a slot hours in the past is rejected
     * outright. Anything closer is left to `create-draft-booking`, which checks
     * availability for real.
     */
    const isSlotPast = ({ date, time }: { date: string; time: string }) =>
      new Date(`${date}T${time}`).getTime() + TZ_TOLERANCE_MS < Date.now();

    /** Returns false when the slot is gone: the caller sends the guest back to schedule. */
    const placeHold = async (
      { date, time }: { date: string; time: string },
      basket: BasketItem[],
      therapistGender: 'male' | 'female' | null,
    ) => {
      // Same rule as the schedule step: amenities need no bed, and 2+ treatments
      // booked at the same time are a duo — one bed and one therapist each.
      const treatmentCount = totalTreatmentCount(basket.filter((i) => !i.isBundle && !i.isAmenity));
      const guestCount = Math.max(
        1,
        ...basket.filter((i) => !i.isAmenity).map((i) => i.guestCount ?? 1),
        treatmentCount > 1 ? treatmentCount : 1,
      );

      try {
        const { data, error } = await supabase.functions.invoke('create-draft-booking', {
          body: {
            hotelId,
            bookingData: { date, time },
            treatments: basket.map((item) => ({
              id: item.id,
              variantId: item.variantId,
              quantity: item.quantity,
            })),
            therapistGender,
            ...(guestCount > 1 ? { guestCount } : {}),
          },
        });
        if (error) throw error;

        // Venue runs without holds: the slot is locked at confirm-setup-intent
        // instead, exactly as for a guest coming through the normal flow.
        if (data?.holdSkipped || data?.reason === 'hold_disabled') return true;
        if (!data?.bookingId) return false;

        setDraftBookingId(data.bookingId);
        setBookingIds([data.bookingId]);
        setGroupId(null);
        setHoldExpiresAt(
          data.holdExpiresAt
            ? new Date(data.holdExpiresAt).getTime()
            : Date.now() + (data.holdDurationMinutes ?? 5) * 60 * 1000,
        );
        return true;
      } catch (error) {
        console.error('Resume hold error:', error);
        return false;
      }
    };

    void restore();
  }, [
    token,
    forceSchedule,
    slug,
    hotelId,
    navigate,
    replaceBasket,
    setBookingDateTime,
    setClientInfo,
    setTherapistGenderPreference,
    setDraftBookingId,
    setBookingIds,
    setGroupId,
    setHoldExpiresAt,
    isDesktop,
    localize,
    t,
  ]);

  return <div className="min-h-screen bg-white" />;
}
