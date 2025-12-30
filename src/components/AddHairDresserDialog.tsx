import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as z from "zod";

const countries = [
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
  { code: "+1", label: "États-Unis", flag: "🇺🇸" },
  { code: "+44", label: "Royaume-Uni", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+377", label: "Monaco", flag: "🇲🇨" },
];

interface AddHairDresserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

const SKILLS_OPTIONS = [
  { value: "men", label: "👨 Hommes" },
  { value: "women", label: "👩 Femmes" },
  { value: "barber", label: "💈 Barbier" },
  { value: "beauty", label: "💅 Beauté" },
];

const TRUNKS_OPTIONS = [
  { value: "trunk1", label: "Trunk 1" },
  { value: "trunk2", label: "Trunk 2" },
  { value: "trunk3", label: "Trunk 3" },
  { value: "trunk4", label: "Trunk 4" },
  { value: "trunk5", label: "Trunk 5" },
];

const formSchema = z.object({
  first_name: z.string().min(1, "Prénom requis").max(100, "Prénom trop long"),
  last_name: z.string().min(1, "Nom requis").max(100, "Nom trop long"),
  email: z.string().email("Email invalide").max(255, "Email trop long"),
  phone: z.string().min(1, "Téléphone requis").max(20, "Numéro trop long").regex(/^[0-9\s]+$/, "Format invalide"),
  country_code: z.string(),
  status: z.string(),
});

export default function AddHairDresserDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddHairDresserDialogProps) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotels, setSelectedHotels] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedTrunks, setSelectedTrunks] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    country_code: "+33",
    phone: "",
    status: "pending",
  });

  useEffect(() => {
    if (open) {
      fetchHotels();
    }
  }, [open]);

  const fetchHotels = async () => {
    const { data, error } = await supabase
      .from("hotels")
      .select("id, name, image")
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des hôtels");
      return;
    }

    setHotels(data || []);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Le fichier doit être une image");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 5MB");
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      setProfileImage(publicUrl);
      toast.success("Image téléchargée avec succès");
    } catch (error) {
      toast.error("Erreur lors du téléchargement de l'image");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form data
    try {
      formSchema.parse(formData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }

    const { data: hairdresser, error } = await supabase
      .from("hairdressers")
      .insert({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        country_code: formData.country_code,
        phone: formData.phone,
        trunks: selectedTrunks.join(", ") || null,
        status: formData.status,
        skills: selectedSkills,
        profile_image: profileImage,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erreur lors de l'ajout du coiffeur");
      return;
    }

    // Insert hairdresser-hotel relationships
    if (selectedHotels.length > 0) {
      const hotelRelations = selectedHotels.map((hotelId) => ({
        hairdresser_id: hairdresser.id,
        hotel_id: hotelId,
      }));

      const { error: relationError } = await supabase
        .from("hairdresser_hotels")
        .insert(hotelRelations);

      if (relationError) {
        toast.error("Erreur lors de l'association des hôtels");
        return;
      }
    }

    // Send welcome email with PWA installation instructions
    try {
      const { error: emailError } = await supabase.functions.invoke('invite-hairdresser', {
        body: {
          hairdresserId: hairdresser.id,
          email: formData.email,
          firstName: formData.first_name,
          lastName: formData.last_name,
          phone: formData.phone,
          countryCode: formData.country_code,
          hotelIds: selectedHotels,
        }
      });

      if (emailError) {
        console.error("Error sending welcome email:", emailError);
        toast.warning("Coiffeur ajouté mais l'email de bienvenue n'a pas pu être envoyé");
      } else {
        toast.success("Coiffeur ajouté et email de bienvenue envoyé");
      }
    } catch (emailErr) {
      console.error("Error invoking invite-hairdresser:", emailErr);
      toast.warning("Coiffeur ajouté mais l'email de bienvenue n'a pas pu être envoyé");
    }

    onOpenChange(false);
    onSuccess();
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      country_code: "+33",
      phone: "",
      status: "En attente",
    });
    setSelectedHotels([]);
    setSelectedSkills([]);
    setSelectedTrunks([]);
    setProfileImage(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un coiffeur</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={profileImage || ""} />
              <AvatarFallback className="bg-muted">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
                </svg>
              </AvatarFallback>
            </Avatar>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "..." : "Télécharger une image"}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="first_name" className="text-xs">Prénom *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) =>
                  setFormData({ ...formData, first_name: e.target.value })
                }
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last_name" className="text-xs">Nom *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) =>
                  setFormData({ ...formData, last_name: e.target.value })
                }
                required
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="email" className="text-xs">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone" className="text-xs">Téléphone *</Label>
            <PhoneNumberField
              id="phone"
              value={formData.phone}
              onChange={(value) => setFormData({ ...formData, phone: value })}
              countryCode={formData.country_code}
              setCountryCode={(value) => setFormData({ ...formData, country_code: value })}
              countries={countries}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Hôtels</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal h-9 text-xs hover:bg-background"
                  >
                    <span className="truncate">
                      {selectedHotels.length === 0
                        ? "Sélectionner"
                        : hotels
                            .filter((h) => selectedHotels.includes(h.id))
                            .map((h) => h.name)
                            .join(", ")}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-0" align="start" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                  <ScrollArea className="h-40 touch-pan-y">
                    <div className="p-1">
                      {hotels.map((hotel) => {
                        const selected = selectedHotels.includes(hotel.id);
                        return (
                          <button
                            key={hotel.id}
                            type="button"
                            onClick={() => {
                              setSelectedHotels(
                                selected
                                  ? selectedHotels.filter((id) => id !== hotel.id)
                                  : [...selectedHotels, hotel.id],
                              );
                            }}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors",
                              "hover:bg-muted-foreground/10",
                              selected && "bg-foreground/10 font-medium",
                            )}
                          >
                            <span className="truncate">{hotel.name}</span>
                            {selected ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Trunk</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal h-9 text-xs hover:bg-background"
                  >
                    <span className="truncate">
                      {selectedTrunks.length === 0
                        ? "Sélectionner"
                        : TRUNKS_OPTIONS
                            .filter((t) => selectedTrunks.includes(t.value))
                            .map((t) => t.label)
                            .join(", ")}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-36 p-0" align="start" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                  <ScrollArea className="h-32 touch-pan-y">
                    <div className="p-1">
                      {TRUNKS_OPTIONS.map((trunk) => {
                        const selected = selectedTrunks.includes(trunk.value);
                        return (
                          <button
                            key={trunk.value}
                            type="button"
                            onClick={() => {
                              setSelectedTrunks(
                                selected
                                  ? selectedTrunks.filter((t) => t !== trunk.value)
                                  : [...selectedTrunks, trunk.value],
                              );
                            }}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors",
                              "hover:bg-muted-foreground/10",
                              selected && "bg-foreground/10 font-medium",
                            )}
                          >
                            <span className="truncate">{trunk.label}</span>
                            {selected ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Compétences</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal h-9 text-xs hover:bg-background"
                  >
                    <span className="truncate">
                      {selectedSkills.length === 0
                        ? "Sélectionner"
                        : SKILLS_OPTIONS
                            .filter((s) => selectedSkills.includes(s.value))
                            .map((s) => s.label)
                            .join(", ")}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-36 p-0" align="start" onWheelCapture={(e) => e.stopPropagation()} onTouchMoveCapture={(e) => e.stopPropagation()}>
                  <ScrollArea className="h-32 touch-pan-y">
                    <div className="p-1">
                      {SKILLS_OPTIONS.map((skill) => {
                        const selected = selectedSkills.includes(skill.value);
                        return (
                          <button
                            key={skill.value}
                            type="button"
                            onClick={() => {
                              setSelectedSkills(
                                selected
                                  ? selectedSkills.filter((s) => s !== skill.value)
                                  : [...selectedSkills, skill.value],
                              );
                            }}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors",
                              "hover:bg-muted-foreground/10",
                              selected && "bg-foreground/10 font-medium",
                            )}
                          >
                            <span className="truncate">{skill.label}</span>
                            {selected ? <Check className="h-4 w-4" /> : <span className="h-4 w-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm">Ajouter</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
