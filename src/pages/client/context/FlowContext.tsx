import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

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
}

interface ClientFlowState {
  bookingDateTime: BookingDateTime | null;
  clientInfo: ClientInfo | null;
  pendingCheckoutSession: string | null;
}

interface ClientFlowContextType extends ClientFlowState {
  setBookingDateTime: (data: BookingDateTime) => void;
  setClientInfo: (data: ClientInfo) => void;
  setPendingCheckoutSession: (sessionId: string) => void;
  clearFlow: () => void;
  canProceedToStep: (step: "info" | "payment" | "confirmation") => boolean;
}

const ClientFlowContext = createContext<ClientFlowContextType | undefined>(undefined);

export function ClientFlowProvider({ children }: { children: React.ReactNode }) {
  const [bookingDateTime, setBookingDateTimeState] = useState<BookingDateTime | null>(null);
  const [clientInfo, setClientInfoState] = useState<ClientInfo | null>(null);
  const [pendingCheckoutSession, setPendingCheckoutSessionState] = useState<string | null>(null);

  const setBookingDateTime = useCallback((data: BookingDateTime) => {
    setBookingDateTimeState(data);
  }, []);

  const setClientInfo = useCallback((data: ClientInfo) => {
    setClientInfoState(data);
  }, []);

  const setPendingCheckoutSession = useCallback((sessionId: string) => {
    setPendingCheckoutSessionState(sessionId);
  }, []);

  const clearFlow = useCallback(() => {
    setBookingDateTimeState(null);
    setClientInfoState(null);
    setPendingCheckoutSessionState(null);
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
      setBookingDateTime,
      setClientInfo,
      setPendingCheckoutSession,
      clearFlow,
      canProceedToStep,
    }),
    [
      bookingDateTime,
      clientInfo,
      pendingCheckoutSession,
      setBookingDateTime,
      setClientInfo,
      setPendingCheckoutSession,
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
