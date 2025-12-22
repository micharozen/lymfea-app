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
  const debug = !!import.meta.env.DEV;
  const log = (...args: unknown[]) => {
    if (debug) console.debug("[getRoleRedirect]", ...args);
  };

  try {
    log("start", { userId });

    // 1) Prefer roles table
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError) {
      console.warn("[getRoleRedirect] user_roles error:", rolesError);
    }

    const roleList = roles?.map((r) => r.role) || [];
    log("user_roles result", { roleList });

    // Priority: admin > concierge > hairdresser > user
    if (roleList.includes("admin")) {
      log("match: admin -> /admin/dashboard");
      return { role: "admin", redirectPath: "/admin/dashboard" };
    }

    if (roleList.includes("concierge")) {
      log("match: concierge -> /admin/dashboard");
      return { role: "concierge", redirectPath: "/admin/dashboard" };
    }

    if (roleList.includes("hairdresser")) {
      const { data: hairdresser, error: hairdresserError } = await supabase
        .from("hairdressers")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle();

      if (hairdresserError) {
        console.warn("[getRoleRedirect] hairdressers status error:", hairdresserError);
      }

      log("hairdresser status", { status: hairdresser?.status ?? null });

      if (hairdresser?.status === "En attente") {
        log("match: hairdresser pending -> /pwa/onboarding");
        return { role: "hairdresser", redirectPath: "/pwa/onboarding" };
      }
      log("match: hairdresser -> /pwa/dashboard");
      return { role: "hairdresser", redirectPath: "/pwa/dashboard" };
    }

    // 2) Fallback inference (for legacy users missing user_roles) — read-only, no role writes
    log("no role in user_roles; trying legacy inference");

    const { data: adminRow, error: adminError } = await supabase
      .from("admins")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (adminError) {
      console.warn("[getRoleRedirect] admins lookup error:", adminError);
    }

    if (adminRow) {
      log("legacy match: admin -> /admin/dashboard");
      return { role: "admin", redirectPath: "/admin/dashboard" };
    }

    const { data: conciergeRow, error: conciergeError } = await supabase
      .from("concierges")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (conciergeError) {
      console.warn("[getRoleRedirect] concierges lookup error:", conciergeError);
    }

    if (conciergeRow) {
      log("legacy match: concierge -> /admin/dashboard");
      return { role: "concierge", redirectPath: "/admin/dashboard" };
    }

    const { data: hairdresserRow, error: hairdresserRowError } = await supabase
      .from("hairdressers")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (hairdresserRowError) {
      console.warn("[getRoleRedirect] hairdressers lookup error:", hairdresserRowError);
    }

    if (hairdresserRow) {
      log("legacy match: hairdresser", { status: hairdresserRow.status });
      if (hairdresserRow.status === "En attente") {
        return { role: "hairdresser", redirectPath: "/pwa/onboarding" };
      }
      return { role: "hairdresser", redirectPath: "/pwa/dashboard" };
    }

    // Default: unknown role -> PWA welcome
    log("no match found; default -> /pwa/welcome");
    return { role: null, redirectPath: "/pwa/welcome" };
  } catch (error) {
    console.error("[getRoleRedirect] unexpected error:", error);
    return { role: null, redirectPath: "/pwa/welcome" };
  }
}
