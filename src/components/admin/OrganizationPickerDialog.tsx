import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
}

export function OrganizationPickerDialog() {
  const { isSuperAdmin, hasChosenActiveOrganization, setActiveOrganization, loading } = useUser();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [fetching, setFetching] = useState(false);

  const open = !loading && isSuperAdmin && !hasChosenActiveOrganization;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setFetching(true);
      const { data } = await supabase
        .from("organizations")
        .select("id, name, logo_url")
        .order("name");
      if (!cancelled) {
        setOrgs(data ?? []);
        setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSelect = (id: string | null) => {
    setActiveOrganization(id);
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Choisir une organisation</DialogTitle>
          <DialogDescription>
            Vous êtes super-admin Lymfea. Choisissez l'organisation sur laquelle vous souhaitez opérer.
            Vous pourrez changer à tout moment depuis la barre latérale.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent",
            )}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Voir tout</div>
              <div className="text-xs text-muted-foreground">Lymfea Staff — accès global</div>
            </div>
          </button>

          {fetching && (
            <div className="py-4 text-center text-sm text-muted-foreground">Chargement…</div>
          )}

          {!fetching && orgs.length === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Aucune organisation. Créez-en une depuis la page « Organisations ».
            </div>
          )}

          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => handleSelect(org.id)}
              className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
            >
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-muted">
                {org.logo_url ? (
                  <img src={org.logo_url} alt={org.name} className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 text-sm font-medium">{org.name}</div>
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => handleSelect(null)}>
            Passer — voir tout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
