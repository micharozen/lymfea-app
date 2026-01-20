import { useState, useEffect, useMemo } from "react";
import { useForm, useWatch, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useFileUpload } from "@/hooks/useFileUpload";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ImageIcon, Check, Loader2 } from "lucide-react";
import { TimezoneSelectField } from "@/components/TimezoneSelector";
import { getCountryDefaults } from "@/lib/timezones";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Trunk {
  id: string;
  name: string;
  trunk_id: string;
  image: string | null;
  hotel_id: string | null;
}

// Component to display calculated OOM commission
function OomCommissionDisplay({ control }: { control: Control<any> }) {
  const hotelCommission = useWatch({ control, name: "hotel_commission" });
  const hairdresserCommission = useWatch({ control, name: "hairdresser_commission" });
  
  const hotelComm = parseFloat(hotelCommission) || 0;
  const hairdresserComm = parseFloat(hairdresserCommission) || 0;
  const oomCommission = Math.max(0, 100 - hotelComm - hairdresserComm);
  const isInvalid = hotelComm + hairdresserComm > 100;
  
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Commission OOM</label>
      <div className={`relative flex items-center h-10 px-3 border rounded-md bg-muted/50 ${isInvalid ? 'border-destructive' : ''}`}>
        <span className={`text-sm font-medium ${isInvalid ? 'text-destructive' : 'text-foreground'}`}>
          {isInvalid ? 'Erreur' : `${oomCommission.toFixed(2)}%`}
        </span>
      </div>
      {isInvalid && (
        <p className="text-xs text-destructive">Total &gt; 100%</p>
      )}
    </div>
  );
}

