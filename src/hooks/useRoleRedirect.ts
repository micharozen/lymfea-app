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
    // Check all user roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const roleList = roles?.map((r) => r.role) || [];

    // Priority: admin > concierge > hairdresser > user
    if (roleList.includes("admin")) {
      return { role: "admin", redirectPath: "/admin/dashboard" };
    }

    if (roleList.includes("concierge")) {
      return { role: "concierge", redirectPath: "/admin/dashboard" };
    }

    if (roleList.includes("hairdresser")) {
      // Check hairdresser onboarding status
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

    // Default: unknown role -> PWA welcome
    return { role: null, redirectPath: "/pwa/welcome" };
  } catch (error) {
    console.error("Error getting role redirect:", error);
    return { role: null, redirectPath: "/pwa/welcome" };
  }
}
