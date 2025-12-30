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
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import * as z from "zod";

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
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un coiffeur</DialogTitle>
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

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country_code">Code pays</Label>
              <Input
                id="country_code"
                value={formData.country_code}
                onChange={(e) =>
                  setFormData({ ...formData, country_code: e.target.value })
                }
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="phone">Téléphone *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Hôtels</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span>
                    {selectedHotels.length === 0
                      ? "Sélectionner des hôtels"
                      : `${selectedHotels.length} hôtel(s) sélectionné(s)`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <div className="max-h-80 overflow-y-auto p-3 space-y-2">
                  {hotels.map((hotel) => (
                    <div
                      key={hotel.id}
                      className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md transition-colors"
                    >
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={hotel.image || ""} alt={hotel.name} />
                        <AvatarFallback>{hotel.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <Label htmlFor={`hotel-${hotel.id}`} className="flex-1 cursor-pointer font-normal">
                        {hotel.name}
                      </Label>
                      <Checkbox
                        id={`hotel-${hotel.id}`}
                        checked={selectedHotels.includes(hotel.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedHotels([...selectedHotels, hotel.id]);
                          } else {
                            setSelectedHotels(
                              selectedHotels.filter((id) => id !== hotel.id)
                            );
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Trunk (Malle)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span>
                    {selectedTrunks.length === 0
                      ? "Sélectionner des trunks"
                      : `${selectedTrunks.length} trunk(s) sélectionné(s)`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0" align="start">
                <div className="max-h-60 overflow-y-auto p-3 space-y-2">
                  {TRUNKS_OPTIONS.map((trunk) => (
                    <div
                      key={trunk.value}
                      className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md transition-colors"
                    >
                      <Label htmlFor={`trunk-${trunk.value}`} className="flex-1 cursor-pointer font-normal">
                        {trunk.label}
                      </Label>
                      <Checkbox
                        id={`trunk-${trunk.value}`}
                        checked={selectedTrunks.includes(trunk.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTrunks([...selectedTrunks, trunk.value]);
                          } else {
                            setSelectedTrunks(
                              selectedTrunks.filter((t) => t !== trunk.value)
                            );
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Compétences</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  <span>
                    {selectedSkills.length === 0
                      ? "Sélectionner des compétences"
                      : `${selectedSkills.length} compétence(s) sélectionnée(s)`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[350px] p-0" align="start">
                <div className="p-3 space-y-2">
                  {SKILLS_OPTIONS.map((skill) => (
                    <div
                      key={skill.value}
                      className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md transition-colors"
                    >
                      <div className="text-2xl">{skill.label.split(" ")[0]}</div>
                      <Label htmlFor={`skill-${skill.value}`} className="flex-1 cursor-pointer font-normal">
                        {skill.label.split(" ").slice(1).join(" ")}
                      </Label>
                      <Checkbox
                        id={`skill-${skill.value}`}
                        checked={selectedSkills.includes(skill.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSkills([...selectedSkills, skill.value]);
                          } else {
                            setSelectedSkills(
                              selectedSkills.filter((s) => s !== skill.value)
                            );
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
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
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit">Ajouter</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
