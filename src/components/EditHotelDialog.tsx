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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ImageIcon, Check, Loader2 } from "lucide-react";
import { TimezoneSelectField } from "@/components/TimezoneSelector";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('errors.validation.nameRequired')),
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

interface Trunk {
  id: string;
  name: string;
  hotel_id: string | null;
  hotel_name: string | null;
  status: string;
  trunk_id: string;
  trunk_model: string;
}

// Component to display calculated OOM commission
function OomCommissionDisplay({ control }: { control: Control<FormValues> }) {
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

interface EditHotelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  hotelId: string;
}

export function EditHotelDialog({ open, onOpenChange, onSuccess, hotelId }: EditHotelDialogProps) {
  const { t } = useTranslation('common');
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const [loading, setLoading] = useState(true);
  const [currentHotelId, setCurrentHotelId] = useState<string>("");

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
  
  // Trunks state - all trunks and selected IDs
  const [allTrunks, setAllTrunks] = useState<Trunk[]>([]);
  const [selectedTrunkIds, setSelectedTrunkIds] = useState<string[]>([]);
  const [loadingTrunks, setLoadingTrunks] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
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

  useEffect(() => {
    if (open && hotelId) {
      loadHotel();
      loadTrunks();
    }
  }, [open, hotelId]);

  const loadTrunks = async () => {
    try {
      setLoadingTrunks(true);
      
      // Load ALL trunks (to allow reassignment between hotels)
      const { data: trunks, error } = await supabase
        .from("trunks")
        .select("*")
        .order("name");

      if (error) throw error;
      
      setAllTrunks(trunks || []);
      // Set initially selected trunks (those affiliated to this hotel)
      const affiliatedIds = (trunks || [])
        .filter(t => t.hotel_id === hotelId)
        .map(t => t.id);
      setSelectedTrunkIds(affiliatedIds);
    } catch (error) {
      console.error("Error loading trunks:", error);
    } finally {
      setLoadingTrunks(false);
    }
  };

  const handleTrunkToggle = async (trunkId: string, checked: boolean) => {
    try {
      const hotelName = form.getValues("name");
      
      if (checked) {
        // Affiliate trunk to this hotel
        const { error } = await supabase
          .from("trunks")
          .update({ hotel_id: hotelId, hotel_name: hotelName })
          .eq("id", trunkId);

        if (error) throw error;
        setSelectedTrunkIds(prev => [...prev, trunkId]);
        toast.success("Trunk affilié");
      } else {
        // Unlink trunk from hotel
        const { error } = await supabase
          .from("trunks")
          .update({ hotel_id: null, hotel_name: null })
          .eq("id", trunkId);

        if (error) throw error;
        setSelectedTrunkIds(prev => prev.filter(id => id !== trunkId));
        toast.success("Trunk délié");
      }
    } catch (error) {
      toast.error("Erreur lors de la modification");
      console.error(error);
    }
  };

  const loadHotel = async () => {
    try {
      setLoading(true);
      const { data: hotel, error } = await supabase
        .from("hotels")
        .select("*")
        .eq("id", hotelId)
        .single();

      if (error) throw error;

      form.reset({
        name: hotel.name,
        address: hotel.address,
        postal_code: hotel.postal_code || "",
        city: hotel.city,
        country: hotel.country,
        currency: hotel.currency || "EUR",
        vat: hotel.vat?.toString() || "20",
        hotel_commission: hotel.hotel_commission?.toString() || "0",
        hairdresser_commission: hotel.hairdresser_commission?.toString() || "0",
        status: hotel.status || "active",
        timezone: hotel.timezone || "Europe/Paris",
      });
      
      setHotelImage(hotel.image || "");
      setCoverImage(hotel.cover_image || "");
      setCurrentHotelId(hotel.id);
    } catch (error) {
      toast.error("Erreur lors du chargement de l'hôtel");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const { error } = await supabase
        .from("hotels")
        .update({
          name: values.name,
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
        .eq("id", hotelId);

      if (error) throw error;

      toast.success("Hôtel modifié avec succès");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error("Erreur lors de la modification de l'hôtel");
      console.error(error);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <p className="text-center py-8">Chargement...</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Modifier l'hôtel</DialogTitle>
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


            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hotel name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            {/* Trunks Section */}
            <div className="space-y-2">
              <Label>Trunks</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground"
                    disabled={loadingTrunks}
                  >
                    <span className="truncate">
                      {loadingTrunks
                        ? "Chargement..."
                        : selectedTrunkIds.length === 0
                          ? "Sélectionner des trunks"
                          : allTrunks
                              .filter((t) => selectedTrunkIds.includes(t.id))
                              .map((t) => t.name)
                              .join(", ")}
                    </span>
                    {loadingTrunks && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
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
                      {allTrunks.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Aucun trunk disponible
                        </p>
                      ) : (
                        allTrunks.map((trunk) => {
                          const isSelected = selectedTrunkIds.includes(trunk.id);
                          return (
                            <button
                              key={trunk.id}
                              type="button"
                              onClick={() => handleTrunkToggle(trunk.id, !isSelected)}
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
                        })
                      )}
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
                Enregistrer
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
