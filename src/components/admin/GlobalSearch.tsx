import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, UserRound, Loader2, ExternalLink, Eye, Pencil, CreditCard, Undo2, type LucideIcon } from "lucide-react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Command as CommandPrimitive } from "cmdk";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"; // FIX 1: Ajout du titre pour l'accessibilité
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/hooks/useUserContext";
import { getBookingStatusConfig, getEntityStatusConfig, getBookingPaymentDisplay } from "@/utils/statusStyles";
import EditBookingDialog from "@/components/EditBookingDialog";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import { RefundBookingDialog } from "@/components/admin/quick-actions/RefundBookingDialog";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

// Date "2026-06-30" → { day: "30", month: "juin" } pour la colonne gauche façon PWA
function splitBookingDate(date: string | null): { day: string; month: string } {
  if (!date) return { day: "—", month: "" };
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return { day: date, month: "" };
  return {
    day: parsed.toLocaleDateString(i18n.language, { day: "numeric" }),
    month: parsed.toLocaleDateString(i18n.language, { month: "short" }).replace(".", ""),
  };
}

// "Massage suédois · 60min, Soin visage" depuis les booking_treatments embarqués
function summarizeTreatments(bookingTreatments: any[] | null | undefined): string {
  return (bookingTreatments ?? [])
    .map((t) => {
      const name = t.treatment_menus?.name;
      if (!name) return "";
      return t.treatment_variants?.label ? `${name} · ${t.treatment_variants.label}` : name;
    })
    .filter(Boolean)
    .join(", ");
}

// Ouvre la fiche dans un nouvel onglet sans déclencher la sélection de la ligne
function OpenInNewTab({ path, label }: { path: string; label: string }) {
  return (
    <button
      type="button"
      className="gs-open"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(path, "_blank", "noopener,noreferrer");
      }}
    >
      <ExternalLink className="w-[15px] h-[15px]" />
    </button>
  );
}

// Pilule d'action dans la barre révélée au survol de la ligne
function ActionButton({
  icon: Icon,
  label,
  loading,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="gs-act"
      disabled={disabled}
      aria-busy={loading}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (disabled) return;
        onClick();
      }}
    >
      {loading ? (
        <Loader2 className="w-[13px] h-[13px] animate-spin" />
      ) : (
        <Icon className="w-[13px] h-[13px]" />
      )}
      {label}
    </button>
  );
}

// Pastille teintée à partir de la couleur du statut (tokens Saoma côté fond)
function Chip({ hex, children }: { hex: string; children: React.ReactNode }) {
  return (
    <span
      className="gs-chip"
      style={{ color: hex, background: `color-mix(in srgb, ${hex} 16%, transparent)` }}
    >
      {children}
    </span>
  );
}

// Hook personnalisé pour le Debounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// Colonnes suffisantes pour les actions de la ligne (édition, lien de
// paiement, remboursement) sans refetch au clic
const BOOKING_SEARCH_SELECT =
  "id, booking_id, booking_date, booking_time, hotel_id, hotel_name, client_first_name, client_last_name, client_email, phone, status, payment_status, payment_method, total_price, duration, guest_count, client_type, client_note, room_number, room_id, secondary_room_id, therapist_id, therapist_name, assigned_at, client_signature, signed_at, stripe_invoice_url, hotels(name, currency), treatment_rooms!bookings_trunk_id_fkey(name), booking_treatments(price_override, treatment_menus(name, price), treatment_variants(label, price))";

type BookingAction = "edit" | "payment" | "refund";

