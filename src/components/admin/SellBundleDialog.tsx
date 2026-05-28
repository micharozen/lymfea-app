import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useOrgScope } from "@/hooks/useOrgScope";
import {
  hotelKeys,
  bundleKeys,
  listHotelsForOrg,
  listTreatmentBundlesForOrg,
} from "@shared/db";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, UserPlus } from "lucide-react";

interface SellBundleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  prefilledCustomerId?: string;
  prefilledCustomerName?: string;
}

export function SellBundleDialog({
  open,
  onOpenChange,
  onSuccess,
  prefilledCustomerId,
  prefilledCustomerName,
}: SellBundleDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const [selectedBundleId, setSelectedBundleId] = useState<string>("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(prefilledCustomerId || "");
  const [customerSearch, setCustomerSearch] = useState(prefilledCustomerName || "");
  const [showNewClient, setShowNewClient] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");

  const scope = useOrgScope();

  const { data: bundles } = useQuery({
    queryKey: bundleKeys.list(scope, "active"),
    enabled: open && !!scope,
    queryFn: () => listTreatmentBundlesForOrg(supabase, scope!, { status: "active" }),
  });

  const { data: hotels } = useQuery({
    queryKey: hotelKeys.list(scope),
    enabled: open && !!scope,
    queryFn: () => listHotelsForOrg(supabase, scope!),
  });

  // Search customers
  const { data: customers } = useQuery({
    queryKey: ["customer-search", customerSearch],
    queryFn: async () => {
      if (customerSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, phone, email")
        .or(`first_name.ilike.%${customerSearch}%,last_name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`)
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: open && customerSearch.length >= 2 && !selectedCustomerId,
  });

  const selectedBundle = bundles?.find((b) => b.id === selectedBundleId);
  const hotelName = (hotelId: string) => hotels?.find((h) => h.id === hotelId)?.name || hotelId;

  const sellMutation = useMutation({
    mutationFn: async () => {
      let customerId = selectedCustomerId;

      // Create new client if needed
      if (showNewClient && !customerId) {
        if (!newFirstName || !newPhone) {
          throw new Error("Prenom et telephone requis");
        }
        const { data: newCustomer, error: customerError } = await supabase
          .from("customers")
          .insert({
            first_name: newFirstName,
            last_name: newLastName || null,
            phone: newPhone,
            email: newEmail || null,
          })
          .select("id")
          .single();
        if (customerError) throw customerError;
        customerId = newCustomer.id;
      }

      if (!customerId || !selectedBundleId || !selectedBundle) {
        throw new Error("Selectionnez un modele et un client");
      }

      // Call RPC to create customer bundle
      const { data, error } = await supabase.rpc("create_customer_bundle", {
        _customer_id: customerId,
        _bundle_id: selectedBundleId,
        _hotel_id: selectedBundle.hotel_id,
      });

      if (error) throw error;

      // Update with extra fields (notes, payment_reference, sold_by, purchase_date)
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from("customer_treatment_bundles")
        .update({
          notes: notes || null,
          payment_reference: paymentReference || null,
          purchase_date: purchaseDate,
          sold_by: user?.id || null,
        })
        .eq("id", data);

      return data;
    },
    onSuccess: () => {
      toast.success(t("cures.sell.success"));
      queryClient.invalidateQueries({ queryKey: ["customer-treatment-bundles"] });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de la vente");
    },
  });

  const resetForm = () => {
    setSelectedBundleId("");
    setSelectedCustomerId(prefilledCustomerId || "");
    setCustomerSearch(prefilledCustomerName || "");
    setShowNewClient(false);
    setNewFirstName("");
    setNewLastName("");
    setNewPhone("");
    setNewEmail("");
    setPurchaseDate(new Date().toISOString().split("T")[0]);
    setPaymentReference("");
    setNotes("");
  };

  const selectCustomer = (customer: { id: string; first_name: string; last_name: string | null }) => {
    setSelectedCustomerId(customer.id);
    setCustomerSearch(`${customer.first_name} ${customer.last_name || ""}`.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cures.sell.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bundle selection */}
          <div className="space-y-1.5">
            <Label>{t("cures.sell.selectTemplate")}</Label>
            <Select value={selectedBundleId} onValueChange={setSelectedBundleId}>
              <SelectTrigger>
                <SelectValue placeholder={t("cures.sell.selectTemplate")} />
              </SelectTrigger>
              <SelectContent>
                {bundles?.map((bundle) => (
                  <SelectItem key={bundle.id} value={bundle.id}>
                    {bundle.name} — {hotelName(bundle.hotel_id)} ({bundle.total_sessions} seances)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Client search */}
          {!prefilledCustomerId && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("cures.sell.searchClient")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => {
                    setShowNewClient(!showNewClient);
                    setSelectedCustomerId("");
                    setCustomerSearch("");
                  }}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  {showNewClient ? "Rechercher" : t("cures.sell.newClient")}
                </Button>
              </div>

              {showNewClient ? (
                <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Prenom *</Label>
                      <Input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Nom</Label>
                      <Input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Telephone *</Label>
                    <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="mt-1" />
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      if (selectedCustomerId) setSelectedCustomerId("");
                    }}
                    placeholder="Nom ou telephone..."
                    className="pl-9"
                  />
                  {/* Dropdown results */}
                  {customers && customers.length > 0 && !selectedCustomerId && (
                    <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                      {customers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                          onClick={() => selectCustomer(c)}
                        >
                          <span className="font-medium">{c.first_name} {c.last_name}</span>
                          <span className="text-muted-foreground ml-2">{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Purchase date */}
          <div className="space-y-1.5">
            <Label>{t("cures.purchaseDate")}</Label>
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>

          {/* Payment reference */}
          <div className="space-y-1.5">
            <Label>{t("cures.paymentReference")}</Label>
            <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="ex: CB-1234" />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => sellMutation.mutate()}
            disabled={sellMutation.isPending || !selectedBundleId || (!selectedCustomerId && !showNewClient)}
          >
            {sellMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("cures.sell.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
