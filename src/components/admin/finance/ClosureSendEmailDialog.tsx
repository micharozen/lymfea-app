import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, Mail, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface RecipientCandidate {
  id: string;
  email: string;
  name: string;
  role: "admin" | "concierge";
  hotel_id: string | null;
}

interface ClosureSendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  venueName: string;
  defaultSubject: string;
  onSend: (recipients: string[], includeDetails: boolean) => Promise<void>;
  defaultIncludeDetails?: boolean;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ClosureSendEmailDialog({
  open,
  onOpenChange,
  venueId,
  venueName,
  defaultSubject,
  onSend,
  defaultIncludeDetails = false,
}: ClosureSendEmailDialogProps) {
  const [candidates, setCandidates] = useState<RecipientCandidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [includeDetails, setIncludeDetails] = useState(defaultIncludeDetails);
  const [sending, setSending] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIncludeDetails(defaultIncludeDetails);
    setLoadingCandidates(true);
    Promise.all([
      supabase.from("admins").select("id, email, first_name, last_name").eq("status", "active"),
      supabase
        .from("concierges")
        .select("id, email, first_name, last_name, hotel_id, status")
        .eq("status", "active"),
    ])
      .then(([adminsRes, conciergesRes]) => {
        const admins: RecipientCandidate[] = (adminsRes.data ?? []).map((a) => ({
          id: `admin-${a.id}`,
          email: a.email,
          name: `${a.first_name} ${a.last_name}`.trim(),
          role: "admin" as const,
          hotel_id: null,
        }));
        const concierges: RecipientCandidate[] = (conciergesRes.data ?? []).map((c) => ({
          id: `concierge-${c.id}`,
          email: c.email,
          name: `${c.first_name} ${c.last_name}`.trim(),
          role: "concierge" as const,
          hotel_id: c.hotel_id,
        }));
        setCandidates([...concierges, ...admins]);
      })
      .catch((err) => {
        console.error("[ClosureSendEmailDialog] failed to load recipients", err);
        toast.error("Impossible de charger la liste des destinataires");
      })
      .finally(() => setLoadingCandidates(false));
  }, [open, defaultIncludeDetails]);

  const venueConcierges = useMemo(
    () => candidates.filter((c) => c.role === "concierge" && c.hotel_id === venueId),
    [candidates, venueId],
  );
  const otherCandidates = useMemo(
    () => candidates.filter((c) => !(c.role === "concierge" && c.hotel_id === venueId)),
    [candidates, venueId],
  );

  const filterFn = (c: RecipientCandidate) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  };

  const filteredVenue = venueConcierges.filter(filterFn);
  const filteredOther = otherCandidates.filter(filterFn);

  const toggle = (email: string) => {
    setSelected((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  };

  const addCustom = () => {
    const value = customEmail.trim().toLowerCase();
    if (!EMAIL_RX.test(value)) {
      toast.error("Email invalide");
      return;
    }
    if (selected.includes(value)) {
      toast.info("Email déjà sélectionné");
      return;
    }
    setSelected((prev) => [...prev, value]);
    setCustomEmail("");
  };

  const handleSend = async () => {
    if (!selected.length) {
      toast.error("Sélectionnez au moins un destinataire");
      return;
    }
    setSending(true);
    try {
      await onSend(selected, includeDetails);
      toast.success(`Rapport envoyé à ${selected.length} destinataire${selected.length > 1 ? "s" : ""}`);
      onOpenChange(false);
      setSelected([]);
    } catch (error) {
      console.error("[ClosureSendEmailDialog] send failed:", error);
      const msg = error instanceof Error ? error.message : "Erreur lors de l'envoi";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Envoyer la clôture par email</DialogTitle>
          <DialogDescription>{defaultSubject}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 rounded-md border bg-muted/30">
              {selected.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1 pl-2 pr-1">
                  {email}
                  <button
                    type="button"
                    onClick={() => toggle(email)}
                    className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                    aria-label={`Retirer ${email}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un admin ou gestionnaire du lieu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <ScrollArea className="h-56 rounded-md border">
            <div className="p-2 space-y-1">
              {loadingCandidates ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Chargement…
                </div>
              ) : (
                <>
                  {filteredVenue.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground px-2 pt-1">
                        Gestion du lieu — {venueName}
                      </p>
                      {filteredVenue.map((c) => (
                        <RecipientRow
                          key={c.id}
                          candidate={c}
                          checked={selected.includes(c.email)}
                          onToggle={() => toggle(c.email)}
                        />
                      ))}
                    </>
                  )}
                  {filteredOther.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-muted-foreground px-2 pt-3">Autres contacts</p>
                      {filteredOther.map((c) => (
                        <RecipientRow
                          key={c.id}
                          candidate={c}
                          checked={selected.includes(c.email)}
                          onToggle={() => toggle(c.email)}
                        />
                      ))}
                    </>
                  )}
                  {!filteredVenue.length && !filteredOther.length && (
                    <p className="text-sm text-muted-foreground text-center py-6">Aucun contact</p>
                  )}
                </>
              )}
            </div>
          </ScrollArea>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ajouter un email manuel</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="email@exemple.com"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addCustom} disabled={!customEmail.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <Checkbox
              id="closure-include-details"
              checked={includeDetails}
              onCheckedChange={(v) => setIncludeDetails(v === true)}
            />
            <Label htmlFor="closure-include-details" className="text-sm font-normal cursor-pointer">
              Inclure le détail des prestations
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={sending || !selected.length}>
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            Envoyer ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecipientRow({
  candidate,
  checked,
  onToggle,
}: {
  candidate: RecipientCandidate;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      htmlFor={candidate.id}
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
    >
      <Checkbox id={candidate.id} checked={checked} onCheckedChange={onToggle} />
      <div className="flex-1 min-w-0">
        <p className="truncate">
          {candidate.name || candidate.email}{" "}
          <span className="text-xs text-muted-foreground">· {candidate.role === "admin" ? "Admin" : "Gestion lieu"}</span>
        </p>
        <p className="text-xs text-muted-foreground truncate">{candidate.email}</p>
      </div>
    </label>
  );
}