export interface GlobalSearchPick {
  id: string;
  booking_id?: number | null;
  booking_date?: string | null;
  hotel_id?: string | null;
  client_type?: string | null;
  client_first_name?: string | null;
  client_last_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export interface GlobalSearchProps {
  /**
   * Mode sélecteur : la palette est pilotée de l'extérieur et une ligne choisie
   * est renvoyée à l'appelant au lieu d'ouvrir la fiche. Permet de réutiliser la
   * recherche globale là où un combobox serait trop à l'étroit (panneau latéral
   * d'une tâche, par exemple) sans réimplémenter une seconde recherche.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPickBooking?: (booking: GlobalSearchPick) => void;
  onPickCustomer?: (customer: GlobalSearchPick) => void;
}

export function GlobalSearch({
  open: controlledOpen,
  onOpenChange,
  onPickBooking,
  onPickCustomer,
}: GlobalSearchProps = {}) {
  const isPicker = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isPicker ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (isPicker) onOpenChange?.(next);
    else setUncontrolledOpen(next);
  };
  const [search, setSearch] = useState("");
  // Action déclenchée depuis une ligne de résultat : la recherche se ferme et
  // le dialog correspondant s'ouvre par-dessus
  const [action, setAction] = useState<{ kind: BookingAction; booking: any } | null>(null);
  // Clé `${bookingId}:${action}` du bouton en cours de déclenchement
  const [pending, setPending] = useState<string | null>(null);
  // 450 ms : laisse le temps de finir un mot avant de partir en base
  const debouncedSearch = useDebounce(search, 450);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, userVenueIds } = useUserContext() as any;
  const { t } = useTranslation(["admin", "common"]);

  // Raccourci clavier Cmd+K ou Ctrl+K
  useEffect(() => {
    if (isPicker) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setUncontrolledOpen((previous) => !previous);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isPicker]);

  // Réinitialise la recherche à la fermeture
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // Recherche serveur — bookings + customers + therapists en une seule passe
  // Déclenchée uniquement quand le dialog est ouvert et ≥2 caractères tapés
   // 1. Recherche dynamique Côté Serveur
   const { data: searchResults, isFetching } = useQuery({
    queryKey: ["global-search", debouncedSearch],
    enabled: debouncedSearch.length >= 2 && open,
    // Garde les résultats précédents affichés pendant la frappe : évite le
    // clignotement « Recherche en cours » à chaque nouvelle requête
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const searchTerm = `%${debouncedSearch}%`;

      // Saisie composée uniquement de chiffres/séparateurs téléphoniques
      const isNumericQuery = /^\+?[\d\s.\-()]+$/.test(debouncedSearch);
      const digitCount = debouncedSearch.replace(/\D/g, "").length;
      // « 12 » = réservation #12, pas une recherche de sous-chaîne dans les
      // numéros de téléphone (sinon un 06 12 … remonte pour n'importe quoi).
      // Au-delà de 5 chiffres on considère qu'il s'agit d'un vrai numéro.
      const matchPhone = !isNumericQuery || digitCount > 5;
      const phoneMatch = matchPhone ? `,phone.ilike.${searchTerm}` : "";
      const bookingIdMatch = /^\d+$/.test(debouncedSearch)
        ? `,booking_id.eq.${debouncedSearch}`
        : "";

      const [custRes, therRes, bookRes, promoRes] = await Promise.all([
        supabase
          .from("customers")
          .select("*")
          .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm}${phoneMatch}`)
          .limit(5),
        supabase
          .from("therapists")
          .select("*")
          .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm}`)
          .limit(5),
        supabase
          .from("bookings")
          .select(BOOKING_SEARCH_SELECT)
          .or(`client_first_name.ilike.${searchTerm},client_last_name.ilike.${searchTerm},client_email.ilike.${searchTerm}${phoneMatch}${bookingIdMatch}`)
          .order("booking_date", { ascending: false })
          .limit(10),
        // Le code promo vit dans promo_codes : on résout d'abord les codes qui
        // correspondent à la saisie, puis les réservations qui les portent.
        supabase
          .from("promo_codes")
          .select("id")
          .ilike("code", searchTerm)
          .limit(10),
      ]);

      const promoIds = (promoRes.data ?? []).map((promo) => promo.id);
      const promoBookings = promoIds.length
        ? (
            await supabase
              .from("bookings")
              .select(BOOKING_SEARCH_SELECT)
              .in("promo_code_id", promoIds)
              .order("booking_date", { ascending: false })
              .limit(10)
          ).data ?? []
        : [];

      // Une réservation peut remonter des deux côtés (client ET code promo) :
      // on déduplique sur l'id avant d'afficher.
      const bookingsById = new Map<string, (typeof promoBookings)[number]>();
      for (const booking of [...(bookRes.data ?? []), ...promoBookings]) {
        bookingsById.set(booking.id, booking);
      }

      return {
        customers: custRes.data || [],
        therapists: therRes.data || [],
        // Tri global : les deux requêtes sont triées séparément, pas leur union.
        bookings: [...bookingsById.values()].sort((a, b) =>
          (b.booking_date ?? "").localeCompare(a.booking_date ?? ""),
        ),
      };
    },
  });

  const filteredBookings = (searchResults?.bookings || [])
    .filter((b: any) => isAdmin || userVenueIds?.includes(b.hotel_id))
    .slice(0, 5);

  // Frappe en cours (debounce non écoulé) ou requête en vol
  const isTyping = search.length >= 2 && (search !== debouncedSearch || isFetching);

  const onSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  // Le montage d'un dialog (ou la navigation) bloque le thread principal ;
  // on laisse le navigateur peindre le spinner avant de le déclencher
  const runAfterPaint = (fn: () => void) => {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  };

  const openBooking = (id: string, booking?: Partial<GlobalSearchPick>) => {
    if (onPickBooking) {
      onPickBooking({
        id,
        booking_id: booking?.booking_id ?? null,
        booking_date: booking?.booking_date ?? null,
        hotel_id: booking?.hotel_id ?? null,
        client_type: booking?.client_type ?? null,
        client_first_name: booking?.client_first_name ?? null,
        client_last_name: booking?.client_last_name ?? null,
      });
      setOpen(false);
      return;
    }
    setPending(`${id}:view`);
    runAfterPaint(() => {
      setPending(null);
      setOpen(false);
      // La recherche globale peut être ouverte depuis n'importe où : on force le
      // retour vers la liste des réservations plutôt que vers un historique ambigu.
      navigate(`/admin/bookings/${id}`, { state: { from: "/admin/bookings" } });
    });
  };

  const startAction = (kind: BookingAction, booking: any) => {
    setPending(`${booking.id}:${kind}`);
    runAfterPaint(() => {
      setPending(null);
      setOpen(false);
      setAction({ kind, booking });
    });
  };

  // Les dialogs de paiement/remboursement n'invalident rien eux-mêmes
  const afterAction = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    queryClient.invalidateQueries({ queryKey: ["global-search"] });
    setAction(null);
  };

  // Payload léger attendu par SendPaymentLinkDialog / RefundBookingDialog
  const toPaymentTarget = (b: any) => ({
    id: b.id,
    booking_id: b.booking_id ?? 0,
    client_first_name: b.client_first_name ?? "",
    client_last_name: b.client_last_name ?? "",
    client_email: b.client_email ?? undefined,
    phone: b.phone ?? undefined,
    room_number: b.room_number ?? undefined,
    booking_date: b.booking_date,
    booking_time: b.booking_time,
    total_price: b.total_price ?? 0,
    hotel_name: b.hotels?.name ?? b.hotel_name ?? undefined,
    currency: b.hotels?.currency ?? "EUR",
    treatments: (b.booking_treatments ?? [])
      .filter((t: any) => t.treatment_menus?.name)
      .map((t: any) => ({
        name: t.treatment_menus.name as string,
        price: t.price_override ?? t.treatment_variants?.price ?? t.treatment_menus?.price ?? 0,
      })),
  });

  // Payload attendu par EditBookingDialog
  const toEditTarget = (b: any) => ({
    ...b,
    hotel_name: b.hotel_name ?? b.hotels?.name ?? null,
    phone: b.phone ?? "",
    room_name: b.treatment_rooms?.name ?? null,
  });

  return (
    <>
      {!isPicker && (
      <div className="px-3 mb-2 group-data-[collapsible=icon]:px-0">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 text-sm text-muted-foreground bg-muted/60 rounded-full border border-border/70 hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 w-full transition-colors group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:justify-center"
          title={t("globalSearch.triggerTitle")}
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">
            {t("common:buttons.search")}
          </span>
          <kbd className="hidden lg:inline-flex h-5 select-none items-center rounded-full bg-background/70 px-2 font-mono text-[10px] font-medium ml-auto group-data-[collapsible=icon]:hidden">
            ⌘K
          </kbd>
        </button>
      </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="app-refonte gs-dialog max-w-xl">
          {/* FIX 1: Titre invisible pour stopper l'erreur d'accessibilité dans la console */}
          <DialogTitle className="sr-only">{t("globalSearch.title")}</DialogTitle>

