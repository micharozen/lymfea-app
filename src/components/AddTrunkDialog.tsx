import { useState } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Upload, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const TRUNK_MODELS = [
  { value: "Edo", label: "Edo" },
  { value: "Regency", label: "Regency" },
  { value: "Revolution", label: "Revolution" },
];

const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  trunk_model: z.string().min(1, "Le modèle de trunk est requis"),
  hotel_id: z.string().optional(),
});

const generateTrunkId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'TRK-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

interface AddTrunkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddTrunkDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddTrunkDialogProps) {
  const [trunkImage, setTrunkImage] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      trunk_model: "",
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
    // Find hotel name if hotel_id is selected
    const selectedHotel = hotels?.find(h => h.id === values.hotel_id);

    const { error } = await supabase.from("trunks").insert({
      name: values.name,
      trunk_model: values.trunk_model,
      trunk_id: generateTrunkId(),
      hotel_id: values.hotel_id || null,
      hotel_name: selectedHotel?.name || null,
      image: trunkImage || null,
      status: "active",
    });

    if (error) {
      toast.error("Erreur lors de l'ajout du trunk");
      return;
    }

    toast.success("Trunk ajouté avec succès");
    form.reset();
    setTrunkImage("");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un trunk</DialogTitle>
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
                  onClick={() => document.getElementById("trunk-image-upload")?.click()}
                >
                  Télécharger
                </Button>
                <Input
                  id="trunk-image-upload"
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
                  <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-between font-normal h-9 text-sm hover:bg-background hover:text-foreground",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <span className="truncate">
                            {field.value || "Sélectionner"}
                          </span>
                          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-48 p-0"
                      align="start"
                    >
                      <ScrollArea className="h-32">
                        <div className="p-1">
                          {TRUNK_MODELS.map((model) => {
                            const isSelected = field.value === model.value;
                            return (
                              <button
                                key={model.value}
                                type="button"
                                onClick={() => {
                                  field.onChange(model.value);
                                  setModelPopoverOpen(false);
                                }}
                                className={cn(
                                  "w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm",
                                  "px-3 py-1.5 text-sm text-popover-foreground transition-colors",
                                  "hover:bg-foreground/5",
                                  isSelected && "font-medium"
                                )}
                              >
                                <span className="min-w-0 truncate text-left">{model.label}</span>
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
              <Button type="submit">Ajouter</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
