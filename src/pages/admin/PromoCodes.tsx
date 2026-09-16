import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Search, Pencil, Trash2, BadgePercent } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useOrgScope } from "@/hooks/useOrgScope";
import {
  hotelKeys,
  promoCodeKeys,
  listHotelsForOrg,
  listPromoCodesForOrg,
  resolveHotelIdsForOrg,
  type PromoCodeWithStats,
} from "@shared/db";
import { formatPrice } from "@/lib/formatPrice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { HotelCell } from "@/components/table/EntityCell";
import { TablePagination } from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { SortableTableHead } from "@/components/table/SortableTableHead";
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
import { useLayoutCalculation } from "@/hooks/useLayoutCalculation";
import { useOverflowControl } from "@/hooks/useOverflowControl";
import { usePagination } from "@/hooks/usePagination";
import { useDialogState } from "@/hooks/useDialogState";
import { useTableSort } from "@/hooks/useTableSort";
import { PromoCodeDialog } from "@/components/admin/PromoCodeDialog";
import { PromoCodeRedemptionsDialog } from "@/components/admin/PromoCodeRedemptionsDialog";

/** Un code est périmé dès que sa fenêtre de validité est passée. */
function isExpired(promo: PromoCodeWithStats): boolean {
  return !!promo.valid_until && new Date(promo.valid_until) < new Date();
}

function isExhausted(promo: PromoCodeWithStats): boolean {
  return promo.max_redemptions !== null && promo.redemption_count >= promo.max_redemptions;
}

