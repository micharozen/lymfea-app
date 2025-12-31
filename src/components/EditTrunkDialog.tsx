import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  trunk_model: z.string().min(1, "Le modèle de trunk est requis"),
  trunk_id: z.string().min(1, "L'ID du trunk est requis"),
  hotel_id: z.string().optional(),
});

interface EditTrunkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trunk: any;
  onSuccess: () => void;
}

export function EditTrunkDialog({
  open,
  onOpenChange,
  trunk,
  onSuccess,
}: EditTrunkDialogProps) {
  const [trunkImage, setTrunkImage] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      trunk_model: "",
      trunk_id: "",
      hotel_id: "",
    },
  });

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (trunk && open) {
      form.reset({
        name: trunk.name || "",
        trunk_model: trunk.trunk_model || "",
        trunk_id: trunk.trunk_id || "",
        hotel_id: trunk.hotel_id || "",
      });
      setTrunkImage(trunk.image || "");
    }
  }, [trunk, open, form]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `trunks/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      setTrunkImage(publicUrl);
      toast.success("Image téléchargée avec succès");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Erreur lors du téléchargement de l'image");
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!trunk?.id) return;

    // Find hotel name if hotel_id is selected
    const selectedHotel = hotels?.find(h => h.id === values.hotel_id);

    const { error } = await supabase
      .from("trunks")
      .update({
        name: values.name,
        trunk_model: values.trunk_model,
        trunk_id: values.trunk_id,
        hotel_id: values.hotel_id || null,
        hotel_name: selectedHotel?.name || null,
        image: trunkImage || null,
      })
      .eq("id", trunk.id);

    if (error) {
      toast.error("Erreur lors de la modification du trunk");
      return;
    }

    toast.success("Trunk modifié avec succès");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le trunk</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col gap-3">
              <FormLabel>Image du trunk</FormLabel>
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 rounded-md border border-border flex items-center justify-center overflow-hidden bg-muted">
                  {trunkImage ? (
                    <img
                      src={trunkImage}
                      alt="Trunk preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading}
                  onClick={() => document.getElementById("trunk-image-upload-edit")?.click()}
                >
                  Télécharger
                </Button>
                <Input
                  id="trunk-image-upload-edit"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du trunk</FormLabel>
                  <FormControl>
                    <Input placeholder="OOM Trunk" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="trunk_model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modèle du trunk</FormLabel>
                  <FormControl>
                    <Input placeholder="OOM Trunk V1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="trunk_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ID du trunk</FormLabel>
                  <FormControl>
                    <Input placeholder="TRK-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hotel_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hôtel</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {hotels?.map((hotel) => (
                        <SelectItem key={hotel.id} value={hotel.id}>
                          {hotel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annuler
              </Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
