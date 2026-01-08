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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface EditHairDresserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hairdresser: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    country_code: string;
    phone: string;
    trunks: string | null;
    status: string;
    skills: string[];
    profile_image: string | null;
    hairdresser_hotels?: { hotel_id: string }[];
  };
  onSuccess: () => void;
}

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface Trunk {
  id: string;
  name: string;
  trunk_id: string;
  image: string | null;
}

const SKILLS_OPTIONS = [
  { value: "men", label: "👨 Hommes" },
  { value: "women", label: "👩 Femmes" },
  { value: "barber", label: "💈 Barbier" },
  { value: "beauty", label: "💅 Beauté" },
];

export default function EditHairDresserDialog({
  open,
  onOpenChange,
  hairdresser,
  onSuccess,
}: EditHairDresserDialogProps) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [selectedHotels, setSelectedHotels] = useState<string[]>(
    hairdresser.hairdresser_hotels?.map((hh) => hh.hotel_id) || []
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    hairdresser.skills || []
  );
  const [selectedTrunks, setSelectedTrunks] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(hairdresser.profile_image);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    first_name: hairdresser.first_name,
    last_name: hairdresser.last_name,
    email: hairdresser.email,
    country_code: hairdresser.country_code,
    phone: hairdresser.phone,
    status: hairdresser.status,
  });

  useEffect(() => {
    if (open) {
      fetchHotels();
      fetchTrunks();
      setFormData({
        first_name: hairdresser.first_name,
        last_name: hairdresser.last_name,
        email: hairdresser.email,
        country_code: hairdresser.country_code,
        phone: hairdresser.phone,
        status: hairdresser.status,
      });
      setSelectedHotels(
        hairdresser.hairdresser_hotels?.map((hh) => hh.hotel_id) || []
      );
      setSelectedSkills(hairdresser.skills || []);
      // Parse trunk IDs from stored string (now stores real trunk IDs)
      setSelectedTrunks(
        hairdresser.trunks ? hairdresser.trunks.split(", ").filter(t => t.length > 0) : []
      );
      setProfileImage(hairdresser.profile_image);
    }
  }, [open, hairdresser]);

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

  const fetchTrunks = async () => {
    const { data, error } = await supabase
      .from("trunks")
      .select("id, name, trunk_id, image")
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des trunks");
      return;
    }

    const list = data || [];
    setTrunks(list);
    // Remove any legacy/unknown trunk values that might still be stored on the hairdresser
    setSelectedTrunks((prev) => prev.filter((id) => list.some((t) => t.id === id)));
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

    const validSelectedTrunks = selectedTrunks.filter((id) => trunks.some((t) => t.id === id));

    const { error } = await supabase
      .from("hairdressers")
      .update({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        country_code: formData.country_code,
        phone: formData.phone,
        trunks: validSelectedTrunks.join(", ") || null,
        status: formData.status,
        skills: selectedSkills,
        profile_image: profileImage,
      })
      .eq("id", hairdresser.id);

    if (error) {
      toast.error("Erreur lors de la modification du coiffeur");
      return;
    }

    // Delete existing hotel relationships
    await supabase
      .from("hairdresser_hotels")
      .delete()
      .eq("hairdresser_id", hairdresser.id);

    // Insert new hotel relationships
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

    toast.success("Coiffeur modifié avec succès");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le coiffeur</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Photo de profil</Label>
            <div className="flex items-center gap-3">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profileImage || ""} />
                <AvatarFallback className="bg-muted">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground">
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
                {uploading ? "Téléchargement..." : "Télécharger une image"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Prénom *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) =>
                  setFormData({ ...formData, first_name: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Nom *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) =>
                  setFormData({ ...formData, last_name: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone *</Label>
            <PhoneNumberField
              id="phone"
              value={formData.phone}
              onChange={(value) => setFormData({ ...formData, phone: value })}
              countryCode={formData.country_code}
              setCountryCode={(value) => setFormData({ ...formData, country_code: value })}
              countries={countries}
            />
          </div>

          <div className="space-y-2">
            <Label>Hôtels</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground"
                >
                  <span className="truncate">
                    {selectedHotels.length === 0
                      ? "Sélectionner des hôtels"
                      : hotels
                          .filter((h) => selectedHotels.includes(h.id))
                          .map((h) => h.name)
                          .join(", ")}
                  </span>
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
                    {hotels.map((hotel) => {
                      const isSelected = selectedHotels.includes(hotel.id);
                      return (
                        <button
                          key={hotel.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedHotels(selectedHotels.filter((id) => id !== hotel.id));
                            } else {
                              setSelectedHotels([...selectedHotels, hotel.id]);
                            }
                          }}
                          className="w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-foreground/5"
                        >
                          <span className="min-w-0 truncate text-left">{hotel.name}</span>
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
          </div>

          <div className="space-y-2">
            <Label>Trunk (Malle)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground"
                >
                  <span className="truncate">
                    {(() => {
                      const validTrunks = trunks.filter((t) => selectedTrunks.includes(t.id));
                      return validTrunks.length === 0
                        ? "Sélectionner des trunks"
                        : validTrunks.map((t) => t.name).join(", ");
                    })()}
                  </span>
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
                    {trunks.map((trunk) => {
                      const isSelected = selectedTrunks.includes(trunk.id);
                      return (
                        <button
                          key={trunk.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTrunks(selectedTrunks.filter((t) => t !== trunk.id));
                            } else {
                              setSelectedTrunks([...selectedTrunks, trunk.id]);
                            }
                          }}
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
                    })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Compétences</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground"
                >
                  <span className="truncate">
                    {selectedSkills.length === 0
                      ? "Sélectionner des compétences"
                      : SKILLS_OPTIONS
                          .filter((s) => selectedSkills.includes(s.value))
                          .map((s) => s.label)
                          .join(", ")}
                  </span>
                  <svg className="h-3 w-3 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-48 p-0"
                align="start"
                onWheelCapture={(e) => e.stopPropagation()}
                onTouchMoveCapture={(e) => e.stopPropagation()}
              >
                <ScrollArea className="h-40 touch-pan-y">
                  <div className="p-1">
                    {SKILLS_OPTIONS.map((skill) => {
                      const isSelected = selectedSkills.includes(skill.value);
                      return (
                        <button
                          key={skill.value}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSkills(selectedSkills.filter((s) => s !== skill.value));
                            } else {
                              setSelectedSkills([...selectedSkills, skill.value]);
                            }
                          }}
                          className="w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-foreground/5"
                        >
                          <span className="min-w-0 truncate text-left">{skill.label}</span>
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Statut *</Label>
            <Select
              value={formData.status}
              onValueChange={(value) =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit">Modifier</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
