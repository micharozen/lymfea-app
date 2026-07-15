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
import { useLocalizedField } from '@/hooks/useLocalizedField';

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
}

export default function Resume() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  // The reminder's "choose another time" link — restore the cart, drop the slot.
  const forceSchedule = searchParams.get('step') === 'schedule';
  const navigate = useNavigate();
  const { slug, hotelId } = useClientVenue();
  const { replaceBasket } = useCart();
  const { setBookingDateTime, setClientInfo } = useClientFlow();
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
          availableDays: treatment.available_days ?? null,
        });
      }

      if (items.length === 0) {
        navigate(`/client/${slug}/treatments`, { replace: true });
        return;
      }

      replaceBasket(items);
      setClientInfo({
        firstName: intent.client_first_name,
        lastName: intent.client_last_name ?? '',
        email: intent.client_email,
        roomNumber: intent.room_number ?? '',
        phone: '',
        countryCode: '+33',
      });

      // The intent holds no stock — the 5-minute slot hold expired long before the
      // reminder went out. The stored slot is a preference: restore it and land on
      // guest-info (phone is the only missing field), where a fresh hold is placed.
      // Skipping straight to payment would sell a slot nothing is reserving.
      if (!forceSchedule && intent.booking_date && intent.booking_time) {
        setBookingDateTime({
          date: intent.booking_date,
          time: intent.booking_time.slice(0, 5),
        });
        navigate(`/client/${slug}/guest-info`, { replace: true });
        return;
      }
      navigate(`/client/${slug}/schedule`, { replace: true });
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
    localize,
    t,
  ]);

  return <div className="min-h-screen bg-white" />;
}