const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('errors.validation.nameRequired')),
  venue_type: z.enum(['hotel', 'coworking']).default('hotel'),
  address: z.string().min(1, t('errors.validation.addressRequired')),
  postal_code: z.string().optional(),
  city: z.string().min(1, t('errors.validation.cityRequired')),
  country: z.string().min(1, t('errors.validation.countryRequired')),
  currency: z.string().default("EUR"),
  vat: z.string().default("20"),
  hotel_commission: z.string().default("0"),
  hairdresser_commission: z.string().default("0"),
  status: z.string().default("active"),
  timezone: z.string().default("Europe/Paris"),
}).refine((data) => {
  const hotelComm = parseFloat(data.hotel_commission) || 0;
  const hairdresserComm = parseFloat(data.hairdresser_commission) || 0;
  return hotelComm + hairdresserComm <= 100;
}, {
  message: t('errors.validation.commissionExceeds100'),
  path: ["hotel_commission"],
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

interface AddHotelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddHotelDialog({ open, onOpenChange, onSuccess }: AddHotelDialogProps) {
  const { t } = useTranslation('common');
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [selectedTrunkIds, setSelectedTrunkIds] = useState<string[]>([]);

  const {
    url: hotelImage,
    setUrl: setHotelImage,
    uploading: uploadingHotel,
    fileInputRef: hotelImageRef,
    handleUpload: handleHotelImageUpload,
    triggerFileSelect: triggerHotelImageSelect,
  } = useFileUpload();

  const {
    url: coverImage,
    setUrl: setCoverImage,
    uploading: uploadingCover,
    fileInputRef: coverImageRef,
    handleUpload: handleCoverImageUpload,
    triggerFileSelect: triggerCoverImageSelect,
  } = useFileUpload();

  const uploading = uploadingHotel || uploadingCover;

  useEffect(() => {
    if (open) {
      fetchTrunks();
      setSelectedTrunkIds([]);
    }
  }, [open]);

  const fetchTrunks = async () => {
    const { data, error } = await supabase
      .from("trunks")
      .select("id, name, trunk_id, image, hotel_id")
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des trunks");
      return;
    }

    setTrunks(data || []);
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      venue_type: "hotel",
      address: "",
      postal_code: "",
      city: "",
      country: "",
      currency: "EUR",
      vat: "20",
      hotel_commission: "0",
      hairdresser_commission: "0",
      status: "active",
      timezone: "Europe/Paris",
    },
  });

  // Watch venue_type for label changes
  const venueTypeValue = useWatch({ control: form.control, name: "venue_type" });

  // Watch country field and auto-suggest timezone, currency, VAT
  const countryValue = useWatch({ control: form.control, name: "country" });

  useEffect(() => {
    if (countryValue) {
      const defaults = getCountryDefaults(countryValue);
      if (defaults) {
        const current = form.getValues();
        // Only auto-suggest if values are still at defaults
        if (current.timezone === "Europe/Paris" || !current.timezone) {
          form.setValue("timezone", defaults.timezone);
        }
        if (current.currency === "EUR") {
          form.setValue("currency", defaults.currency);
        }
        if (current.vat === "20") {
          form.setValue("vat", defaults.vat.toString());
        }
      }
    }
  }, [countryValue, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      const { data: insertedHotel, error } = await supabase
        .from("hotels")
        .insert({
          name: values.name,
          venue_type: values.venue_type,
          address: values.address,
          postal_code: values.postal_code || null,
          city: values.city,
          country: values.country,
          currency: values.currency,
          vat: parseFloat(values.vat),
          hotel_commission: parseFloat(values.hotel_commission),
          hairdresser_commission: parseFloat(values.hairdresser_commission),
          status: values.status,
          image: hotelImage || null,
          cover_image: coverImage || null,
          timezone: values.timezone,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Associate selected trunks with this hotel
      if (insertedHotel && selectedTrunkIds.length > 0) {
        const { error: trunkError } = await supabase
          .from("trunks")
          .update({ hotel_id: insertedHotel.id })
          .in("id", selectedTrunkIds);

        if (trunkError) {
          console.error("Error associating trunks:", trunkError);
          toast.warning("Hôtel créé mais erreur lors de l'association des trunks");
        }
      }

      toast.success("Hôtel ajouté avec succès");
      
      // Show success message with QR code info
      if (insertedHotel) {
        toast.success(
          `Hôtel créé avec l'ID: ${insertedHotel.id}. Le QR code de réservation est disponible dans la liste.`,
          { duration: 5000 }
        );
      }
      
      form.reset();
      setHotelImage("");
      setCoverImage("");
      setSelectedTrunkIds([]);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error("Un hôtel avec cet identifiant existe déjà");
      } else {
        toast.error("Erreur lors de l'ajout de l'hôtel");
      }
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Add venue</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Hotel picture</label>
                <div className="flex flex-col items-center gap-3 p-4 border rounded-md bg-muted/20">
                  <Avatar className="h-16 w-16 rounded-md">
                    <AvatarImage src={hotelImage} />
                    <AvatarFallback className="bg-muted rounded-md">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <input
                    ref={hotelImageRef}
                    type="file"
                    accept="image/*"
                    onChange={handleHotelImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={triggerHotelImageSelect}
                    disabled={uploading}
                  >
                    {uploadingHotel ? "Uploading..." : "Upload Image"}
                    {uploadingHotel && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Cover picture</label>
                <div className="flex flex-col items-center gap-3 p-4 border rounded-md bg-muted/20">
                  <Avatar className="h-16 w-16 rounded-md">
                    <AvatarImage src={coverImage} />
                    <AvatarFallback className="bg-muted rounded-md">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <input
                    ref={coverImageRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={triggerCoverImageSelect}
                    disabled={uploading}
                  >
                    {uploadingCover ? "Uploading..." : "Upload Image"}
                    {uploadingCover && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="venue_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Venue type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hotel">
                          <div className="flex items-center gap-2">
                            <span>🏨</span>
                            Hotel
                          </div>
                        </SelectItem>
                        <SelectItem value="coworking">
                          <div className="flex items-center gap-2">
                            <span>🏢</span>
                            Coworking
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{venueTypeValue === 'coworking' ? 'Coworking name' : 'Hotel name'}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal code</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                        <SelectItem value="CHF">CHF</SelectItem>
                        <SelectItem value="AED">AED (د.إ)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>


            <FormField
              control={form.control}
              name="vat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VAT</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type="number" step="0.01" {...field} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="hotel_commission"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commission hôtel</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type="number" step="0.01" min="0" max="100" {...field} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hairdresser_commission"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commission coiffeur</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type="number" step="0.01" min="0" max="100" {...field} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <OomCommissionDisplay control={form.control} />
            </div>

            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <TimezoneSelectField
                    value={field.value}
                    onChange={field.onChange}
                    label="Timezone"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                          {t('status.active')}
                        </div>
                      </SelectItem>
                      <SelectItem value="pending">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-orange-500" />
                          {t('status.pending')}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Trunk Selection */}
            <div className="space-y-2">
              <Label>Trunks (Malles)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground"
                  >
                    <span className="truncate">
                      {selectedTrunkIds.length === 0
                        ? "Sélectionner des trunks"
                        : trunks
                            .filter((t) => selectedTrunkIds.includes(t.id))
                            .map((t) => t.name)
                            .join(", ")}
                    </span>
                    <svg className="h-3 w-3 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-64 p-0"
                  align="start"
                  onWheelCapture={(e) => e.stopPropagation()}
                  onTouchMoveCapture={(e) => e.stopPropagation()}
                >
                  <ScrollArea className="h-40 touch-pan-y">
                    <div className="p-1">
                      {trunks.map((trunk) => {
                        const isSelected = selectedTrunkIds.includes(trunk.id);
                        return (
                          <button
                            key={trunk.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTrunkIds(selectedTrunkIds.filter((id) => id !== trunk.id));
                              } else {
                                setSelectedTrunkIds([...selectedTrunkIds, trunk.id]);
                              }
                            }}
                            className="w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-foreground/5"
                          >
                            <span className="min-w-0 truncate text-left">{trunk.name}</span>
                            {isSelected ? (
                              <span className="h-4 w-4 grid place-items-center rounded-sm bg-primary text-primary-foreground">
                                <Check className="h-3 w-3" strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="h-4 w-4" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-foreground text-background hover:bg-foreground/90">
                Add
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
