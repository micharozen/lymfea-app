import { useState, useEffect, useRef } from "react";
import { useForm, useWatch, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ImageIcon, Plus, X, Package } from "lucide-react";
import { TimezoneSelectField } from "@/components/TimezoneSelector";
import { Badge } from "@/components/ui/badge";


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
const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  address: z.string().min(1, "L'adresse est requise"),
  postal_code: z.string().optional(),
  city: z.string().min(1, "La ville est requise"),
  country: z.string().min(1, "Le pays est requis"),
  currency: z.string().default("EUR"),
  vat: z.string().default("20"),
  hotel_commission: z.string().default("0"),
  hairdresser_commission: z.string().default("0"),
  status: z.string().default("Actif"),
  timezone: z.string().default("Europe/Paris"),
}).refine((data) => {
  const hotelComm = parseFloat(data.hotel_commission) || 0;
  const hairdresserComm = parseFloat(data.hairdresser_commission) || 0;
  return hotelComm + hairdresserComm <= 100;
}, {
  message: "La somme des commissions (hôtel + coiffeur) ne peut pas dépasser 100%",
  path: ["hotel_commission"],
});

interface EditHotelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  hotelId: string;
}

export function EditHotelDialog({ open, onOpenChange, onSuccess, hotelId }: EditHotelDialogProps) {
  const [hotelImage, setHotelImage] = useState<string>("");
  const [coverImage, setCoverImage] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [currentHotelId, setCurrentHotelId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const hotelImageRef = useRef<HTMLInputElement>(null);
  const coverImageRef = useRef<HTMLInputElement>(null);
  
  // Trunks state
  const [affiliatedTrunks, setAffiliatedTrunks] = useState<any[]>([]);
  const [availableTrunks, setAvailableTrunks] = useState<any[]>([]);
  const [loadingTrunks, setLoadingTrunks] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
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
      status: "Actif",
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
      
      // Load trunks affiliated to this hotel
      const { data: affiliated, error: affiliatedError } = await supabase
        .from("trunks")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("name");

      if (affiliatedError) throw affiliatedError;
      setAffiliatedTrunks(affiliated || []);

      // Load trunks that are not affiliated to any hotel (available)
      const { data: available, error: availableError } = await supabase
        .from("trunks")
        .select("*")
        .is("hotel_id", null)
        .order("name");

      if (availableError) throw availableError;
      setAvailableTrunks(available || []);
    } catch (error) {
      console.error("Error loading trunks:", error);
    } finally {
      setLoadingTrunks(false);
    }
  };

  const handleAffiliateTrunk = async (trunkId: string) => {
    try {
      const trunk = availableTrunks.find(t => t.id === trunkId);
      const hotelName = form.getValues("name");
      
      const { error } = await supabase
        .from("trunks")
        .update({ hotel_id: hotelId, hotel_name: hotelName })
        .eq("id", trunkId);

      if (error) throw error;
      
      toast.success("Trunk affilié avec succès");
      loadTrunks();
    } catch (error) {
      toast.error("Erreur lors de l'affiliation du trunk");
      console.error(error);
    }
  };

  const handleUnlinkTrunk = async (trunkId: string) => {
    try {
      const { error } = await supabase
        .from("trunks")
        .update({ hotel_id: null, hotel_name: null })
        .eq("id", trunkId);

      if (error) throw error;
      
      toast.success("Trunk délié avec succès");
      loadTrunks();
    } catch (error) {
      toast.error("Erreur lors de la suppression du lien");
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
        status: hotel.status || "Actif",
        timezone: hotel.timezone || "Europe/Paris",
      });
      
      setHotelImage(hotel.image || "");
      setCoverImage(hotel.cover_image || "");
      setCurrentHotelId(hotel.id);
    } catch (error: any) {
      toast.error("Erreur lors du chargement de l'hôtel");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    type: 'hotel' | 'cover'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Le fichier doit être une image");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 5MB");
      return;
    }

    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      if (type === 'hotel') {
        setHotelImage(publicUrl);
      } else {
        setCoverImage(publicUrl);
      }
      
      toast.success("Image téléchargée avec succès");
    } catch (error: any) {
      toast.error("Erreur lors du téléchargement de l'image");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
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
    } catch (error: any) {
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
                    onChange={(e) => handleImageUpload(e, 'hotel')}
                    className="hidden"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => hotelImageRef.current?.click()}
                    disabled={uploading}
                  >
                    Upload Image
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
                    onChange={(e) => handleImageUpload(e, 'cover')}
                    className="hidden"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => coverImageRef.current?.click()}
                    disabled={uploading}
                  >
                    Upload Image
                  </Button>
                </div>
              </div>
            </div>

            {/* Read-only Hotel ID display */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Hotel ID (auto-generated)</label>
              <Input 
                value={currentHotelId} 
                disabled 
                className="bg-muted/50 text-muted-foreground cursor-not-allowed"
              />
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
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
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
                      <SelectItem value="Actif">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                          Actif
                        </div>
                      </SelectItem>
                      <SelectItem value="En attente">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-orange-500" />
                          En attente
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Trunks Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <label className="text-sm font-medium">Trunks affiliés</label>
                  <Badge variant="secondary" className="text-xs">
                    {affiliatedTrunks.length}
                  </Badge>
                </div>
              </div>

              {loadingTrunks ? (
                <p className="text-sm text-muted-foreground">Chargement...</p>
              ) : (
                <>
                  {/* Affiliated trunks list */}
                  {affiliatedTrunks.length > 0 ? (
                    <div className="space-y-2">
                      {affiliatedTrunks.map((trunk) => (
                        <div
                          key={trunk.id}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                        >
                          <div className="flex items-center gap-2">
                            {trunk.image ? (
                              <img
                                src={trunk.image}
                                alt={trunk.name}
                                className="h-8 w-8 rounded object-cover"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs">
                                🧳
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium">{trunk.name}</p>
                              <p className="text-xs text-muted-foreground">{trunk.trunk_id}</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleUnlinkTrunk(trunk.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Aucun trunk affilié à cet hôtel
                    </p>
                  )}

                  {/* Add trunk selector */}
                  {availableTrunks.length > 0 && (
                    <div className="pt-2">
                      <Select onValueChange={handleAffiliateTrunk}>
                        <SelectTrigger className="w-full">
                          <div className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            <span>Ajouter un trunk</span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {availableTrunks.map((trunk) => (
                            <SelectItem key={trunk.id} value={trunk.id}>
                              <div className="flex items-center gap-2">
                                <span>{trunk.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({trunk.trunk_id})
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
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
