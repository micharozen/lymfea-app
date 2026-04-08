import { useState, useMemo } from "react";
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
import { Upload, ChevronDown, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ROOM_TYPES = [
  { value: "Massage", label: "Massage" },
  { value: "Facial", label: "Soin visage" },
  { value: "Hammam", label: "Hammam" },
  { value: "Jacuzzi", label: "Jacuzzi" },
  { value: "Sauna", label: "Sauna" },
  { value: "Body Wrap", label: "Enveloppement" },
  { value: "Multi-purpose", label: "Polyvalente" },
];

const createFormSchema = (t: TFunction) => z.object({
  name: z.string().min(1, t('errors.validation.nameRequired')),
  room_type: z.string().min(1, t('errors.validation.roomTypeRequired')),
  hotel_id: z.string().optional(),
});

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

const generateRoomNumber = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'ROOM-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

interface AddTreatmentRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddTreatmentRoomDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddTreatmentRoomDialogProps) {
  const { t } = useTranslation('common');
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const [typePopoverOpen, setTypePopoverOpen] = useState(false);

  const {
    url: roomImage,
    setUrl: setRoomImage,
    uploading: isUploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload({ path: "treatment-rooms/" });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      room_type: "",
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

  const onSubmit = async (values: FormValues) => {
    // Find hotel name if hotel_id is selected
    const selectedHotel = hotels?.find(h => h.id === values.hotel_id);

    const { error } = await supabase.from("treatment_rooms").insert({
      name: values.name,
      room_type: values.room_type,
      room_number: generateRoomNumber(),
      hotel_id: values.hotel_id || null,
      hotel_name: selectedHotel?.name || null,
      image: roomImage || null,
      status: "active",
    });

    if (error) {
      toast.error("Erreur lors de l'ajout de la salle de soin");
      return;
    }

    toast.success("Salle de soin ajoutee avec succes");
    form.reset();
    setRoomImage("");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter une salle de soin</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col gap-3">
              <FormLabel>Image de la salle</FormLabel>
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 rounded-md border border-border flex items-center justify-center overflow-hidden bg-muted">
                  {roomImage ? (
                    <img
                      src={roomImage}
                      alt="Room preview"
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
                  {isUploading ? "Telechargement..." : "Telecharger"}
                  {isUploading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
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
                  <FormLabel>Nom de la salle</FormLabel>
                  <FormControl>
                    <Input placeholder="Salle Zen" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="room_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type de salle</FormLabel>
                  <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
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
                            {ROOM_TYPES.find(t => t.value === field.value)?.label || "Selectionner"}
                          </span>
                          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-48 p-0"
                      align="start"
                    >
                      <ScrollArea className="h-48">
                        <div className="p-1">
                          {ROOM_TYPES.map((type) => {
                            const isSelected = field.value === type.value;
                            return (
                              <button
                                key={type.value}
                                type="button"
                                onClick={() => {
                                  field.onChange(type.value);
                                  setTypePopoverOpen(false);
                                }}
                                className={cn(
                                  "w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm",
                                  "px-3 py-1.5 text-sm text-popover-foreground transition-colors",
                                  "hover:bg-foreground/5",
                                  isSelected && "font-medium"
                                )}
                              >
                                <span className="min-w-0 truncate text-left">{type.label}</span>
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
                  <FormLabel>Hotel</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selectionner" />
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
