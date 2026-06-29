import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { AuthBundles } from "@/components/client/GiftCardLoginModal";
import { supabase } from "@/integrations/supabase/client";

export type TherapistGender = 'female' | 'male' | null;

export interface BookingDateTime {
  date: string;
  time: string;
}

export type ScheduleMode = 'shared' | 'per_item';

/**
 * Map of cart item key → scheduled slot. Keys come from `getCartKey(id, variantId)`.
 * Populated only when `scheduleMode === 'per_item'` (multi-time client booking).
 */
export type PerItemSchedule = Record<string, BookingDateTime>;

export interface ClientInfo {
  firstName: string;
  lastName: string;
  phone: string;
  countryCode: string;
  email: string;
  roomNumber: string;
  note?: string;
  pmsGuestCheckIn?: string;
  pmsGuestCheckOut?: string;
  isExternalGuest?: boolean;
  /** True when the hotel guest was verified against the PMS (room + last name match).
   *  When set, email/phone are left empty client-side and resolved server-side from the PMS. */
  pmsVerified?: boolean;
}

export interface SelectedBundle {
  customerBundleId: string;
  bundleName: string;
  bundleType: 'cure' | 'gift_treatments' | 'gift_amount';
  // Session-based (cure, gift_treatments)
  remainingSessions?: number;
  eligibleTreatmentIds?: string[];
  // Amount-based (gift_amount)
  remainingAmountCents?: number;
  amountToUseCents?: number;
}

export interface GiftInfo {
  isGift: boolean;
  deliveryMode: 'email' | 'print';
  recipientName: string;
  recipientEmail?: string;
  senderName: string;
  giftMessage?: string;
  recipientLanguage?: 'fr' | 'en';
}

interface ClientFlowState {
  bookingDateTime: BookingDateTime | null;
  clientInfo: ClientInfo | null;
  pendingCheckoutSession: string | null;
  therapistGenderPreference: TherapistGender;
  selectedBundle: SelectedBundle | null;
  isBundleOnlyPurchase: boolean;
  draftBookingId: string | null;
  holdExpiresAt: number | null;
  giftInfo: GiftInfo | null;
  authBundles: AuthBundles | null;
  scheduleMode: ScheduleMode;
  perItemSchedule: PerItemSchedule;
  groupId: string | null;
  bookingIds: string[];
  checkoutIntentId: string | null;
}

interface ClientFlowContextType extends ClientFlowState {
  setBookingDateTime: (data: BookingDateTime) => void;
  setClientInfo: (data: ClientInfo) => void;
  setPendingCheckoutSession: (sessionId: string) => void;
  setTherapistGenderPreference: (gender: TherapistGender) => void;
  setSelectedBundle: (bundle: SelectedBundle | null) => void;
  setIsBundleOnlyPurchase: (value: boolean) => void;
  setDraftBookingId: (id: string | null) => void;
  setHoldExpiresAt: (time: number | null) => void;
  setGiftInfo: (info: GiftInfo | null) => void;
  setAuthBundles: (bundles: AuthBundles | null) => void;
  setScheduleMode: (mode: ScheduleMode) => void;
  setItemSchedule: (cartKey: string, dt: BookingDateTime | null) => void;
  resetPerItemSchedule: () => void;
  setGroupId: (id: string | null) => void;
  setBookingIds: (ids: string[]) => void;
  setCheckoutIntentId: (id: string | null) => void;
  clearFlow: () => void;
  canProceedToStep: (step: "info" | "payment" | "confirmation") => boolean;
  cancelHold: () => Promise<void>;
}

const ClientFlowContext = createContext<ClientFlowContextType | undefined>(undefined);

