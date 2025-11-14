import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";

const formSchema = z.object({
  first_name: z.string().min(1, "Le prénom est requis"),
  last_name: z.string().min(1, "Le nom est requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().min(1, "Le numéro de téléphone est requis"),
  country_code: z.string().default("+33"),
  hotel_ids: z.array(z.string()).min(1, "Au moins un hôtel doit être sélectionné"),
  profile_image: z.string().optional(),
});

interface AddConciergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const hotels = [
  {
    id: "sofitel-paris",
    name: "Hôtel Sofitel Paris le Faubourg",
    image: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=100&h=100&fit=crop",
  },
  {
    id: "mandarin-london",
    name: "Mandarin Oriental Hyde Park, London",
    image: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=100&h=100&fit=crop",
  },
  {
    id: "test",
    name: "TEST",
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=100&h=100&fit=crop",
  },
];

const countryCodes = [
  { code: "+33", country: "FR" },
  { code: "+44", country: "UK" },
  { code: "+1", country: "US" },
];

export function AddConciergeDialog({ open, onOpenChange, onSuccess }: AddConciergeDialogProps) {
  const [profileImage, setProfileImage] = useState<string>("");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      country_code: "+33",
      hotel_ids: [],
      profile_image: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      // Créer d'abord le concierge
      const { data: concierge, error: conciergeError } = await supabase
        .from("concierges")
        .insert({
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          phone: values.phone,
          country_code: values.country_code,
          profile_image: profileImage || null,
          status: "En attente",
        })
        .select()
        .single();

      if (conciergeError) throw conciergeError;

      // Ensuite, créer les associations avec les hôtels
      const hotelAssociations = values.hotel_ids.map((hotel_id) => ({
        concierge_id: concierge.id,
        hotel_id,
      }));

      const { error: hotelsError } = await supabase
        .from("concierge_hotels")
        .insert(hotelAssociations);

      if (hotelsError) throw hotelsError;

      toast.success("Concierge ajouté avec succès");
      form.reset();
      setProfileImage("");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erreur lors de l'ajout du concierge");
      console.error(error);
    }
  };

  const toggleHotel = (hotelId: string) => {
    const currentHotels = form.watch("hotel_ids");
    const newHotels = currentHotels.includes(hotelId)
      ? currentHotels.filter((id) => id !== hotelId)
      : [...currentHotels, hotelId];
    form.setValue("hotel_ids", newHotels);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Ajouter un concierge</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Photo de profil</label>
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={profileImage} />
                  <AvatarFallback className="bg-muted">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
                    </svg>
                  </AvatarFallback>
                </Avatar>
                <Button type="button" variant="outline" size="sm">
                  Télécharger une image
                </Button>
              </div>
            </div>

            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prénom</FormLabel>
                  <FormControl>
                    <Input placeholder="John" {...field} />
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
                    <Input placeholder="Doe" {...field} />
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
                    <Input type="email" placeholder="Entrer l'adresse email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numéro de téléphone</FormLabel>
                  <div className="flex gap-2">
                    <FormField
                      control={form.control}
                      name="country_code"
                      render={({ field: codeField }) => (
                        <Select value={codeField.value} onValueChange={codeField.onChange}>
                          <SelectTrigger className="w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {countryCodes.map((cc) => (
                              <SelectItem key={cc.code} value={cc.code}>
                                {cc.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FormControl>
                      <Input type="tel" placeholder="" {...field} className="flex-1" />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hotel_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hôtel(s)</FormLabel>
                  <div className="space-y-2">
                    {hotels.map((hotel) => (
                      <div
                        key={hotel.id}
                        className="flex items-center gap-3 p-3 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => toggleHotel(hotel.id)}
                      >
                        <img
                          src={hotel.image}
                          alt={hotel.name}
                          className="w-10 h-10 rounded object-cover"
                        />
                        <span className="flex-1 text-sm">{hotel.name}</span>
                        <Checkbox
                          checked={field.value.includes(hotel.id)}
                          onCheckedChange={() => toggleHotel(hotel.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ))}
                  </div>
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
                Annuler
              </Button>
              <Button type="submit" className="bg-foreground text-background hover:bg-foreground/90">
                Suivant
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
