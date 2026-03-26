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

interface ClientFlowState {
  bookingDateTime: BookingDateTime | null;
  clientInfo: ClientInfo | null;
  pendingCheckoutSession: string | null;
  therapistGenderPreference: TherapistGender;
}

interface ClientFlowContextType extends ClientFlowState {
  setBookingDateTime: (data: BookingDateTime) => void;
  setClientInfo: (data: ClientInfo) => void;
  setPendingCheckoutSession: (sessionId: string) => void;
  setTherapistGenderPreference: (gender: TherapistGender) => void;
  clearFlow: () => void;
  canProceedToStep: (step: "info" | "payment" | "confirmation") => boolean;
}

const ClientFlowContext = createContext<ClientFlowContextType | undefined>(undefined);

export function ClientFlowProvider({ children }: { children: React.ReactNode }) {
  const [bookingDateTime, setBookingDateTimeState] = useState<BookingDateTime | null>(null);
  const [clientInfo, setClientInfoState] = useState<ClientInfo | null>(null);
  const [pendingCheckoutSession, setPendingCheckoutSessionState] = useState<string | null>(null);
  const [therapistGenderPreference, setTherapistGenderPreferenceState] = useState<TherapistGender>(null);

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

  const clearFlow = useCallback(() => {
    setBookingDateTimeState(null);
    setClientInfoState(null);
    setPendingCheckoutSessionState(null);
    setTherapistGenderPreferenceState(null);
  }, []);

  const canProceedToStep = useCallback(
    (step: "info" | "payment" | "confirmation") => {
      switch (step) {
        case "info":
          return bookingDateTime !== null;
        case "payment":
          return bookingDateTime !== null && clientInfo !== null;
        case "confirmation":
          return bookingDateTime !== null && clientInfo !== null;
        default:
          return false;
      }
    },
    [bookingDateTime, clientInfo]
  );

  const value = useMemo(
    () => ({
      bookingDateTime,
      clientInfo,
      pendingCheckoutSession,
      therapistGenderPreference,
      setBookingDateTime,
      setClientInfo,
      setPendingCheckoutSession,
      setTherapistGenderPreference,
      clearFlow,
      canProceedToStep,
    }),
    [
      bookingDateTime,
      clientInfo,
      pendingCheckoutSession,
      therapistGenderPreference,
      setBookingDateTime,
      setClientInfo,
      setPendingCheckoutSession,
      setTherapistGenderPreference,
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