export function ClientFlowProvider({ children }: { children: React.ReactNode }) {
  const [bookingDateTime, setBookingDateTimeState] = useState<BookingDateTime | null>(null);
  const [clientInfo, setClientInfoState] = useState<ClientInfo | null>(null);
  const [pendingCheckoutSession, setPendingCheckoutSessionState] = useState<string | null>(null);
  const [therapistGenderPreference, setTherapistGenderPreferenceState] = useState<TherapistGender>(null);
  const [selectedBundle, setSelectedBundleState] = useState<SelectedBundle | null>(null);
  const [isBundleOnlyPurchase, setIsBundleOnlyPurchaseState] = useState(false);
  const [draftBookingId, setDraftBookingIdState] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAtState] = useState<number | null>(null);
  const [giftInfo, setGiftInfoState] = useState<GiftInfo | null>(null);
  const [authBundles, setAuthBundlesState] = useState<AuthBundles | null>(null);
  const [scheduleMode, setScheduleModeState] = useState<ScheduleMode>('shared');
  const [perItemSchedule, setPerItemScheduleState] = useState<PerItemSchedule>({});
  const [groupId, setGroupIdState] = useState<string | null>(null);
  const [bookingIds, setBookingIdsState] = useState<string[]>([]);
  const [checkoutIntentId, setCheckoutIntentIdState] = useState<string | null>(null);

  const setBookingDateTime = useCallback((data: BookingDateTime) => setBookingDateTimeState(data), []);
  const setClientInfo = useCallback((data: ClientInfo) => setClientInfoState(data), []);
  const setPendingCheckoutSession = useCallback((sessionId: string) => setPendingCheckoutSessionState(sessionId), []);
  const setTherapistGenderPreference = useCallback((gender: TherapistGender) => setTherapistGenderPreferenceState(gender), []);
  const setSelectedBundle = useCallback((bundle: SelectedBundle | null) => setSelectedBundleState(bundle), []);
  const setIsBundleOnlyPurchase = useCallback((value: boolean) => setIsBundleOnlyPurchaseState(value), []);
  const setDraftBookingId = useCallback((id: string | null) => setDraftBookingIdState(id), []);
  const setHoldExpiresAt = useCallback((time: number | null) => setHoldExpiresAtState(time), []);

  const setGiftInfo = useCallback((info: GiftInfo | null) => {
    setGiftInfoState(info);
  }, []);

  const setAuthBundles = useCallback((bundles: AuthBundles | null) => {
    setAuthBundlesState(bundles);
  }, []);

  const setScheduleMode = useCallback((mode: ScheduleMode) => {
    setScheduleModeState(mode);
    if (mode === 'shared') {
      setPerItemScheduleState({});
    }
  }, []);

  const setItemSchedule = useCallback((cartKey: string, dt: BookingDateTime | null) => {
    setPerItemScheduleState(prev => {
      if (dt === null) {
        if (!(cartKey in prev)) return prev;
        const next = { ...prev };
        delete next[cartKey];
        return next;
      }
      return { ...prev, [cartKey]: dt };
    });
  }, []);

  const resetPerItemSchedule = useCallback(() => {
    setPerItemScheduleState({});
  }, []);

  const setGroupId = useCallback((id: string | null) => setGroupIdState(id), []);
  const setBookingIds = useCallback((ids: string[]) => setBookingIdsState(ids), []);
  const setCheckoutIntentId = useCallback((id: string | null) => setCheckoutIntentIdState(id), []);

  const clearFlow = useCallback(() => {
    setBookingDateTimeState(null);
    setClientInfoState(null);
    setPendingCheckoutSessionState(null);
    setTherapistGenderPreferenceState(null);
    setSelectedBundleState(null);
    setIsBundleOnlyPurchaseState(false);
    setDraftBookingIdState(null);
    setHoldExpiresAtState(null);
    setGiftInfoState(null);
    setAuthBundlesState(null);
    setScheduleModeState('shared');
    setPerItemScheduleState({});
    setGroupIdState(null);
    setBookingIdsState([]);
    setCheckoutIntentIdState(null);
  }, []);
const cancelHold = useCallback(async () => {
    const idsToDelete = bookingIds.length > 0
      ? bookingIds
      : (draftBookingId ? [draftBookingId] : []);

    if (idsToDelete.length === 0) {
      clearFlow();
      return;
    }
    try {
      await supabase
        .from('bookings')
        .delete()
        .in('id', idsToDelete)
        .eq('status', 'awaiting_payment');
    } catch (error) {
      console.error("[Hold] Erreur lors de la suppression du brouillon", error);
    }
    clearFlow();
  }, [draftBookingId, bookingIds, clearFlow]);
  const canProceedToStep = useCallback(
    (step: "info" | "payment" | "confirmation") => {
      const hasPerItemSchedule = scheduleMode === 'per_item' && Object.keys(perItemSchedule).length > 0;
      const hasSchedule = isBundleOnlyPurchase || bookingDateTime !== null || hasPerItemSchedule;
      switch (step) {
        case "info": return hasSchedule;
        case "payment": return hasSchedule && clientInfo !== null;
        case "confirmation": return hasSchedule && clientInfo !== null;
        default: return false;
      }
    },
    [bookingDateTime, clientInfo, isBundleOnlyPurchase, scheduleMode, perItemSchedule]
  );

  const value = useMemo(
    () => ({
      bookingDateTime, clientInfo, pendingCheckoutSession,
      therapistGenderPreference, selectedBundle, isBundleOnlyPurchase,
      draftBookingId, holdExpiresAt,
      giftInfo, authBundles,
      scheduleMode, perItemSchedule,
      groupId, bookingIds, checkoutIntentId,
      setBookingDateTime, setClientInfo, setPendingCheckoutSession,
      setTherapistGenderPreference, setSelectedBundle, setIsBundleOnlyPurchase,
      setDraftBookingId, setHoldExpiresAt,
      setGiftInfo, setAuthBundles,
      setScheduleMode, setItemSchedule, resetPerItemSchedule,
      setGroupId, setBookingIds, setCheckoutIntentId,
      clearFlow, canProceedToStep,
      cancelHold,
    }),
    [
      bookingDateTime, clientInfo, pendingCheckoutSession,
      therapistGenderPreference, selectedBundle, isBundleOnlyPurchase,
      draftBookingId, holdExpiresAt,
      giftInfo, authBundles,
      scheduleMode, perItemSchedule,
      groupId, bookingIds, checkoutIntentId,
      setBookingDateTime, setClientInfo, setPendingCheckoutSession,
      setTherapistGenderPreference, setSelectedBundle, setIsBundleOnlyPurchase,
      setDraftBookingId, setHoldExpiresAt,
      setGiftInfo, setAuthBundles,
      setScheduleMode, setItemSchedule, resetPerItemSchedule,
      setGroupId, setBookingIds, setCheckoutIntentId,
      clearFlow, canProceedToStep,
      cancelHold,
    ]
  );

  return <ClientFlowContext.Provider value={value}>{children}</ClientFlowContext.Provider>;
}

export function useClientFlow(): ClientFlowContextType {
  const context = useContext(ClientFlowContext);
  if (context === undefined) {
    throw new Error("useClientFlow must be used within a ClientFlowProvider");
  }
  return context;
}