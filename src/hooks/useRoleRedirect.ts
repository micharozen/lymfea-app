import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "concierge" | "hairdresser" | "user" | null;

export interface RoleRedirectResult {
  role: UserRole;
  redirectPath: string;
}

/**
 * Determines the user's role and appropriate redirect path
 * @param userId - The user's UUID
 * @returns Promise with role and redirect path
 */
export async function getRoleRedirect(userId: string): Promise<RoleRedirectResult> {
  try {
    // 1) Prefer roles table
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError) {
      console.warn("[getRoleRedirect] user_roles error:", rolesError);
    }

    const roleList = roles?.map((r) => r.role) || [];

    // Priority: admin > concierge > hairdresser > user
    if (roleList.includes("admin")) {
      return { role: "admin", redirectPath: "/admin/dashboard" };
    }

    if (roleList.includes("concierge")) {
      return { role: "concierge", redirectPath: "/admin/dashboard" };
    }

    if (roleList.includes("hairdresser")) {
      const { data: hairdresser } = await supabase
        .from("hairdressers")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle();

      if (hairdresser?.status === "En attente") {
        return { role: "hairdresser", redirectPath: "/pwa/onboarding" };
      }
      return { role: "hairdresser", redirectPath: "/pwa/dashboard" };
    }

    // 2) Fallback inference (for legacy users missing user_roles) — read-only, no role writes
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (adminRow) {
      return { role: "admin", redirectPath: "/admin/dashboard" };
    }

    const { data: conciergeRow } = await supabase
      .from("concierges")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (conciergeRow) {
      return { role: "concierge", redirectPath: "/admin/dashboard" };
    }

    const { data: hairdresserRow } = await supabase
      .from("hairdressers")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (hairdresserRow) {
      if (hairdresserRow.status === "En attente") {
        return { role: "hairdresser", redirectPath: "/pwa/onboarding" };
      }
      return { role: "hairdresser", redirectPath: "/pwa/dashboard" };
    }

    // Default: unknown role -> PWA welcome
    return { role: null, redirectPath: "/pwa/welcome" };
  } catch (error) {
    console.error("Error getting role redirect:", error);
    return { role: null, redirectPath: "/pwa/welcome" };
  }
}
