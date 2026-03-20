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
import { Loader2, Users } from "lucide-react";
import { getAmenityLabel, getAmenityType, type AmenityClientType } from "@/lib/amenityTypes";
import type { VenueAmenity } from "@/hooks/useVenueAmenities";

const formSchema = z.object({
  venue_amenity_id: z.string().min(1, "Sélectionnez une commodité"),
  client_type: z.enum(["external", "internal", "lymfea"]),
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
  hotelId: string;
  venueType?: string;
  venueAmenities: VenueAmenity[];
  preselectedDate?: Date;
  preselectedTime?: string;
}

export function CreateAmenityBookingDialog({
  open,
  onOpenChange,
  hotelId,
  venueType,
  venueAmenities,
  preselectedDate,
  preselectedTime,
}: CreateAmenityBookingDialogProps) {
  const queryClient = useQueryClient();
  const enabledAmenities = venueAmenities.filter((a) => a.is_enabled);

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

  const remainingCapacity = selectedAmenity
    ? selectedAmenity.capacity_per_slot - (currentOccupancy || 0)
    : 0;

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const amenity = enabledAmenities.find((a) => a.id === values.venue_amenity_id);
      if (!amenity) throw new Error("Amenity not found");

      // Find or create customer
      const { data: customerId, error: customerError } = await supabase.rpc(
        "find_or_create_customer",
        {
          _phone: values.phone,
          _first_name: values.first_name,
          _last_name: values.last_name || null,
          _email: values.email || null,
        }
      );
      if (customerError) throw customerError;

      const endTime = computeEndTime(values.booking_time, amenity.slot_duration);

      const { error } = await supabase.from("amenity_bookings").insert({
        hotel_id: hotelId,
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
        status: "confirmed",
        notes: values.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["amenity-bookings"] });
      toast.success("Réservation créée");
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erreur lors de la création");
    },
  });

  const onSubmit = (values: FormValues) => {
    if (numGuests > remainingCapacity) {
      toast.error(`Capacité insuffisante (${remainingCapacity} places restantes)`);
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réservation commodité</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      <SelectItem value="external">Externe</SelectItem>
                      {venueType === "hotel" && (
                        <SelectItem value="internal">Interne (hôtel)</SelectItem>
                      )}
                      <SelectItem value="lymfea">Lymfea (client soin)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
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
                Réserver
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
