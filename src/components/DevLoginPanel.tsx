import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getRoleRedirect } from "@/hooks/useRoleRedirect";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2 } from "lucide-react";

const IS_LOCAL_DEV = import.meta.env.VITE_SUPABASE_PROJECT_ID === "local";

// All seeded dev accounts share this password (see supabase/seed.sql).
const DEV_PASSWORD = "password";

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
    password: DEV_PASSWORD,
    description: "Admin dashboard",
  },
  {
    label: "Équipe lieu",
    email: "concierge@oom.dev",
    password: DEV_PASSWORD,
    description: "Vue équipe lieu (hôtel)",
  },
];

// Seeded therapists (see supabase/seed.sql). The therapists table blocks
// anonymous reads, so we can't list them dynamically from the login page —
// and only seeded accounts share DEV_PASSWORD anyway.
const DEV_THERAPISTS: DevUser[] = [
  {
    label: "Dev Therapist",
    email: "therapist@lymfea.dev",
    password: DEV_PASSWORD,
    description: "therapist@lymfea.dev (female)",
  },
  {
    label: "Marc Therapist",
    email: "therapist-m@lymfea.dev",
    password: DEV_PASSWORD,
    description: "therapist-m@lymfea.dev (male)",
  },
];

const TEST_HOTEL_ID = "00000000-0000-0000-0000-000000000010";

export const DevLoginPanel = () => {
  const navigate = useNavigate();
  const [loadingUser, setLoadingUser] = useState<string | null>(null);
  const [therapistsOpen, setTherapistsOpen] = useState(false);

  if (!IS_LOCAL_DEV) return null;

  const handleQuickLogin = async (email: string, password: string) => {
    setLoadingUser(email);
    try {
      await supabase.auth.signOut();

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
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
            body: { userId: data.user.id, email },
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
    <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
      <p className="text-xs font-medium text-primary">Dev Quick Login</p>
      <div className="space-y-2">
        {DEV_USERS.map((user) => (
          <Button
            key={user.email}
            variant="outline"
            className="w-full justify-start h-auto py-2.5"
            onClick={() => handleQuickLogin(user.email, user.password)}
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

        <div className="space-y-1.5">
          <Button
            variant="outline"
            className="w-full justify-between h-auto py-2.5"
            onClick={() => setTherapistsOpen((open) => !open)}
            disabled={loadingUser !== null}
          >
            <div className="text-left">
              <div className="font-medium text-sm">Therapist (PWA)</div>
              <div className="text-xs text-muted-foreground">
                Mobile app therapist — choisir un thérapeute
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${
                therapistsOpen ? "rotate-180" : ""
              }`}
            />
          </Button>

          {therapistsOpen && (
            <div className="ml-1 space-y-1.5 border-l-2 border-primary/20 pl-3">
              {DEV_THERAPISTS.map((therapist) => (
                <Button
                  key={therapist.email}
                  variant="outline"
                  className="w-full justify-start h-auto py-2"
                  onClick={() =>
                    handleQuickLogin(therapist.email, therapist.password)
                  }
                  disabled={loadingUser !== null}
                >
                  <div className="text-left">
                    <div className="font-medium text-sm">
                      {loadingUser === therapist.email ? (
                        <span className="flex items-center gap-2">
                          Connexion...{" "}
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      ) : (
                        therapist.label
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {therapist.description}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-primary/20 pt-2">
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
