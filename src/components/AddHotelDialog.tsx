import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
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
import { ImageIcon } from "lucide-react";

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
});

interface AddHotelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddHotelDialog({ open, onOpenChange, onSuccess }: AddHotelDialogProps) {
  const [hotelImage, setHotelImage] = useState<string>("");
  const [coverImage, setCoverImage] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const hotelImageRef = useRef<HTMLInputElement>(null);
  const coverImageRef = useRef<HTMLInputElement>(null);

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
    },
  });

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
      const { data: insertedHotel, error } = await supabase
        .from("hotels")
        .insert({
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
        })
        .select('id')
        .single();

      if (error) throw error;

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
          <DialogTitle className="text-xl font-semibold">Add hotel</DialogTitle>
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="hotel_commission"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hotel commission</FormLabel>
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

              <FormField
                control={form.control}
                name="hairdresser_commission"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hairdresser commission</FormLabel>
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
            </div>

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