          <Command shouldFilter={false} className="bg-transparent">
            <div className="gs-search">
              <Search className="w-[18px] h-[18px]" />
              <CommandPrimitive.Input
                autoFocus
                placeholder={t("globalSearch.placeholder")}
                value={search}
                onValueChange={setSearch}
              />
              {isTyping && <Loader2 className="gs-spin w-4 h-4 animate-spin" />}
            </div>

            <CommandList className={`gs-list${isTyping && searchResults ? " is-stale" : ""}`}>
              {search.length < 2 ? (
                <div className="gs-state">
                  <div className="t">{t("globalSearch.title")}</div>
                  <div className="s">{t("globalSearch.hint")}</div>
                </div>
              ) : !searchResults ? (
                <div className="gs-state">
                  <Loader2 className="w-5 h-5 mx-auto mb-3 animate-spin" />
                  <div className="s">{t("globalSearch.searching")}</div>
                </div>
              ) : (
                <>
                  {/* FIX 2: CommandEmpty doit toujours être là pour que l'affichage ne buggue pas */}
                  <CommandEmpty>
                    <div className="gs-state">
                      <div className="t">{t("globalSearch.noResults")}</div>
                      <div className="s">{t("globalSearch.noMatch", { query: search })}</div>
                    </div>
                  </CommandEmpty>

                  {filteredBookings.length > 0 && (
                    <CommandGroup heading={t("globalSearch.groups.bookings")}>
                      {filteredBookings.map((booking: any) => {
                        const statusConfig = getBookingStatusConfig(booking.status);
                        const payment = getBookingPaymentDisplay(booking);
                        const roomName = booking.treatment_rooms?.name as string | undefined;
                        const venueName = booking.hotels?.name as string | undefined;
                        const treatmentsSummary = summarizeTreatments(booking.booking_treatments);
                        const when = splitBookingDate(booking.booking_date);
                        return (
                        <CommandItem
                          key={booking.id}
                          // FIX 3: Valeur explicite pour que la modale retrouve ses petits
                          value={`${booking.client_first_name} ${booking.client_last_name} ${booking.booking_id} ${booking.phone || ''} ${booking.client_email || ''}`}
                          onSelect={() => openBooking(booking.id, booking)}
                          className="gs-item gs-book"
                        >
                          <div className="gs-when">
                            <div className="d">{when.day}</div>
                            <div className="m">{when.month}</div>
                          </div>
                          <div className="gs-body">
                            <div className="gs-title">
                              <span className="nm">{booking.client_first_name} {booking.client_last_name}</span>
                              <span className="ref">#{booking.booking_id}</span>
                            </div>
                            {venueName && (
                              <span className="gs-sub"><i>{t("globalSearch.fields.venue")}</i> {venueName}</span>
                            )}
                            {treatmentsSummary && (
                              <span className="gs-sub" title={treatmentsSummary}><i>{t("globalSearch.fields.treatment")}</i> {treatmentsSummary}</span>
                            )}
                            {roomName && (
                              <span className="gs-sub"><i>{t("globalSearch.fields.room")}</i> {roomName}</span>
                            )}
                            {booking.phone && (
                              <span className="gs-sub"><i>{t("globalSearch.fields.phone")}</i> {booking.phone}</span>
                            )}
                            <div className="gs-meta">
                              <Chip hex={statusConfig.hexColor}>{statusConfig.label}</Chip>
                              <Chip hex={payment.hexColor}>{payment.label}</Chip>
                            </div>
                            <div className="gs-actions">
                              {([
                                { kind: "view", icon: Eye, label: t("globalSearch.actions.view"), run: () => openBooking(booking.id) },
                                { kind: "edit", icon: Pencil, label: t("common:buttons.edit"), run: () => startAction("edit", booking) },
                                { kind: "payment", icon: CreditCard, label: t("globalSearch.actions.paymentLink"), run: () => startAction("payment", booking) },
                                { kind: "refund", icon: Undo2, label: t("globalSearch.actions.refund"), run: () => startAction("refund", booking) },
                              ] as const).map((a) => (
                                <ActionButton
                                  key={a.kind}
                                  icon={a.icon}
                                  label={a.label}
                                  loading={pending === `${booking.id}:${a.kind}`}
                                  disabled={pending !== null}
                                  onClick={a.run}
                                />
                              ))}
                            </div>
                          </div>
                          <OpenInNewTab
                            path={`/admin/bookings/${booking.id}`}
                            label={t("globalSearch.openBookingInNewTab", { id: booking.booking_id })}
                          />
                        </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}

                  {(searchResults?.customers?.length ?? 0) > 0 && (
                    <CommandGroup heading={t("globalSearch.groups.customers")}>
                      {searchResults!.customers.map((c: any) => (
                        <CommandItem
                          key={c.id}
                          // FIX 3
                          value={`${c.first_name} ${c.last_name} ${c.email || ''} ${c.phone || ''}`}
                          onSelect={() => {
                            if (onPickCustomer) {
                              onPickCustomer({
                                id: c.id,
                                first_name: c.first_name,
                                last_name: c.last_name,
                              });
                              setOpen(false);
                              return;
                            }
                            onSelect(`/admin/customers/${c.id}`);
                          }}
                          className="gs-item"
                        >
                          <div className="gs-ic cust">
                            <Users className="w-[18px] h-[18px]" />
                          </div>
                          <div className="gs-body">
                            <div className="gs-title">
                              <span className="nm">{c.first_name} {c.last_name}</span>
                            </div>
                            <span className="gs-sub">{c.email || c.phone}</span>
                          </div>
                          <OpenInNewTab
                            path={`/admin/customers/${c.id}`}
                            label={t("globalSearch.openCustomerInNewTab")}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {(searchResults?.therapists?.length ?? 0) > 0 && (
                    <CommandGroup heading={t("globalSearch.groups.therapists")}>
                      {searchResults!.therapists.map((th: any) => (
                        <CommandItem
                          key={th.id}
                          // FIX 3
                          value={`${th.first_name} ${th.last_name} ${th.status || ''}`}
                          onSelect={() => onSelect(`/admin/therapists/${th.id}`)}
                          className="gs-item"
                        >
                          <div className="gs-ic ther">
                            <UserRound className="w-[18px] h-[18px]" />
                          </div>
                          <div className="gs-body">
                            <div className="gs-title">
                              <span className="nm">{th.first_name} {th.last_name}</span>
                            </div>
                            <span className="gs-sub">{getEntityStatusConfig(th.status).label}</span>
                          </div>
                          <OpenInNewTab
                            path={`/admin/therapists/${th.id}`}
                            label={t("globalSearch.openTherapistInNewTab")}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {action?.kind === "edit" && (
        <EditBookingDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          booking={toEditTarget(action.booking)}
          initialMode="edit"
          onSuccess={afterAction}
        />
      )}

      {action?.kind === "payment" && (
        <SendPaymentLinkDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          booking={toPaymentTarget(action.booking)}
          onSuccess={afterAction}
        />
      )}

      {action?.kind === "refund" && (
        <RefundBookingDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          booking={toPaymentTarget(action.booking)}
          onSuccess={afterAction}
        />
      )}
    </>
  );
}