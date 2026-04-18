import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

const ACTIVE_ORG_STORAGE_KEY = "lymfea.activeOrganizationId";
const ACTIVE_ORG_VIEW_ALL = "__all__";

interface UserContextType {
  userId: string | null;
  role: "admin" | "concierge" | null;
  hotelIds: string[];
  organizationId: string | null;
  organizationName: string | null;
  isSuperAdmin: boolean;
  activeOrganizationId: string | null;
  hasChosenActiveOrganization: boolean;
  setActiveOrganization: (id: string | null) => void;
  isAdmin: boolean;
  isConcierge: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

function readStoredActiveOrg(): { id: string | null; hasChosen: boolean } {
  try {
    const raw = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
    if (raw === null) return { id: null, hasChosen: false };
    if (raw === ACTIVE_ORG_VIEW_ALL) return { id: null, hasChosen: true };
    return { id: raw, hasChosen: true };
  } catch {
    return { id: null, hasChosen: false };
  }
}

function writeStoredActiveOrg(id: string | null) {
  try {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, id ?? ACTIVE_ORG_VIEW_ALL);
  } catch {
    // localStorage unavailable (private mode, etc.) — fail silently
  }
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "concierge" | null>(null);
  const [hotelIds, setHotelIds] = useState<string[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(null);
  const [hasChosenActiveOrganization, setHasChosenActiveOrganization] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchUserContext = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setUserId(null);
        setRole(null);
        setHotelIds([]);
        setOrganizationId(null);
        setOrganizationName(null);
        setIsSuperAdmin(false);
        setActiveOrganizationIdState(null);
        setHasChosenActiveOrganization(false);
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "concierge"])
        .maybeSingle();

      const userRole = roleData?.role as "admin" | "concierge" | null;
      setRole(userRole);

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
        setOrganizationId(null);
        setOrganizationName(null);
        setIsSuperAdmin(false);
        setActiveOrganizationIdState(null);
        setHasChosenActiveOrganization(false);
      } else if (userRole === "admin") {
        const { data: adminRow } = await supabase
          .from("admins")
          .select("is_super_admin, organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        const superAdmin = adminRow?.is_super_admin ?? false;
        const orgId = adminRow?.organization_id ?? null;
        setIsSuperAdmin(superAdmin);
        setOrganizationId(orgId);

        let effectiveOrgId: string | null;
        let chosen: boolean;

        if (superAdmin) {
          const stored = readStoredActiveOrg();
          effectiveOrgId = stored.id;
          chosen = stored.hasChosen;
          setActiveOrganizationIdState(effectiveOrgId);
          setHasChosenActiveOrganization(chosen);
        } else {
          effectiveOrgId = orgId;
          chosen = true;
          setActiveOrganizationIdState(effectiveOrgId);
          setHasChosenActiveOrganization(true);
        }

        if (effectiveOrgId) {
          const { data: org } = await supabase
            .from("organizations")
            .select("id, name")
            .eq("id", effectiveOrgId)
            .maybeSingle();
          setOrganizationName(org?.name ?? null);

          const { data: orgHotels } = await supabase
            .from("hotels")
            .select("id")
            .eq("organization_id", effectiveOrgId);
          setHotelIds(orgHotels?.map((h) => h.id) ?? []);
        } else {
          setOrganizationName(null);
          setHotelIds([]);
        }
      } else {
        setHotelIds([]);
        setOrganizationId(null);
        setOrganizationName(null);
        setIsSuperAdmin(false);
        setActiveOrganizationIdState(null);
        setHasChosenActiveOrganization(false);
      }
    } catch (error) {
      console.error("Error fetching user context:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const setActiveOrganization = useCallback(
    (id: string | null) => {
      writeStoredActiveOrg(id);
      setActiveOrganizationIdState(id);
      setHasChosenActiveOrganization(true);
      fetchUserContext();
    },
    [fetchUserContext],
  );

  useEffect(() => {
    fetchUserContext();

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
      organizationId,
      organizationName,
      isSuperAdmin,
      activeOrganizationId,
      hasChosenActiveOrganization,
      setActiveOrganization,
      isAdmin: role === "admin",
      isConcierge: role === "concierge",
      loading,
      refresh: fetchUserContext,
    }),
    [
      userId,
      role,
      hotelIds,
      organizationId,
      organizationName,
      isSuperAdmin,
      activeOrganizationId,
      hasChosenActiveOrganization,
      setActiveOrganization,
      loading,
      fetchUserContext,
    ],
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