export default function PromoCodes() {
  const { t } = useTranslation(['admin', 'common']);
  const { isAdmin } = useUser();
  const queryClient = useQueryClient();
  const scope = useOrgScope();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hotelFilter, setHotelFilter] = useState("all");
  const [editing, setEditing] = useState<PromoCodeWithStats | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewingRedemptions, setViewingRedemptions] = useState<PromoCodeWithStats | null>(null);

  const { headerRef, filtersRef, itemsPerPage } = useLayoutCalculation();
  const { deleteId, openDelete, closeDelete } = useDialogState<string>();
  const { toggleSort, getSortDirection, sortItems } = useTableSort<string>();

  const { data: promoCodes, isLoading } = useQuery({
    queryKey: promoCodeKeys.list(scope),
    enabled: !!scope,
    queryFn: () => listPromoCodesForOrg(supabase, scope!),
  });

  const { data: hotels } = useQuery({
    queryKey: hotelKeys.list(scope),
    enabled: !!scope,
    queryFn: () => listHotelsForOrg(supabase, scope!),
  });

  // Catalogue de l'organisation, pour choisir l'assiette du code.
  const { data: treatments } = useQuery({
    queryKey: [...promoCodeKeys.forOrg(scope), "treatments"],
    enabled: !!scope && isFormOpen,
    queryFn: async () => {
      const hotelIds = await resolveHotelIdsForOrg(supabase, scope!);
      let q = supabase
        .from("treatment_menus")
        .select("id, name, hotel_id")
        .order("name");
      if (hotelIds !== null) {
        if (hotelIds.length === 0) return [];
        q = q.in("hotel_id", hotelIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promo_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promoCodeKeys.all });
      toast.success(t('promoCodesPage.deleted'));
      closeDelete();
    },
    onError: () => toast.error(t('promoCodesPage.deleteError')),
  });

  const filtered = (promoCodes ?? []).filter((promo) => {
    const search = searchQuery.trim().toLowerCase();
    const matchesSearch = !search
      || promo.code.toLowerCase().includes(search)
      || (promo.description ?? "").toLowerCase().includes(search);

    const status = !promo.is_active
      ? "inactive"
      : isExpired(promo) || isExhausted(promo)
        ? "expired"
        : "active";
    const matchesStatus = statusFilter === "all" || statusFilter === status;

    // Un code « tous lieux » reste visible quel que soit le lieu filtré : il s'y applique.
    const matchesHotel = hotelFilter === "all"
      || promo.hotel_id === null
      || promo.hotel_id === hotelFilter;

    return matchesSearch && matchesStatus && matchesHotel;
  });

  const sorted = useMemo(
    () => sortItems(filtered, (promo, column) => {
      switch (column) {
        case "code": return promo.code;
        case "redemptions": return promo.redemptions;
        case "discount": return promo.total_discount_cents;
        default: return null;
      }
    }),
    [filtered, sortItems],
  );

  const { currentPage, setCurrentPage, totalPages, paginatedItems, needsPagination } = usePagination({
    items: sorted,
    itemsPerPage,
  });

  useOverflowControl(!isLoading && needsPagination);

  const getHotel = (hotelId: string | null) => hotels?.find((h) => h.id === hotelId);

  const formatDiscount = (promo: PromoCodeWithStats) =>
    promo.discount_type === "percentage"
      ? `−${Number(promo.discount_value)} %`
      : `−${formatPrice(Number(promo.discount_value), "EUR")}`;

  const formatValidity = (promo: PromoCodeWithStats) => {
    const from = promo.valid_from ? new Date(promo.valid_from).toLocaleDateString() : null;
    const until = promo.valid_until ? new Date(promo.valid_until).toLocaleDateString() : null;
    if (!from && !until) return t('promoCodesPage.alwaysValid');
    if (from && until) return `${from} → ${until}`;
    return until ? `→ ${until}` : `${from} →`;
  };

  const columnCount = isAdmin ? 8 : 7;

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6" ref={headerRef}>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-medium text-foreground flex items-center gap-2">
            {t('promoCodesPage.title')}
          </h1>
          {isAdmin && (
            <Button onClick={() => { setEditing(null); setIsFormOpen(true); }}>
              {t('promoCodesPage.new')}
            </Button>
          )}
        </div>
      </div>

      <div className={cn("flex-1 px-4 md:px-6 pb-4 md:pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          <div ref={filtersRef} className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('promoCodesPage.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <SelectField
              className="w-[180px]"
              searchable={false}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: t('promoCodesPage.allStatuses') },
                { value: "active", label: t('promoCodesPage.active') },
                { value: "inactive", label: t('promoCodesPage.inactive') },
                { value: "expired", label: t('promoCodesPage.expired') },
              ]}
            />

            {isAdmin && (
              <SelectField
                className="w-[200px]"
                value={hotelFilter}
                onChange={setHotelFilter}
                options={[
                  { value: "all", label: t('promoCodesPage.allVenues') },
                  ...(hotels ?? []).map((h) => ({ value: h.id, label: h.name })),
                ]}
              />
            )}
          </div>

          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            <div className="overflow-x-auto h-full">
              <Table className="text-sm w-full table-fixed min-w-[1050px]">
                <TableHeader>
                  <TableRow className="bg-muted/20 h-8">
                    {/* Le code et son statut tiennent sur une ligne : sans largeur
                        explicite, table-fixed rogne l'un ou l'autre. */}
                    <SortableTableHead column="code" sortDirection={getSortDirection("code")} onSort={toggleSort} className="w-[220px]">
                      {t('promoCodesPage.colCode')}
                    </SortableTableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">
                      {t('promoCodesPage.colDiscountType')}
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">
                      {t('promoCodesPage.colTreatments')}
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">
                      {t('promoCodesPage.colVenue')}
                    </TableHead>
                    <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate w-[190px]">
                      {t('promoCodesPage.colValidity')}
                    </TableHead>
                    <SortableTableHead column="redemptions" sortDirection={getSortDirection("redemptions")} onSort={toggleSort}>
                      {t('promoCodesPage.colRedemptions')}
                    </SortableTableHead>
                    <SortableTableHead column="discount" sortDirection={getSortDirection("discount")} onSort={toggleSort}>
                      {t('promoCodesPage.colTotalDiscount')}
                    </SortableTableHead>
                    {isAdmin && (
                      <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right">
                        Actions
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>

                {isLoading ? (
                  <TableSkeleton rows={itemsPerPage} columns={columnCount} />
                ) : paginatedItems.length === 0 ? (
                  <TableEmptyState
                    colSpan={columnCount}
                    icon={BadgePercent}
                    message={t('promoCodesPage.empty')}
                    description={searchQuery || hotelFilter !== "all" || statusFilter !== "all"
                      ? t('promoCodesPage.emptyHint')
                      : undefined}
                    actionLabel={isAdmin ? t('promoCodesPage.addCode') : undefined}
                    onAction={isAdmin ? () => { setEditing(null); setIsFormOpen(true); } : undefined}
                  />
                ) : (
                  <TableBody>
                    {paginatedItems.map((promo) => (
                      <TableRow
                        key={promo.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10"
                        onClick={() => setViewingRedemptions(promo)}
                      >
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          {/* justify-between : le badge se cale à droite de la colonne, donc tous
    les statuts s'alignent quelle que soit la longueur du code. */}
                          <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                            <span className="font-mono font-medium truncate">{promo.code}</span>
                            {!promo.is_active ? (
                              <StatusBadge status="inactive" type="entity" className="text-[10px] px-2 py-0.5 shrink-0" />
                            ) : isExpired(promo) || isExhausted(promo) ? (
                              // 'expired' n'existe pas dans EntityStatus : on garde le style
                              // 'inactive' et on force un libellé traduit.
                              <StatusBadge
                                status="inactive"
                                type="entity"
                                customLabel={isExhausted(promo)
                                  ? t('promoCodesPage.exhausted')
                                  : t('promoCodesPage.expired')}
                                className="text-[10px] px-2 py-0.5 shrink-0"
                              />
                            ) : (
                              <StatusBadge status="active" type="entity" className="text-[10px] px-2 py-0.5 shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 whitespace-nowrap truncate">
                          {formatDiscount(promo)}
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 truncate text-muted-foreground">
                          {promo.treatment_ids.length === 0
                            ? t('promoCodesPage.allTreatments')
                            : t('promoCodesPage.nTreatments', { count: promo.treatment_ids.length })}
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          {promo.hotel_id
                            ? <HotelCell hotel={getHotel(promo.hotel_id)} />
                            : <span className="text-muted-foreground">{t('promoCodesPage.allVenuesShort')}</span>}
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 whitespace-nowrap truncate text-muted-foreground">
                          {formatValidity(promo)}
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 whitespace-nowrap truncate">
                          {promo.redemptions}
                          {promo.max_redemptions !== null && (
                            <span className="text-muted-foreground"> / {promo.max_redemptions}</span>
                          )}
                          {promo.max_per_customer !== null && (
                            <span className="text-muted-foreground text-xs ml-1.5">
                              ({t('promoCodesPage.perCustomer', { count: promo.max_per_customer })})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-0 px-2 h-10 max-h-10 whitespace-nowrap truncate font-medium">
                          {formatPrice(promo.total_discount_cents / 100, "EUR")}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="py-0 px-2 h-10 max-h-10 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={t('common:buttons.edit')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditing(promo);
                                  setIsFormOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                aria-label={t('common:buttons.delete')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDelete(promo.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                )}
              </Table>
            </div>
          </div>

          {needsPagination && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={sorted.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName={t('promoCodesPage.itemName')}
            />
          )}
        </div>
      </div>

      <PromoCodeDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        promoCode={editing}
        venues={hotels ?? []}
        treatments={treatments ?? []}
      />

      <PromoCodeRedemptionsDialog
        open={!!viewingRedemptions}
        onOpenChange={(open) => !open && setViewingRedemptions(null)}
        promoCodeId={viewingRedemptions?.id ?? null}
        promoCodeLabel={viewingRedemptions?.code ?? ""}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && closeDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('promoCodesPage.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('promoCodesPage.confirmDeleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {t('common:buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
