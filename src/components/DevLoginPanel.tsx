import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getRoleRedirect } from "@/hooks/useRoleRedirect";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const IS_LOCAL_DEV = import.meta.env.VITE_SUPABASE_PROJECT_ID === "local";

interface DevUser {
  label: string;
  email: string;
  password: string;
  description: string;
}

const DEV_USERS: DevUser[] = [
  {
    label: "Admin",
    email: "admin@oom.dev",
    password: "password",
    description: "Admin dashboard",
  },
  {
    label: "Concierge",
    email: "concierge@oom.dev",
    password: "password",
    description: "Vue concierge (hôtel)",
  },
  {
    label: "Therapist (PWA)",
    email: "therapist@lymfea.dev",
    password: "password",
    description: "Mobile app therapist",
  },
];

const TEST_HOTEL_ID = "00000000-0000-0000-0000-000000000010";

export const DevLoginPanel = () => {
  const navigate = useNavigate();
  const [loadingUser, setLoadingUser] = useState<string | null>(null);

  if (!IS_LOCAL_DEV) return null;

  const handleQuickLogin = async (user: DevUser) => {
    setLoadingUser(user.email);
    try {
      await supabase.auth.signOut();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });

      if (error) {
        console.error("[DevLogin] Sign-in failed:", error.message);
        alert(
          `Dev login failed: ${error.message}\n\nAs-tu lancé 'supabase db reset' pour créer les users de test ?`
        );
        return;
      }

      if (data?.user) {
        await supabase.functions
          .invoke("ensure-user-role", {
            body: { userId: data.user.id, email: user.email },
          })
          .catch(() => {});

        const { redirectPath } = await getRoleRedirect(data.user.id);
        navigate(redirectPath, { replace: true });
      }
    } finally {
      setLoadingUser(null);
    }
  };

  const handleClientView = () => {
    navigate(`/client/${TEST_HOTEL_ID}`);
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/50 p-4 space-y-3">
      <p className="text-xs font-medium text-orange-700">Dev Quick Login</p>
      <div className="space-y-2">
        {DEV_USERS.map((user) => (
          <Button
            key={user.email}
            variant="outline"
            className="w-full justify-start h-auto py-2.5"
            onClick={() => handleQuickLogin(user)}
            disabled={loadingUser !== null}
          >
            <div className="text-left">
              <div className="font-medium text-sm">
                {loadingUser === user.email ? (
                  <span className="flex items-center gap-2">
                    Connexion... <Loader2 className="h-3 w-3 animate-spin" />
                  </span>
                ) : (
                  user.label
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {user.description}
              </div>
            </div>
          </Button>
        ))}

        <div className="border-t border-orange-200 pt-2">
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-2.5"
            onClick={handleClientView}
            disabled={loadingUser !== null}
          >
            <div className="text-left">
              <div className="font-medium text-sm">Client View</div>
              <div className="text-xs text-muted-foreground">
                Flow réservation public (pas d'auth)
              </div>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
};
