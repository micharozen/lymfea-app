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
  box_model: z.string().min(1, "Le modèle de box est requis"),
  box_id: z.string().min(1, "L'ID de box est requis"),
  hotel_id: z.string().optional(),
});

interface EditBoxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  box: any;
  onSuccess: () => void;
}

export function EditBoxDialog({
  open,
  onOpenChange,
  box,
  onSuccess,
}: EditBoxDialogProps) {
  const [boxImage, setBoxImage] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      box_model: "",
      box_id: "",
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
    if (box && open) {
      form.reset({
        name: box.name || "",
        box_model: box.box_model || "",
        box_id: box.box_id || "",
        hotel_id: box.hotel_id || "",
      });
      setBoxImage(box.image || "");
    }
  }, [box, open, form]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `boxes/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      setBoxImage(publicUrl);
      toast.success("Image téléchargée avec succès");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Erreur lors du téléchargement de l'image");
    } finally {
      setIsUploading(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!box?.id) return;

    const { error } = await supabase
      .from("boxes")
      .update({
        name: values.name,
        box_model: values.box_model,
        box_id: values.box_id,
        hotel_id: values.hotel_id || null,
        image: boxImage || null,
      })
      .eq("id", box.id);

    if (error) {
      toast.error("Erreur lors de la modification de la box");
      return;
    }

    toast.success("Box modifiée avec succès");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit box</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col gap-3">
              <FormLabel>Box picture</FormLabel>
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 rounded-md border border-border flex items-center justify-center overflow-hidden bg-muted">
                  {boxImage ? (
                    <img
                      src={boxImage}
                      alt="Box preview"
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
                  onClick={() => document.getElementById("box-image-upload-edit")?.click()}
                >
                  Upload Image
                </Button>
                <Input
                  id="box-image-upload-edit"
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
                  <FormLabel>Box name</FormLabel>
                  <FormControl>
                    <Input placeholder="OOM Box" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="box_model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Box model</FormLabel>
                  <FormControl>
                    <Input placeholder="OOM Box" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="box_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Box ID</FormLabel>
                  <FormControl>
                    <Input placeholder="OOM Box" {...field} />
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
                  <FormLabel>Hotel</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
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
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
