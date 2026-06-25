import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Users, Search, Globe, Hotel, Sparkles, KeyRound } from "lucide-react";
import { getAmenityLabel, getAmenityType, type AmenityClientType } from "@/lib/amenityTypes";
import { useVenueAmenities, type VenueAmenity } from "@/hooks/useVenueAmenities";
import type { AmenityBookingForCalendar } from "@/hooks/booking";

const formSchema = z.object({
  venue_amenity_id: z.string().min(1, "Sélectionnez une commodité"),
  client_type: z.enum(["external", "internal", "lymfea", "sezame"]),
  first_name: z.string().min(1, "Prénom requis"),
  last_name: z.string().optional(),
  phone: z.string().min(1, "Téléphone requis"),
  email: z.string().optional(),
  room_number: z.string().optional(),
  num_guests: z.number().min(1).default(1),
  booking_date: z.string().min(1, "Date requise"),
  booking_time: z.string().min(1, "Heure requise"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 22 && m > 0) break;
      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      opts.push({ value: val, label: val });
    }
  }
  return opts;
})();

interface CreateAmenityBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed venue. Omit to let the user pick a venue via `hotels`. */
  hotelId?: string;
  venueType?: string;
  /** Amenities for the fixed venue. Omitted in picker mode (fetched per chosen venue). */
  venueAmenities?: VenueAmenity[];
  /** Venues the user can pick from when no fixed `hotelId` is provided. */
  hotels?: { id: string; name: string }[];
  preselectedDate?: Date;
  preselectedTime?: string;
  /** When provided, the dialog edits this existing booking instead of creating one. */
  editBooking?: AmenityBookingForCalendar | null;
}

