import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('errors.validation.nameRequired')),
  trunk_model: z.string().min(1, t('errors.validation.trunkModelRequired')),
  hotel_id: z.string().optional(),
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

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
  const { t } = useTranslation('common');
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);

  const {
    url: trunkImage,
    setUrl: setTrunkImage,
    uploading: isUploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload({ path: "trunks/" });

  const form = useForm<FormValues>({
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

  useEffect(() => {
    if (trunk && open) {
      form.reset({
        name: trunk.name || "",
        trunk_model: trunk.trunk_model || "",
        hotel_id: trunk.hotel_id || "",
      });
      setTrunkImage(trunk.image || "");
    }
  }, [trunk, open, form]);

  const onSubmit = async (values: FormValues) => {
    if (!trunk?.id) return;

    // Find hotel name if hotel_id is selected
    const selectedHotel = hotels?.find(h => h.id === values.hotel_id);

    const { error } = await supabase
      .from("trunks")
      .update({
        name: values.name,
        trunk_model: values.trunk_model,
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
                  onClick={triggerFileSelect}
                >
                  Télécharger
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
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
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
