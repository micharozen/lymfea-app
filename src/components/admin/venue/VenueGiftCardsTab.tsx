import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useFileUpload } from "@/hooks/useFileUpload";
import { CategorySelectField } from "@/components/admin/category/CategorySelectField";
import { formatPrice } from "@/lib/formatPrice";
import { cn } from "@/lib/utils";

type GiftCardBundleType = "gift_treatments" | "gift_amount";

interface GiftCardTemplate {
  id: string;
  hotel_id: string;
  bundle_type: GiftCardBundleType;
  title: string | null;
  title_en: string | null;
  name: string;
  name_en: string | null;
  description: string | null;
  cover_image_url: string | null;
  price: number;
  currency: string | null;
  total_sessions: number | null;
  amount_cents: number | null;
  validity_days: number | null;
  status: string;
  display_on_client_flow: boolean;
  created_at: string;
}

interface CustomerGiftCard {
  id: string;
  bundle_id: string;
  hotel_id: string;
  is_gift: boolean;
  gift_delivery_mode: "email" | "print" | null;
  sender_name: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  redemption_code: string | null;
  delivered_at: string | null;
  claimed_at: string | null;
  total_sessions: number | null;
  used_sessions: number;
  total_amount_cents: number | null;
  used_amount_cents: number;
  expires_at: string;
  status: string;
  created_at: string;
  treatment_bundles:
    | {
        title: string | null;
        name: string;
        bundle_type: GiftCardBundleType | "cure";
      }
    | null;
  customers: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

interface TreatmentForBundle {
  id: string;
  name: string;
  category: string | null;
}

interface VenueGiftCardsTabProps {
  hotelId?: string;
}

const formSchema = z
  .object({
    bundle_type: z.enum(["gift_treatments", "gift_amount"]),
    title: z.string().min(1, "Le titre est requis"),
    title_en: z.string().optional(),
    description: z.string().optional(),
    cover_image_url: z.string().optional(),
    category: z.string().min(1, "La catégorie est requise"),
    price_eur: z.coerce.number().min(0, "Le prix doit être positif"),
    total_sessions: z.coerce.number().int().min(1).optional(),
    amount_eur: z.coerce.number().min(1).optional(),
    validity_days: z.coerce.number().int().min(1).default(365),
    status: z.enum(["active", "inactive"]).default("active"),
    display_on_client_flow: z.boolean().default(true),
    eligible_treatment_ids: z.array(z.string()).default([]),
  })
  .superRefine((values, ctx) => {
    if (values.bundle_type === "gift_treatments") {
      if (!values.total_sessions || values.total_sessions < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["total_sessions"],
          message: "Nombre de séances requis",
        });
      }
      if (values.eligible_treatment_ids.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["eligible_treatment_ids"],
          message: "Sélectionnez au moins un soin éligible",
        });
      }
    }
    if (values.bundle_type === "gift_amount") {
      if (!values.amount_eur || values.amount_eur < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["amount_eur"],
          message: "Montant requis",
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

const defaultFormValues: FormValues = {
  bundle_type: "gift_amount",
  title: "",
  title_en: "",
  description: "",
  cover_image_url: "",
  category: "",
  price_eur: 0,
  total_sessions: undefined,
  amount_eur: undefined,
  validity_days: 365,
  status: "active",
  display_on_client_flow: true,
  eligible_treatment_ids: [],
};

export function VenueGiftCardsTab({ hotelId }: VenueGiftCardsTabProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  const isStandalone = !hotelId;
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [activeSubTab, setActiveSubTab] = useState<"templates" | "sales">("templates");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogHotelId, setDialogHotelId] = useState<string | undefined>(undefined);
  const [editingTemplate, setEditingTemplate] = useState<GiftCardTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const effectiveHotelId = hotelId ?? (hotelFilter !== "all" ? hotelFilter : undefined);
  const dialogEffectiveHotelId = hotelId ?? dialogHotelId;

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name, image")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: isStandalone,
  });

  const templatesQueryKey = useMemo(() => ["gift-card-templates", hotelId ?? hotelFilter], [hotelId, hotelFilter]);
  const salesQueryKey = useMemo(() => ["gift-card-sales", hotelId ?? hotelFilter], [hotelId, hotelFilter]);
  const treatmentsQueryKey = useMemo(() => ["gift-card-eligible-treatments", dialogEffectiveHotelId], [dialogEffectiveHotelId]);

  const { data: templates, isLoading: templatesLoading } = useQuery<GiftCardTemplate[]>({
    queryKey: templatesQueryKey,
    queryFn: async () => {
      let query = supabase
        .from("treatment_bundles")
        .select("*")
        .in("bundle_type", ["gift_treatments", "gift_amount"])
        .order("created_at", { ascending: false });
      if (hotelId) {
        query = query.eq("hotel_id", hotelId);
      } else if (hotelFilter !== "all") {
        query = query.eq("hotel_id", hotelFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as GiftCardTemplate[];
    },
  });

  const { data: sales, isLoading: salesLoading } = useQuery<CustomerGiftCard[]>({
    queryKey: salesQueryKey,
    queryFn: async () => {
      let query = supabase
        .from("customer_treatment_bundles")
        .select(
          `id, bundle_id, hotel_id, is_gift, gift_delivery_mode, sender_name, recipient_name, recipient_email, redemption_code, delivered_at, claimed_at, total_sessions, used_sessions, total_amount_cents, used_amount_cents, expires_at, status, created_at,
          treatment_bundles:bundle_id!inner(title, name, bundle_type),
          customers:customer_id(first_name, last_name, email)`,
        )
        .in("treatment_bundles.bundle_type", ["gift_treatments", "gift_amount"])
        .order("created_at", { ascending: false });
      if (hotelId) {
        query = query.eq("hotel_id", hotelId);
      } else if (hotelFilter !== "all") {
        query = query.eq("hotel_id", hotelFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as CustomerGiftCard[];
    },
  });

  const { data: treatments } = useQuery<TreatmentForBundle[]>({
    queryKey: treatmentsQueryKey,
    queryFn: async () => {
      if (!dialogEffectiveHotelId) return [];
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("id, name, category")
        .eq("hotel_id", dialogEffectiveHotelId)
        .eq("status", "active")
        .is("is_bundle", false)
        .order("category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as TreatmentForBundle[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
  });

  const watchedType = form.watch("bundle_type");
  const watchedCoverUrl = form.watch("cover_image_url");

  const { uploading, fileInputRef, handleUpload, triggerFileSelect } = useFileUpload({
    bucket: "avatars",
    path: `gift-cards/${dialogEffectiveHotelId ?? "general"}`,
    initialUrl: watchedCoverUrl || "",
    onSuccess: (uploadedUrl) => form.setValue("cover_image_url", uploadedUrl, { shouldDirty: true }),
  });

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setDialogHotelId(effectiveHotelId);
    form.reset(defaultFormValues);
    setDialogOpen(true);
  };

  const handleOpenEdit = async (template: GiftCardTemplate) => {
    setEditingTemplate(template);
    setDialogHotelId(template.hotel_id);
    const [itemsResult, menuResult] = await Promise.all([
      supabase
        .from("treatment_bundle_items")
        .select("treatment_id")
        .eq("bundle_id", template.id),
      supabase
        .from("treatment_menus")
        .select("category")
        .eq("bundle_id", template.id)
        .maybeSingle(),
    ]);

    form.reset({
      bundle_type: template.bundle_type,
      title: template.title || template.name || "",
      title_en: template.title_en || "",
      description: template.description || "",
      cover_image_url: template.cover_image_url || "",
      category: menuResult.data?.category || "",
      price_eur: Number(template.price ?? 0),
      total_sessions: template.total_sessions ?? undefined,
      amount_eur: template.amount_cents != null ? template.amount_cents / 100 : undefined,
      validity_days: template.validity_days ?? 365,
      status: (template.status === "inactive" ? "inactive" : "active"),
      display_on_client_flow: template.display_on_client_flow,
      eligible_treatment_ids: itemsResult.data?.map((i) => i.treatment_id) ?? [],
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const isGiftAmount = values.bundle_type === "gift_amount";
      const bundlePayload = {
        hotel_id: dialogEffectiveHotelId!,
        bundle_type: values.bundle_type,
        name: values.title,
        name_en: values.title_en || null,
        title: values.title,
        title_en: values.title_en || null,
        description: values.description || null,
        cover_image_url: values.cover_image_url || null,
        price: values.price_eur,
        currency: "EUR",
        total_sessions: isGiftAmount ? null : values.total_sessions ?? null,
        amount_cents: isGiftAmount ? Math.round((values.amount_eur ?? 0) * 100) : null,
        validity_days: values.validity_days,
        status: values.status,
        display_on_client_flow: values.display_on_client_flow,
      };

      let bundleId: string;
      if (editingTemplate) {
        const { error } = await supabase
          .from("treatment_bundles")
          .update(bundlePayload)
          .eq("id", editingTemplate.id);
        if (error) throw error;
        bundleId = editingTemplate.id;
      } else {
        const { data, error } = await supabase
          .from("treatment_bundles")
          .insert(bundlePayload)
          .select("id")
          .single();
        if (error) throw error;
        bundleId = data.id;
      }

      // Sync eligible treatments (gift_treatments only — clear on gift_amount)
      await supabase.from("treatment_bundle_items").delete().eq("bundle_id", bundleId);
      if (values.bundle_type === "gift_treatments" && values.eligible_treatment_ids.length > 0) {
        const { error: itemsError } = await supabase
          .from("treatment_bundle_items")
          .insert(
            values.eligible_treatment_ids.map((treatmentId) => ({
              bundle_id: bundleId,
              treatment_id: treatmentId,
            })),
          );
        if (itemsError) throw itemsError;
      }

      // Mirror row in treatment_menus so the client flow can surface the card.
      // Pattern borrowed from CureTemplateDetail.
      const existingMenu = await supabase
        .from("treatment_menus")
        .select("id")
        .eq("bundle_id", bundleId)
        .maybeSingle();

      const menuPayload = {
        hotel_id: dialogEffectiveHotelId!,
        name: values.title,
        name_en: values.title_en || null,
        description: values.description || null,
        price: values.price_eur,
        duration: 0,
        status: values.status,
        is_bundle: true,
        bundle_id: bundleId,
        category: values.category,
      };

      if (existingMenu.data) {
        const { error } = await supabase
          .from("treatment_menus")
          .update(menuPayload)
          .eq("id", existingMenu.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("treatment_menus")
          .insert({ ...menuPayload, service_for: "Both" });
        if (error) throw error;
      }

      return bundleId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templatesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["treatment-menus"] });
      toast.success(
        editingTemplate
          ? t("giftCards.toast.updated", "Carte cadeau mise à jour")
          : t("giftCards.toast.created", "Carte cadeau créée"),
      );
      setDialogOpen(false);
      setEditingTemplate(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || t("giftCards.toast.saveError", "Erreur lors de l'enregistrement"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (bundleId: string) => {
      const { error } = await supabase.from("treatment_bundles").delete().eq("id", bundleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templatesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["treatment-menus"] });
      toast.success(t("giftCards.toast.deleted", "Carte cadeau supprimée"));
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || t("giftCards.toast.deleteError", "Erreur lors de la suppression"));
    },
  });

  const handleSubmit = form.handleSubmit((values) => saveMutation.mutate(values));

  const treatmentsByCategory = useMemo(() => {
    const groups: Record<string, TreatmentForBundle[]> = {};
    for (const treatment of treatments ?? []) {
      const key = treatment.category ?? "—";
      if (!groups[key]) groups[key] = [];
      groups[key].push(treatment);
    }
    return groups;
  }, [treatments]);

  const renderTemplateTypeBadge = (type: GiftCardBundleType) => (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px] px-2 py-0.5",
        type === "gift_amount"
          ? "bg-blue-500/10 text-blue-700"
          : "bg-purple-500/10 text-purple-700",
      )}
    >
      {type === "gift_amount"
        ? t("giftCards.type.amount", "Montant")
        : t("giftCards.type.treatments", "Soins offerts")}
    </Badge>
  );

  const renderStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-green-500/10 text-green-700",
      inactive: "bg-gray-500/10 text-gray-700",
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

  const renderBalance = (sale: CustomerGiftCard): string => {
    const type = sale.treatment_bundles?.bundle_type;
    if (type === "gift_amount") {
      const total = sale.total_amount_cents ?? 0;
      const used = sale.used_amount_cents ?? 0;
      return `${formatPrice((total - used) / 100, "EUR", { decimals: 0 })} / ${formatPrice(total / 100, "EUR", { decimals: 0 })}`;
    }
    if (sale.total_sessions != null) {
      return `${sale.total_sessions - sale.used_sessions}/${sale.total_sessions}`;
    }
    return "-";
  };

  return (
    <div className="space-y-4">
      {!isStandalone && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Gift className="h-5 w-5" />
              {t("giftCards.title", "Cartes cadeaux")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "giftCards.description",
                "Créez des cartes cadeaux offrant des soins ou un montant, utilisables sur ce lieu.",
              )}
            </p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t("giftCards.create", "Créer une carte cadeau")}
          </Button>
        </div>
      )}

      {isStandalone && (
        <div className="flex flex-wrap items-center gap-3">
          <Select value={hotelFilter} onValueChange={setHotelFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Tous les lieux" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les lieux</SelectItem>
              {hotels?.map((hotel) => (
                <SelectItem key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t("giftCards.create", "Créer une carte cadeau")}
          </Button>
        </div>
      )}

      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as "templates" | "sales")}>
        <TabsList>
          <TabsTrigger value="templates">{t("giftCards.tabs.templates", "Modèles")}</TabsTrigger>
          <TabsTrigger value="sales">{t("giftCards.tabs.sales", "Ventes")}</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          {templatesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !templates || templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Gift className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <h3 className="text-sm font-medium">
                  {t("giftCards.empty.templates", "Aucune carte cadeau configurée")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    "giftCards.empty.templatesHint",
                    "Cliquez sur Créer une carte cadeau pour démarrer.",
                  )}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[56px]" />
                    <TableHead>{t("giftCards.columns.title", "Titre")}</TableHead>
                    {isStandalone && <TableHead>Lieu</TableHead>}
                    <TableHead>{t("giftCards.columns.type", "Type")}</TableHead>
                    <TableHead className="text-right">
                      {t("giftCards.columns.value", "Valeur")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("giftCards.columns.price", "Prix de vente")}
                    </TableHead>
                    <TableHead className="text-center">
                      {t("giftCards.columns.displayed", "Affichée")}
                    </TableHead>
                    <TableHead className="text-center">
                      {t("giftCards.columns.status", "Statut")}
                    </TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        {template.cover_image_url ? (
                          <img
                            src={template.cover_image_url}
                            alt=""
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                            <Gift className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{template.title || template.name}</div>
                        {template.title_en && (
                          <div className="text-xs text-muted-foreground">{template.title_en}</div>
                        )}
                      </TableCell>
                      {isStandalone && (
                        <TableCell className="text-sm">
                          {hotels?.find((h) => h.id === template.hotel_id)?.name ?? "—"}
                        </TableCell>
                      )}
                      <TableCell>{renderTemplateTypeBadge(template.bundle_type)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {template.bundle_type === "gift_amount" && template.amount_cents != null
                          ? formatPrice(template.amount_cents / 100, "EUR", { decimals: 0 })
                          : template.total_sessions != null
                            ? t("giftCards.sessionsValue", "{{count}} séances", {
                                count: template.total_sessions,
                              })
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatPrice(Number(template.price ?? 0), template.currency ?? "EUR", { decimals: 0 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {template.display_on_client_flow ? (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-700 text-[10px]">
                            {t("giftCards.displayed.yes", "Oui")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-gray-500/10 text-gray-700 text-[10px]">
                            {t("giftCards.displayed.no", "Non")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{renderStatusBadge(template.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenEdit(template)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDeletingId(template.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          {salesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !sales || sales.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Gift className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <h3 className="text-sm font-medium">
                  {t("giftCards.empty.sales", "Aucune carte cadeau vendue")}
                </h3>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("giftCards.columns.template", "Carte")}</TableHead>
                    {isStandalone && <TableHead>Lieu</TableHead>}
                    <TableHead>{t("giftCards.columns.buyer", "Acheteur")}</TableHead>
                    <TableHead>{t("giftCards.columns.recipient", "Destinataire")}</TableHead>
                    <TableHead>{t("giftCards.columns.code", "Code")}</TableHead>
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
                  {sales.map((sale) => {
                    const buyer = sale.customers
                      ? `${sale.customers.first_name ?? ""} ${sale.customers.last_name ?? ""}`.trim() ||
                        sale.customers.email ||
                        "—"
                      : sale.sender_name || "—";
                    const recipient = sale.is_gift
                      ? sale.recipient_name || sale.recipient_email ||
                        (sale.gift_delivery_mode === "print"
                          ? t("giftCards.print", "Impression")
                          : "—")
                      : t("giftCards.selfPurchase", "Pour soi-même");
                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="text-sm">
                          {sale.treatment_bundles?.title || sale.treatment_bundles?.name || "—"}
                        </TableCell>
                        {isStandalone && (
                          <TableCell className="text-sm">
                            {hotels?.find((h) => h.id === sale.hotel_id)?.name ?? "—"}
                          </TableCell>
                        )}
                        <TableCell className="text-sm">{buyer}</TableCell>
                        <TableCell className="text-sm">{recipient}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {sale.redemption_code ?? "—"}
                        </TableCell>
                        <TableCell className="text-center text-sm">{renderBalance(sale)}</TableCell>
                        <TableCell className="text-center text-sm">
                          {new Date(sale.expires_at).toLocaleDateString("fr-FR")}
                        </TableCell>
                        <TableCell className="text-center">{renderStatusBadge(sale.status)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate
                ? t("giftCards.dialog.editTitle", "Modifier la carte cadeau")
                : t("giftCards.dialog.createTitle", "Nouvelle carte cadeau")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "giftCards.dialog.description",
                "Choisissez le type et les détails. La carte sera visible dans le flux client selon vos options.",
              )}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isStandalone && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lieu</label>
                  <Select
                    value={dialogHotelId ?? ""}
                    onValueChange={(v) => {
                      setDialogHotelId(v);
                      form.setValue("category", "");
                      form.setValue("eligible_treatment_ids", []);
                    }}
                    disabled={!!editingTemplate}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un lieu" />
                    </SelectTrigger>
                    <SelectContent>
                      {hotels?.map((hotel) => (
                        <SelectItem key={hotel.id} value={hotel.id}>
                          {hotel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <FormField
                control={form.control}
                name="bundle_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("giftCards.form.type", "Type")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!!editingTemplate}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="gift_amount">
                          {t("giftCards.type.amount", "Montant")}
                        </SelectItem>
                        <SelectItem value="gift_treatments">
                          {t("giftCards.type.treatments", "Soins offerts")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {editingTemplate && (
                      <FormDescription>
                        {t(
                          "giftCards.form.typeLocked",
                          "Le type ne peut pas être changé après création.",
                        )}
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giftCards.form.title", "Titre")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Escapade Bien-être" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="title_en"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giftCards.form.titleEn", "Titre (EN)")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Wellness Escape" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("giftCards.form.description", "Description")}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("giftCards.form.category", "Catégorie")}</FormLabel>
                    <FormControl>
                      <CategorySelectField
                        hotelId={dialogEffectiveHotelId!}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t(
                          "giftCards.form.categoryPlaceholder",
                          "Choisir une catégorie",
                        )}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        "giftCards.form.categoryHint",
                        "La carte cadeau sera regroupée dans cette catégorie côté client.",
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cover_image_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("giftCards.form.cover", "Image de la carte")}</FormLabel>
                    <div className="flex items-center gap-3">
                      {field.value ? (
                        <img
                          src={field.value}
                          alt=""
                          className="h-20 w-20 rounded object-cover"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded bg-muted flex items-center justify-center">
                          <Gift className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="https://..."
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={triggerFileSelect}
                            disabled={uploading}
                          >
                            {uploading ? (
                              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            ) : (
                              <Upload className="h-3 w-3 mr-2" />
                            )}
                            {t("giftCards.form.upload", "Téléverser")}
                          </Button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleUpload}
                          />
                        </div>
                      </div>
                    </div>
                    <FormDescription>
                      {t(
                        "giftCards.form.coverHint",
                        "Visuel affiché côté client et intégré dans l'email au destinataire.",
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchedType === "gift_amount" ? (
                <FormField
                  control={form.control}
                  name="amount_eur"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giftCards.form.amount", "Valeur de la carte (€)")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.value === "" ? undefined : Number(e.target.value);
                            field.onChange(v);
                            if (v != null) form.setValue("price_eur", v, { shouldDirty: true });
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          "giftCards.form.amountHint",
                          "Montant crédité à l'achat. Le client peut l'utiliser partiellement.",
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="total_sessions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giftCards.form.sessions", "Nombre de séances")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price_eur"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giftCards.form.price", "Prix de vente (€)")}</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step={1} {...field} />
                      </FormControl>
                      <FormDescription>
                        {watchedType === "gift_amount"
                          ? t(
                              "giftCards.form.priceAmountHint",
                              "Égal à la valeur par défaut. Modifiable pour offrir une remise.",
                            )
                          : t(
                              "giftCards.form.priceTreatmentsHint",
                              "Montant facturé à l'acheteur.",
                            )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="validity_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giftCards.form.validity", "Validité (jours)")}</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} step={1} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {watchedType === "gift_treatments" && (
                <FormField
                  control={form.control}
                  name="eligible_treatment_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giftCards.form.eligibleTreatments", "Soins éligibles")}</FormLabel>
                      <div className="space-y-3 max-h-48 overflow-y-auto rounded border p-3">
                        {Object.keys(treatmentsByCategory).length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t(
                              "giftCards.form.noTreatments",
                              "Aucun soin actif disponible sur ce lieu.",
                            )}
                          </p>
                        ) : (
                          Object.entries(treatmentsByCategory).map(([category, items]) => (
                            <div key={category}>
                              <div className="text-xs font-semibold text-muted-foreground mb-1">
                                {category}
                              </div>
                              <div className="space-y-1 pl-1">
                                {items.map((treatment) => {
                                  const checked = field.value.includes(treatment.id);
                                  return (
                                    <label
                                      key={treatment.id}
                                      className="flex items-center gap-2 text-sm cursor-pointer"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(v) => {
                                          if (v) field.onChange([...field.value, treatment.id]);
                                          else
                                            field.onChange(
                                              field.value.filter((id) => id !== treatment.id),
                                            );
                                        }}
                                      />
                                      {treatment.name}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="display_on_client_flow"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded border p-3">
                      <div>
                        <FormLabel className="text-sm">
                          {t("giftCards.form.displayOnClientFlow", "Afficher côté client")}
                        </FormLabel>
                        <FormDescription className="text-xs">
                          {t(
                            "giftCards.form.displayHint",
                            "Rend la carte visible dans le flux de réservation public.",
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("giftCards.form.status", "Statut")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">
                            {t("giftCards.status.active", "Actif")}
                          </SelectItem>
                          <SelectItem value="inactive">
                            {t("giftCards.status.inactive", "Inactif")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={saveMutation.isPending}
                >
                  {t("common.cancel", "Annuler")}
                </Button>
                <Button type="submit" disabled={saveMutation.isPending || !dialogEffectiveHotelId}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingTemplate
                    ? t("giftCards.form.save", "Enregistrer")
                    : t("giftCards.form.create", "Créer")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("giftCards.delete.title", "Supprimer cette carte cadeau ?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "giftCards.delete.description",
                "Cette action est définitive. Les ventes passées ne seront pas affectées.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
            >
              {t("common.delete", "Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
