import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Ticket } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/formatPrice";
import { MIN_VOUCHER_CODE_LENGTH, normalizeVoucherCode } from "@/lib/voucherCode";
import { cn } from "@/lib/utils";

/**
 * Bons cadeaux achetés chez un revendeur externe (Wonderbox, Smartbox…).
 *
 * Ils vivent dans `customer_treatment_bundles` comme les cartes cadeaux Saoma,
 * distingués par `origin = 'external'`. Comme leurs `bundle_id`/`customer_id`
 * sont nuls, l'embed `!inner` de l'onglet « Ventes » les exclut d'office : les
 * deux vues ne se marchent jamais dessus.
 */

const NO_RESELLER = "__none__";

/** Champs pouvant porter une erreur de saisie dans le dialogue d'enregistrement. */
type FieldErrors = Partial<Record<"hotel" | "code" | "amount" | "expiresAt", string>>;

/** Marque un champ obligatoire. Aucun équivalent partagé n'existe encore dans l'app. */
function RequiredMark() {
  return (
    <span className="text-destructive ml-0.5" aria-hidden="true">
      *
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

interface VoucherReseller {
  id: string;
  name: string;
  slug: string;
  default_validity_months: number | null;
  code_pattern: string | null;
}

interface ExternalVoucher {
  id: string;
  hotel_id: string;
  external_code: string;
  total_amount_cents: number;
  used_amount_cents: number;
  expires_at: string;
  status: string;
  recipient_name: string | null;
  notes: string | null;
  created_at: string;
  voucher_resellers: { name: string } | null;
  customers: { first_name: string | null; last_name: string | null } | null;
}

interface VenueExternalVouchersPanelProps {
  /** Lieu imposé quand le panneau est monté depuis la fiche d'un lieu. */
  hotelId?: string;
  /** Filtre lieu de la page globale ("all" = tous). Ignoré si hotelId est fourni. */
  hotelFilter: string;
  hotels?: { id: string; name: string }[];
}

export function VenueExternalVouchersPanel({
  hotelId,
  hotelFilter,
  hotels,
}: VenueExternalVouchersPanelProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const isStandalone = !hotelId;

  const [dialogOpen, setDialogOpen] = useState(false);
  const effectiveHotelId = hotelId ?? (hotelFilter !== "all" ? hotelFilter : undefined);

  const vouchersQueryKey = useMemo(
    () => ["external-vouchers", hotelId ?? hotelFilter],
    [hotelId, hotelFilter],
  );

  const { data: resellers } = useQuery<VoucherReseller[]>({
    queryKey: ["voucher-resellers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_resellers")
        .select("id, name, slug, default_validity_months, code_pattern")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as VoucherReseller[];
    },
  });

  const { data: vouchers, isLoading } = useQuery<ExternalVoucher[]>({
    queryKey: vouchersQueryKey,
    queryFn: async () => {
      let query = supabase
        .from("customer_treatment_bundles")
        .select(
          `id, hotel_id, external_code, total_amount_cents, used_amount_cents, expires_at,
           status, recipient_name, notes, created_at,
           voucher_resellers:reseller_id(name),
           customers:beneficiary_customer_id(first_name, last_name)`,
        )
        .eq("origin", "external")
        .order("created_at", { ascending: false });
      if (hotelId) {
        query = query.eq("hotel_id", hotelId);
      } else if (hotelFilter !== "all") {
        query = query.eq("hotel_id", hotelFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ExternalVoucher[];
    },
  });

  const renderStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-green-500/10 text-green-700",
      completed: "bg-blue-500/10 text-blue-700",
      expired: "bg-orange-500/10 text-orange-700",
      cancelled: "bg-red-500/10 text-red-700",
    };
    return (
      <Badge variant="secondary" className={cn("text-[10px] px-2 py-0.5", map[status] ?? "")}>
        {t(`giftCards.status.${status}`, status)}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t("externalVouchers.add", "Enregistrer un bon")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !vouchers || vouchers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Ticket className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-normal">
              {t("externalVouchers.empty", "Aucun bon partenaire enregistré")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {t(
                "externalVouchers.emptyHint",
                "Enregistrez ici les bons reçus par mail de vos revendeurs pour que vos clients puissent les utiliser en ligne.",
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("externalVouchers.columns.code", "Référence")}</TableHead>
                <TableHead>{t("externalVouchers.columns.reseller", "Revendeur")}</TableHead>
                {isStandalone && <TableHead>{t("giftCards.columns.venue", "Lieu")}</TableHead>}
                <TableHead>{t("externalVouchers.columns.holder", "Bénéficiaire")}</TableHead>
                <TableHead className="text-center">
                  {t("giftCards.columns.balance", "Solde")}
                </TableHead>
                <TableHead className="text-center">
                  {t("giftCards.columns.expiresAt", "Expire le")}
                </TableHead>
                <TableHead className="text-center">
                  {t("giftCards.columns.status", "Statut")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.map((voucher) => {
                const remaining = voucher.total_amount_cents - voucher.used_amount_cents;
                return (
                  <TableRow key={voucher.id}>
                    <TableCell className="font-mono text-xs">{voucher.external_code}</TableCell>
                    <TableCell className="text-sm">
                      {voucher.voucher_resellers?.name ?? (
                        <span className="text-muted-foreground">
                          {t("externalVouchers.unknownReseller", "Non identifié")}
                        </span>
                      )}
                    </TableCell>
                    {isStandalone && (
                      <TableCell className="text-sm">
                        {hotels?.find((h) => h.id === voucher.hotel_id)?.name ?? "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-sm">
                      {[voucher.customers?.first_name, voucher.customers?.last_name]
                        .filter(Boolean)
                        .join(" ") ||
                        voucher.recipient_name ||
                        "—"}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {formatPrice(remaining / 100, "EUR", { decimals: 0 })}
                      {" / "}
                      {formatPrice(voucher.total_amount_cents / 100, "EUR", { decimals: 0 })}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {new Date(voucher.expires_at).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell className="text-center">
                      {renderStatusBadge(voucher.status)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <AddExternalVoucherDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        hotelId={effectiveHotelId}
        hotels={isStandalone ? hotels : undefined}
        resellers={resellers ?? []}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: vouchersQueryKey });
          queryClient.invalidateQueries({ queryKey: ["voucher-resellers"] });
        }}
      />
    </div>
  );
}

interface AddExternalVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotelId?: string;
  hotels?: { id: string; name: string }[];
  resellers: VoucherReseller[];
  onSaved: () => void;
}

function AddExternalVoucherDialog({
  open,
  onOpenChange,
  hotelId,
  hotels,
  resellers,
  onSaved,
}: AddExternalVoucherDialogProps) {
  const { t } = useTranslation("admin");

  const [resellerId, setResellerId] = useState<string>(NO_RESELLER);
  const [selectedHotelId, setSelectedHotelId] = useState<string | undefined>(hotelId);
  const [code, setCode] = useState("");
  const [amountEuros, setAmountEuros] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [holder, setHolder] = useState("");
  const [notes, setNotes] = useState("");
  // Rattachement facultatif : le lieu connaît parfois déjà le porteur du bon.
  // Sinon le bon sera rattaché tout seul à la première réservation qui l'utilise.
  const [customerSearch, setCustomerSearch] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  /** Une erreur disparaît dès que l'utilisateur corrige le champ concerné. */
  const clearError = (field: keyof FieldErrors) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const { data: customers } = useQuery({
    queryKey: ["customer-search", customerSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone")
        .or(
          `first_name.ilike.%${customerSearch}%,last_name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`,
        )
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: open && customerSearch.length >= 2 && !beneficiaryId,
  });

  const reseller = resellers.find((r) => r.id === resellerId);
  const normalizedCode = normalizeVoucherCode(code);
  const effectiveHotelId = hotelId ?? selectedHotelId;

  /** Avertissement seulement : un revendeur change de format sans prévenir. */
  const codeLooksUnusual = useMemo(() => {
    if (!reseller?.code_pattern || !normalizedCode) return false;
    try {
      return !new RegExp(reseller.code_pattern).test(normalizedCode);
    } catch {
      return false;
    }
  }, [reseller, normalizedCode]);

  const resetForm = () => {
    setResellerId(NO_RESELLER);
    setSelectedHotelId(hotelId);
    setCode("");
    setAmountEuros("");
    setExpiresAt("");
    setHolder("");
    setNotes("");
    setCustomerSearch("");
    setBeneficiaryId("");
    setErrors({});
  };

  /** Un revendeur peut porter une validité par défaut : on pré-remplit la date. */
  const handleResellerChange = (value: string) => {
    setResellerId(value);
    const months = resellers.find((r) => r.id === value)?.default_validity_months;
    if (months && !expiresAt) {
      const date = new Date();
      date.setMonth(date.getMonth() + months);
      setExpiresAt(date.toISOString().slice(0, 10));
    }
  };

  /** Erreurs par champ, affichées sous l'input concerné plutôt qu'en toast. */
  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!effectiveHotelId) {
      next.hotel = t("externalVouchers.errors.venueRequired", "Choisissez un lieu");
    }
    if (normalizedCode.length < MIN_VOUCHER_CODE_LENGTH) {
      next.code = t(
        "externalVouchers.errors.codeTooShort",
        "La référence doit faire au moins 4 caractères",
      );
    }
    const amount = Number(amountEuros.replace(",", "."));
    if (!amountEuros.trim() || !Number.isFinite(amount) || amount <= 0) {
      next.amount = t("externalVouchers.errors.amountInvalid", "Montant invalide");
    }
    if (!expiresAt) {
      next.expiresAt = t(
        "externalVouchers.errors.expiryRequired",
        "Renseignez une date d'expiration",
      );
    }
    return next;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(amountEuros.replace(",", "."));
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("customer_treatment_bundles").insert({
        origin: "external",
        source: "manual",
        is_gift: false,
        hotel_id: effectiveHotelId,
        reseller_id: resellerId === NO_RESELLER ? null : resellerId,
        external_code: code.trim(),
        external_code_normalized: normalizedCode,
        total_amount_cents: Math.round(amount * 100),
        expires_at: expiresAt,
        recipient_name: holder.trim() || null,
        // customer_id reste nul : personne n'a acheté ce bon chez nous.
        beneficiary_customer_id: beneficiaryId || null,
        notes: notes.trim() || null,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("externalVouchers.saved", "Bon enregistré"));
      resetForm();
      onOpenChange(false);
      onSaved();
    },
    onError: (error: unknown) => {
      // 23505 = uq_ctb_external_code. C'est bien une erreur de champ : on
      // l'affiche sous la référence plutôt qu'en toast, là où l'œil la cherche.
      if ((error as { code?: string })?.code === "23505") {
        setErrors({
          code: t("externalVouchers.errors.duplicate", "Cette référence existe déjà pour ce lieu"),
        });
        return;
      }
      // Reste les échecs imprévus (réseau, RLS) : aucun champ à incriminer.
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const handleSave = () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length === 0) saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-normal">
            {t("externalVouchers.dialogTitle", "Enregistrer un bon partenaire")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "externalVouchers.dialogSubtitle",
              "Saisissez le bon reçu par mail de votre revendeur. Le client pourra ensuite l'utiliser directement lors de sa réservation en ligne.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hotels && (
            <div className="space-y-1.5">
              <Label>
                {t("giftCards.columns.venue", "Lieu")}
                <RequiredMark />
              </Label>
              <SelectField
                options={hotels.map((h) => ({ value: h.id, label: h.name }))}
                value={selectedHotelId}
                onChange={(value) => {
                  setSelectedHotelId(value);
                  clearError("hotel");
                }}
                placeholder={t("externalVouchers.venuePlaceholder", "Choisir un lieu")}
              />
              <FieldError message={errors.hotel} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("externalVouchers.columns.reseller", "Revendeur")}</Label>
            <SelectField
              options={[
                {
                  value: NO_RESELLER,
                  label: t("externalVouchers.unknownReseller", "Non identifié"),
                },
                ...resellers.map((r) => ({ value: r.id, label: r.name })),
              ]}
              value={resellerId}
              onChange={handleResellerChange}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              {t("externalVouchers.columns.code", "Référence du bon")}
              <RequiredMark />
            </Label>
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                clearError("code");
              }}
              placeholder="WB-4471-9920"
              className={cn("font-mono", errors.code && "border-destructive")}
            />
            <FieldError message={errors.code} />
            {normalizedCode && (
              <p className="text-[11px] text-muted-foreground">
                {t("externalVouchers.normalizedAs", "Recherché comme")}{" "}
                <span className="font-mono">{normalizedCode}</span>
              </p>
            )}
            {codeLooksUnusual && (
              <p className="text-[11px] text-orange-600">
                {t(
                  "externalVouchers.codePatternWarning",
                  "Cette référence ne ressemble pas au format habituel de ce revendeur. Vous pouvez tout de même l'enregistrer.",
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                {t("externalVouchers.amount", "Montant (€)")}
                <RequiredMark />
              </Label>
              <Input
                inputMode="decimal"
                value={amountEuros}
                onChange={(e) => {
                  setAmountEuros(e.target.value);
                  clearError("amount");
                }}
                placeholder="150"
                className={cn(errors.amount && "border-destructive")}
              />
              <FieldError message={errors.amount} />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("giftCards.columns.expiresAt", "Expire le")}
                <RequiredMark />
              </Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => {
                  setExpiresAt(e.target.value);
                  clearError("expiresAt");
                }}
                className={cn(errors.expiresAt && "border-destructive")}
              />
              <FieldError message={errors.expiresAt} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("externalVouchers.columns.holder", "Bénéficiaire")}</Label>
            <Input
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder={t("externalVouchers.holderPlaceholder", "Nom figurant sur le bon")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              {t("externalVouchers.customer", "Client")}{" "}
              <span className="text-muted-foreground font-normal">
                {t("externalVouchers.optional", "(facultatif)")}
              </span>
            </Label>
            <div className="relative">
              <Input
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  if (beneficiaryId) setBeneficiaryId("");
                }}
                placeholder={t("externalVouchers.customerPlaceholder", "Nom ou téléphone")}
              />
              {customers && customers.length > 0 && !beneficiaryId && (
                <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                  {customers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        setBeneficiaryId(c.id);
                        setCustomerSearch(`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim());
                      }}
                    >
                      <span className="font-medium">
                        {c.first_name} {c.last_name}
                      </span>
                      <span className="text-muted-foreground ml-2">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "externalVouchers.customerHint",
                "Laissez vide si vous ne savez pas encore qui utilisera ce bon : il sera rattaché automatiquement à la première réservation.",
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("externalVouchers.notes", "Note interne")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t("externalVouchers.notesPlaceholder", "Reçu par mail le…")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Annuler")}
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t("common.save", "Enregistrer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