export function CreateAmenityBookingDialog({
  open,
  onOpenChange,
  hotelId,
  venueType,
  venueAmenities,
  hotels,
  preselectedDate,
  preselectedTime,
  editBooking,
}: CreateAmenityBookingDialogProps) {
  const isEditMode = !!editBooking;
  const queryClient = useQueryClient();

  // Venue resolution: either a fixed venue (hotelId + venueAmenities) or a picker.
  const hasFixedVenue = !!hotelId && !!venueAmenities;
  const isPickerMode = !hasFixedVenue && !!hotels && hotels.length > 0;

  // In picker mode, only offer venues that actually have at least one enabled amenity.
  const { data: amenityHotelIds } = useQuery({
    queryKey: ["hotels-with-enabled-amenities"],
    enabled: isPickerMode,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_amenities")
        .select("hotel_id")
        .eq("is_enabled", true);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.hotel_id as string));
    },
  });
  const amenityHotels = amenityHotelIds
    ? (hotels ?? []).filter((h) => amenityHotelIds.has(h.id))
    : [];
  const showVenuePicker = isPickerMode && amenityHotels.length > 0;
  const [pickedHotelId, setPickedHotelId] = useState(hotelId ?? "");
  const effectiveHotelId = hotelId || pickedHotelId;

  // In picker mode, fetch the chosen venue's amenities and type ourselves.
  const { amenities: fetchedAmenities } = useVenueAmenities(hasFixedVenue ? "" : effectiveHotelId);
  const amenities = venueAmenities ?? fetchedAmenities;
  const enabledAmenities = amenities.filter((a) => a.is_enabled);

  const { data: fetchedVenueType } = useQuery({
    queryKey: ["hotel-venue-type", effectiveHotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("venue_type")
        .eq("id", effectiveHotelId)
        .single();
      if (error) throw error;
      return data.venue_type as string;
    },
    enabled: !venueType && !!effectiveHotelId,
  });
  const effectiveVenueType = venueType ?? fetchedVenueType;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      venue_amenity_id: "",
      client_type: "external",
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      room_number: "",
      num_guests: 1,
      booking_date: preselectedDate ? format(preselectedDate, "yyyy-MM-dd") : "",
      booking_time: preselectedTime || "",
      notes: "",
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (editBooking) {
        setPickedHotelId(editBooking.hotel_id);
        form.reset({
          venue_amenity_id: editBooking.venue_amenity_id,
          client_type: editBooking.client_type,
          first_name: editBooking.customer?.first_name ?? "",
          last_name: editBooking.customer?.last_name ?? "",
          phone: editBooking.customer?.phone ?? "",
          email: "",
          room_number: editBooking.room_number ?? "",
          num_guests: editBooking.num_guests,
          booking_date: editBooking.booking_date,
          booking_time: editBooking.booking_time?.substring(0, 5) || "",
          notes: editBooking.notes ?? "",
        });
        return;
      }
      setPickedHotelId(hotelId ?? "");
      form.reset({
        venue_amenity_id: enabledAmenities.length === 1 ? enabledAmenities[0].id : "",
        client_type: "external",
        first_name: "",
        last_name: "",
        phone: "",
        email: "",
        room_number: "",
        num_guests: 1,
        booking_date: preselectedDate ? format(preselectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        booking_time: preselectedTime || "",
        notes: "",
      });
    }
  }, [open]);

  // When the chosen venue changes (picker mode) or its amenities load, keep the
  // amenity selection valid: auto-select if there's exactly one, else clear it.
  useEffect(() => {
    if (!open || isEditMode) return;
    form.setValue("venue_amenity_id", enabledAmenities.length === 1 ? enabledAmenities[0].id : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveHotelId, enabledAmenities.length, open]);

  // Existing-customer search (mirrors BookingInfoStep)
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const trimmedCustomerSearch = customerSearch.trim();
  const isPhoneSearch = /^\+?\d[\d\s]{2,}$/.test(trimmedCustomerSearch);

  useEffect(() => {
    if (open) {
      setCustomerSearch("");
      setSelectedCustomerId(null);
    }
  }, [open]);

  const { data: customerResults = [], isFetching: isSearchingCustomers } = useQuery({
    queryKey: ["amenity-customer-search", trimmedCustomerSearch],
    enabled: trimmedCustomerSearch.length >= 3 && !selectedCustomerId,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select("id, first_name, last_name, phone, email")
        .limit(5);
      if (isPhoneSearch) {
        q = q.ilike("phone", `%${trimmedCustomerSearch.replace(/\s/g, "")}%`);
      } else {
        q = q.or(
          `first_name.ilike.%${trimmedCustomerSearch}%,last_name.ilike.%${trimmedCustomerSearch}%`,
        );
      }
      const { data } = await q;
      return (data as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
        email: string | null;
      }>) || [];
    },
  });

  const handleSelectCustomer = (c: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  }) => {
    setSelectedCustomerId(c.id);
    if (c.first_name) form.setValue("first_name", c.first_name);
    if (c.last_name) form.setValue("last_name", c.last_name);
    if (c.phone) form.setValue("phone", c.phone);
    if (c.email) form.setValue("email", c.email);
    setCustomerSearch(`${c.first_name || ""} ${c.last_name || ""}`.trim());
  };

  const selectedAmenityId = form.watch("venue_amenity_id");
  const selectedClientType = form.watch("client_type") as AmenityClientType;
  const bookingDate = form.watch("booking_date");
  const bookingTime = form.watch("booking_time");
  const numGuests = form.watch("num_guests");

  const selectedAmenity = enabledAmenities.find((a) => a.id === selectedAmenityId);

  // Compute price
  const computedPrice = useMemo(() => {
    if (!selectedAmenity) return 0;
    if (selectedClientType === "internal") return 0;
    if (selectedClientType === "lymfea" && selectedAmenity.lymfea_access_included) return 0;
    if (selectedClientType === "lymfea") return Number(selectedAmenity.price_lymfea) || 0;
    return Number(selectedAmenity.price_external) || 0;
  }, [selectedAmenity, selectedClientType]);

  // Check current occupancy for the selected slot
  const { data: currentOccupancy } = useQuery({
    queryKey: ["amenity-occupancy", selectedAmenityId, bookingDate, bookingTime],
    queryFn: async () => {
      if (!selectedAmenity || !bookingDate || !bookingTime) return 0;
      const endTime = computeEndTime(bookingTime, selectedAmenity.slot_duration);
      const { data, error } = await supabase.rpc("get_amenity_slot_occupancy", {
        p_venue_amenity_id: selectedAmenityId,
        p_date: bookingDate,
        p_start_time: bookingTime,
        p_end_time: endTime,
      });
      if (error) throw error;
      return data as number;
    },
    enabled: !!selectedAmenityId && !!bookingDate && !!bookingTime,
  });

  // When editing the same amenity/slot, the occupancy already counts this
  // booking's guests — credit them back so the booking can keep its places.
  const ownGuestsInSlot =
    isEditMode &&
    editBooking!.venue_amenity_id === selectedAmenityId &&
    editBooking!.booking_date === bookingDate &&
    editBooking!.booking_time?.substring(0, 5) === bookingTime
      ? editBooking!.num_guests
      : 0;

  const remainingCapacity = selectedAmenity
    ? selectedAmenity.capacity_per_slot - (currentOccupancy || 0) + ownGuestsInSlot
    : 0;

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const amenity = enabledAmenities.find((a) => a.id === values.venue_amenity_id);
      if (!amenity) throw new Error("Amenity not found");

      // Find or create customer. `_language` is passed to disambiguate the
      // overloaded RPC (a 5-arg variant with _language exists). Default to
      // French unless the phone carries a non-FR international prefix.
      const normalizedPhone = values.phone.replace(/\s/g, "");
      const language =
        normalizedPhone.startsWith("+") && !normalizedPhone.startsWith("+33") ? "en" : "fr";
      const { data: customerId, error: customerError } = await supabase.rpc(
        "find_or_create_customer",
        {
          _phone: normalizedPhone,
          _first_name: values.first_name,
          _last_name: values.last_name || null,
          _email: values.email || null,
          _language: language,
        }
      );
      if (customerError) throw customerError;

      const endTime = computeEndTime(values.booking_time, amenity.slot_duration);

      const payload = {
        hotel_id: effectiveHotelId,
        venue_amenity_id: values.venue_amenity_id,
        booking_date: values.booking_date,
        booking_time: values.booking_time,
        duration: amenity.slot_duration,
        end_time: endTime,
        customer_id: customerId,
        client_type: values.client_type,
        room_number: values.room_number || null,
        num_guests: values.num_guests,
        price: computedPrice * values.num_guests,
        payment_status: computedPrice === 0 ? "offert" : "pending",
        notes: values.notes || null,
      };

      if (isEditMode) {
        const { error } = await supabase
          .from("amenity_bookings")
          .update(payload)
          .eq("id", editBooking!.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("amenity_bookings")
        .insert({ ...payload, status: "confirmed" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["amenity-bookings"] });
      toast.success(isEditMode ? "Réservation mise à jour" : "Réservation créée");
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || (isEditMode ? "Erreur lors de la mise à jour" : "Erreur lors de la création"));
    },
  });

  const onSubmit = (values: FormValues) => {
    if (!effectiveHotelId) {
      toast.error("Sélectionnez un lieu");
      return;
    }
    if (numGuests > remainingCapacity) {
      toast.error(`Capacité insuffisante (${remainingCapacity} places restantes)`);
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        overlayClassName="bg-black/40 backdrop-blur-sm"
      >
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Modifier la réservation" : "Réservation commodité"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Venue selection (picker mode only) */}
            {showVenuePicker && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Lieu</label>
                <Select
                  value={pickedHotelId}
                  onValueChange={(v) => {
                    setPickedHotelId(v);
                    form.setValue("venue_amenity_id", "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un lieu" />
                  </SelectTrigger>
                  <SelectContent>
                    {amenityHotels.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Amenity selection */}
            <FormField
              control={form.control}
              name="venue_amenity_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commodité</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {enabledAmenities.map((a) => {
                        const typeDef = getAmenityType(a.type);
                        const Icon = typeDef?.icon;
                        return (
                          <SelectItem key={a.id} value={a.id}>
                            <div className="flex items-center gap-2">
                              {Icon && <Icon className="h-3.5 w-3.5" style={{ color: a.color }} />}
                              {a.name || getAmenityLabel(a.type, "fr")}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {effectiveHotelId && enabledAmenities.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Aucune commodité activée pour ce lieu.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Client type */}
            <FormField
              control={form.control}
              name="client_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type de client</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="external">
                        <span className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          Externe
                        </span>
                      </SelectItem>
                      {effectiveVenueType === "hotel" && (
                        <SelectItem value="internal">
                          <span className="flex items-center gap-2">
                            <Hotel className="h-4 w-4" />
                            Interne (hôtel)
                          </span>
                        </SelectItem>
                      )}
                      <SelectItem value="lymfea">
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          Eïa (client soin)
                        </span>
                      </SelectItem>
                      <SelectItem value="sezame">
                        <span className="flex items-center gap-2">
                          <KeyRound className="h-4 w-4" />
                          Sezame
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Existing customer search */}
            <div className="relative">
              <label className="flex items-center gap-1.5 mb-1 text-sm font-medium">
                <Search className="h-3.5 w-3.5" />
                Rechercher un client existant
              </label>
              <Input
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setSelectedCustomerId(null);
                }}
                placeholder="Nom, prénom ou téléphone…"
                className="h-9"
              />
              {trimmedCustomerSearch.length >= 3 && !selectedCustomerId && (
                <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border bg-popover shadow-md">
                  {isSearchingCustomers ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Recherche…
                    </div>
                  ) : customerResults.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Aucun client trouvé</div>
                  ) : (
                    customerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCustomer(c)}
                        className="w-full flex flex-col items-start px-3 py-2 text-sm text-left hover:bg-muted transition-colors first:rounded-t-lg last:rounded-b-lg"
                      >
                        <span className="font-medium">
                          {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[c.phone, c.email].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Client info */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom *</FormLabel>
                    <FormControl>
                      <Input {...field} className="h-9" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input {...field} className="h-9" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone *</FormLabel>
                    <FormControl>
                      <Input {...field} className="h-9" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" className="h-9" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Room number — internal only */}
            {selectedClientType === "internal" && (
              <FormField
                control={form.control}
                name="room_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° chambre</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ex: 302" className="h-9" />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="booking_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" className="h-9" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="booking_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Heure *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIME_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Guests + capacity indicator */}
            <div className="flex items-end gap-3">
              <FormField
                control={form.control}
                name="num_guests"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Nombre de personnes</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={remainingCapacity || 999}
                        value={field.value}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        className="h-9"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {selectedAmenity && bookingDate && bookingTime && (
                <div className="flex items-center gap-1.5 pb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Badge
                    variant={remainingCapacity > 0 ? "secondary" : "destructive"}
                    className="text-xs"
                  >
                    {remainingCapacity} / {selectedAmenity.capacity_per_slot} dispo
                  </Badge>
                </div>
              )}
            </div>

            {/* Duration info */}
            {selectedAmenity && (
              <div className="text-sm text-muted-foreground">
                Durée: {selectedAmenity.slot_duration} min
                {selectedAmenity.prep_time > 0 && (
                  <span> (+{selectedAmenity.prep_time} min préparation)</span>
                )}
              </div>
            )}

            {/* Price */}
            <div className="flex items-center gap-2 text-sm font-medium bg-muted/50 rounded p-2">
              Prix:&nbsp;
              {computedPrice === 0 ? (
                <Badge variant="secondary">Gratuit</Badge>
              ) : (
                <span>{computedPrice * numGuests} {selectedAmenity?.currency || "EUR"}</span>
              )}
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} className="resize-none" />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Submit — footer collant en bas du dialogue */}
            <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditMode ? "Enregistrer" : "Réserver"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function computeEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const totalMinutes = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
}
