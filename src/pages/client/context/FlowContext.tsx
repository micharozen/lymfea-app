import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

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
}

export interface SelectedBundle {
  customerBundleId: string;
  bundleName: string;
  remainingSessions: number;
  eligibleTreatmentIds: string[];
}

interface ClientFlowState {
  bookingDateTime: BookingDateTime | null;
  clientInfo: ClientInfo | null;
  pendingCheckoutSession: string | null;
  therapistGenderPreference: TherapistGender;
  selectedBundle: SelectedBundle | null;
  isBundleOnlyPurchase: boolean;
}

interface ClientFlowContextType extends ClientFlowState {
  setBookingDateTime: (data: BookingDateTime) => void;
  setClientInfo: (data: ClientInfo) => void;
  setPendingCheckoutSession: (sessionId: string) => void;
  setTherapistGenderPreference: (gender: TherapistGender) => void;
  setSelectedBundle: (bundle: SelectedBundle | null) => void;
  setIsBundleOnlyPurchase: (value: boolean) => void;
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

  const clearFlow = useCallback(() => {
    setBookingDateTimeState(null);
    setClientInfoState(null);
    setPendingCheckoutSessionState(null);
    setTherapistGenderPreferenceState(null);
    setSelectedBundleState(null);
    setIsBundleOnlyPurchaseState(false);
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
      setBookingDateTime,
      setClientInfo,
      setPendingCheckoutSession,
      setTherapistGenderPreference,
      setSelectedBundle,
      setIsBundleOnlyPurchase,
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
      setBookingDateTime,
      setClientInfo,
      setPendingCheckoutSession,
      setTherapistGenderPreference,
      setSelectedBundle,
      setIsBundleOnlyPurchase,
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
