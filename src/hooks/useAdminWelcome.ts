import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

type WelcomeRow = "admins" | "concierges";

interface State {
  shouldShow: boolean;
  loading: boolean;
}

export function useAdminWelcome() {
  const { userId, role, loading: userLoading } = useUser();
  const [state, setState] = useState<State>({ shouldShow: false, loading: true });

  const tableName: WelcomeRow | null =
    role === "admin" ? "admins" : role === "concierge" ? "concierges" : null;

  const refetch = useCallback(async () => {
    if (!userId || !tableName) {
      setState({ shouldShow: false, loading: false });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    const { data, error } = await supabase
      .from(tableName)
      .select("welcome_seen_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      setState({ shouldShow: false, loading: false });
      return;
    }
    setState({ shouldShow: !data?.welcome_seen_at, loading: false });
  }, [userId, tableName]);

  useEffect(() => {
    if (userLoading) return;
    refetch();
  }, [userLoading, refetch]);

  const dismiss = useCallback(async () => {
    setState({ shouldShow: false, loading: false });
    if (!userId || !tableName) return;
    await supabase
      .from(tableName)
      .update({ welcome_seen_at: new Date().toISOString() })
      .eq("user_id", userId);
  }, [userId, tableName]);

  const reopen = useCallback(async () => {
    if (!userId || !tableName) return;
    await supabase
      .from(tableName)
      .update({ welcome_seen_at: null })
      .eq("user_id", userId);
    setState({ shouldShow: true, loading: false });
  }, [userId, tableName]);

  return {
    shouldShow: state.shouldShow,
    loading: state.loading || userLoading,
    dismiss,
    reopen,
  };
}
