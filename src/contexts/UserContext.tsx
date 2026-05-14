import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UserContextType {
  userId: string | null;
  role: "admin" | "concierge" | null;
  hotelIds: string[];
  isAdmin: boolean;
  isConcierge: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "concierge" | null>(null);
  const [hotelIds, setHotelIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserContext = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setUserId(null);
        setRole(null);
        setHotelIds([]);
        setLoading(false);
        return;
      }

      setUserId(user.id);

      // Get user role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "concierge"])
        .maybeSingle();

      const userRole = roleData?.role as "admin" | "concierge" | null;
      setRole(userRole);

      // Get hotel IDs for concierge
      if (userRole === "concierge") {
        const { data: concierge } = await supabase
          .from("concierges")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (concierge) {
          const { data: conciergeHotels } = await supabase
            .from("concierge_hotels")
            .select("hotel_id")
            .eq("concierge_id", concierge.id);

          setHotelIds(conciergeHotels?.map((h) => h.hotel_id) || []);
        } else {
          setHotelIds([]);
        }
      } else {
        setHotelIds([]);
      }
    } catch (error) {
      console.error("Error fetching user context:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserContext();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUserContext();
    });

    return () => subscription.unsubscribe();
  }, [fetchUserContext]);

  const value = useMemo(
    () => ({
      userId,
      role,
      hotelIds,
      isAdmin: role === "admin",
      isConcierge: role === "concierge",
      loading,
      refresh: fetchUserContext,
    }),
    [userId, role, hotelIds, loading, fetchUserContext]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
