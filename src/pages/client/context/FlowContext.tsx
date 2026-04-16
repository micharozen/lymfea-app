import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { AuthBundles } from "@/components/client/GiftCardLoginModal";

export type TherapistGender = 'female' | 'male' | null;

export interface BookingDateTime {
  date: string;
  time: string;
}

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
}

interface ClientFlowState {
  bookingDateTime: BookingDateTime | null;
  clientInfo: ClientInfo | null;
  pendingCheckoutSession: string | null;
  therapistGenderPreference: TherapistGender;
  selectedBundle: SelectedBundle | null;
  isBundleOnlyPurchase: boolean;
  giftInfo: GiftInfo | null;
  authBundles: AuthBundles | null;
}

interface ClientFlowContextType extends ClientFlowState {
  setBookingDateTime: (data: BookingDateTime) => void;
  setClientInfo: (data: ClientInfo) => void;
  setPendingCheckoutSession: (sessionId: string) => void;
  setTherapistGenderPreference: (gender: TherapistGender) => void;
  setSelectedBundle: (bundle: SelectedBundle | null) => void;
  setIsBundleOnlyPurchase: (value: boolean) => void;
  setGiftInfo: (info: GiftInfo | null) => void;
  setAuthBundles: (bundles: AuthBundles | null) => void;
  clearFlow: () => void;
  canProceedToStep: (step: "info" | "payment" | "confirmation") => boolean;
}

const ClientFlowContext = createContext<ClientFlowContextType | undefined>(undefined);

export function ClientFlowProvider({ children }: { children: React.ReactNode }) {
  const [bookingDateTime, setBookingDateTimeState] = useState<BookingDateTime | null>(null);
  const [clientInfo, setClientInfoState] = useState<ClientInfo | null>(null);
  const [pendingCheckoutSession, setPendingCheckoutSessionState] = useState<string | null>(null);
  const [therapistGenderPreference, setTherapistGenderPreferenceState] = useState<TherapistGender>(null);
  const [selectedBundle, setSelectedBundleState] = useState<SelectedBundle | null>(null);
  const [isBundleOnlyPurchase, setIsBundleOnlyPurchaseState] = useState(false);
  const [giftInfo, setGiftInfoState] = useState<GiftInfo | null>(null);
  const [authBundles, setAuthBundlesState] = useState<AuthBundles | null>(null);

  const setBookingDateTime = useCallback((data: BookingDateTime) => {
    setBookingDateTimeState(data);
  }, []);

  const setClientInfo = useCallback((data: ClientInfo) => {
    setClientInfoState(data);
  }, []);

  const setPendingCheckoutSession = useCallback((sessionId: string) => {
    setPendingCheckoutSessionState(sessionId);
  }, []);

  const setTherapistGenderPreference = useCallback((gender: TherapistGender) => {
    setTherapistGenderPreferenceState(gender);
  }, []);

  const setSelectedBundle = useCallback((bundle: SelectedBundle | null) => {
    setSelectedBundleState(bundle);
  }, []);

  const setIsBundleOnlyPurchase = useCallback((value: boolean) => {
    setIsBundleOnlyPurchaseState(value);
  }, []);

  const setGiftInfo = useCallback((info: GiftInfo | null) => {
    setGiftInfoState(info);
  }, []);

  const setAuthBundles = useCallback((bundles: AuthBundles | null) => {
    setAuthBundlesState(bundles);
  }, []);

  const clearFlow = useCallback(() => {
    setBookingDateTimeState(null);
    setClientInfoState(null);
    setPendingCheckoutSessionState(null);
    setTherapistGenderPreferenceState(null);
    setSelectedBundleState(null);
    setIsBundleOnlyPurchaseState(false);
    setGiftInfoState(null);
    setAuthBundlesState(null);
  }, []);

  const canProceedToStep = useCallback(
    (step: "info" | "payment" | "confirmation") => {
      const hasSchedule = isBundleOnlyPurchase || bookingDateTime !== null;
      switch (step) {
        case "info":
          return hasSchedule;
        case "payment":
          return hasSchedule && clientInfo !== null;
        case "confirmation":
          return hasSchedule && clientInfo !== null;
        default:
          return false;
      }
    },
    [bookingDateTime, clientInfo, isBundleOnlyPurchase]
  );

  const value = useMemo(
    () => ({
      bookingDateTime,
      clientInfo,
      pendingCheckoutSession,
      therapistGenderPreference,
      selectedBundle,
      isBundleOnlyPurchase,
      giftInfo,
      authBundles,
      setBookingDateTime,
      setClientInfo,
      setPendingCheckoutSession,
      setTherapistGenderPreference,
      setSelectedBundle,
      setIsBundleOnlyPurchase,
      setGiftInfo,
      setAuthBundles,
      clearFlow,
      canProceedToStep,
    }),
    [
      bookingDateTime,
      clientInfo,
      pendingCheckoutSession,
      therapistGenderPreference,
      selectedBundle,
      isBundleOnlyPurchase,
      giftInfo,
      authBundles,
      setBookingDateTime,
      setClientInfo,
      setPendingCheckoutSession,
      setTherapistGenderPreference,
      setSelectedBundle,
      setIsBundleOnlyPurchase,
      setGiftInfo,
      setAuthBundles,
      clearFlow,
      canProceedToStep,
    ]
  );

  return (
    <ClientFlowContext.Provider value={value}>
      {children}
    </ClientFlowContext.Provider>
  );
}

export function useClientFlow(): ClientFlowContextType {
  const context = useContext(ClientFlowContext);
  if (context === undefined) {
    throw new Error("useClientFlow must be used within a ClientFlowProvider");
  }
  return context;
}
