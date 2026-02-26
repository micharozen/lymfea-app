import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "concierge" | "therapist" | "user" | null;

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

  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as any).standalone === true
  );
  const adminPath = isStandalone ? "/admin-pwa/accueil" : "/admin/dashboard";

  try {
    log("start", { userId, isStandalone });

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

    // Priority: admin > concierge > therapist
    if (roleList.includes("admin")) {
      log("match: admin (user_roles) -> /admin/dashboard");
      return { role: "admin", redirectPath: adminPath };
    }

    if (roleList.includes("concierge")) {
      log("match: concierge (user_roles) -> /admin/dashboard");
      return { role: "concierge", redirectPath: adminPath };
    }

    if (roleList.includes("therapist")) {
      log("match: therapist (user_roles) -> checking status");
      const { data: therapist, error: therapistError } = await supabase
        .from("therapists")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle();

      if (therapistError) {
        console.warn("[getRoleRedirect] therapists status error:", therapistError);
      }

      log("therapist status", { status: therapist?.status ?? null });

      if (therapist?.status === "En attente") {
        log("match: therapist pending -> /pwa/onboarding");
        return { role: "therapist", redirectPath: "/pwa/onboarding" };
      }
      log("match: therapist -> /pwa/dashboard");
      return { role: "therapist", redirectPath: "/pwa/dashboard" };
    }

    // 1b) If RLS prevents reading user_roles/admins tables on the client,
    // use the security-definer RPC as the source of truth.
    const { data: isAdmin, error: isAdminErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (isAdminErr) console.warn("[getRoleRedirect] has_role(admin) error:", isAdminErr);
    log("has_role(admin)", { isAdmin: !!isAdmin });
    if (isAdmin) return { role: "admin", redirectPath: adminPath };

    const { data: isConcierge, error: isConciergeErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "concierge",
    });
    if (isConciergeErr) console.warn("[getRoleRedirect] has_role(concierge) error:", isConciergeErr);
    log("has_role(concierge)", { isConcierge: !!isConcierge });
    if (isConcierge) return { role: "concierge", redirectPath: adminPath };

    const { data: isTherapist, error: isTherapistErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "therapist",
    });
    if (isTherapistErr) console.warn("[getRoleRedirect] has_role(therapist) error:", isTherapistErr);
    log("has_role(therapist)", { isTherapist: !!isTherapist });

    if (isTherapist) {
      const { data: therapist, error: therapistError } = await supabase
        .from("therapists")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle();

      if (therapistError) {
        console.warn("[getRoleRedirect] therapists status error:", therapistError);
      }

      log("therapist status (rpc confirmed)", { status: therapist?.status ?? null });

      if (therapist?.status === "En attente") {
        return { role: "therapist", redirectPath: "/pwa/onboarding" };
      }
      return { role: "therapist", redirectPath: "/pwa/dashboard" };
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
      return { role: "admin", redirectPath: adminPath };
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
      return { role: "concierge", redirectPath: adminPath };
    }

    const { data: therapistRow, error: therapistRowError } = await supabase
      .from("therapists")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (therapistRowError) {
      console.warn("[getRoleRedirect] therapists lookup error:", therapistRowError);
    }

    if (therapistRow) {
      log("legacy match: therapist", { status: therapistRow.status });
      if (therapistRow.status === "En attente") {
        return { role: "therapist", redirectPath: "/pwa/onboarding" };
      }
      return { role: "therapist", redirectPath: "/pwa/dashboard" };
    }

    // Default: unknown role -> PWA welcome
    log("no match found; default -> /pwa/welcome");
    return { role: null, redirectPath: "/pwa/welcome" };
  } catch (error) {
    console.error("[getRoleRedirect] unexpected error:", error);
    return { role: null, redirectPath: "/pwa/welcome" };
  }
}
