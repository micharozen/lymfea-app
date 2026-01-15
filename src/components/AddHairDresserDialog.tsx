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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { MultiSelectPopover } from "@/components/MultiSelectPopover";
import { toast } from "sonner";
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
  const [trunks, setTrunks] = useState<Trunk[]>([]);
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
      fetchTrunks();
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

  const fetchTrunks = async () => {
    const { data, error } = await supabase
      .from("trunks")
      .select("id, name, trunk_id, image")
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des trunks");
      return;
    }

    setTrunks(data || []);
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
      // Get the current session to ensure we have a valid user token
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        console.error("No valid session found:", sessionError);
        toast.warning("Coiffeur ajouté mais l'email de bienvenue n'a pas pu être envoyé (session expirée)");
      } else {
        const accessToken = sessionData.session.access_token;
        console.log("Session found, access token present:", !!accessToken);
        console.log("User ID:", sessionData.session.user?.id);

        // Call the Edge Function directly with fetch to have more control
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(`${supabaseUrl}/functions/v1/invite-hairdresser`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            hairdresserId: hairdresser.id,
            email: formData.email,
            firstName: formData.first_name,
            lastName: formData.last_name,
            phone: formData.phone,
            countryCode: formData.country_code,
            hotelIds: selectedHotels,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error("Error sending welcome email:", response.status, errorData);
          toast.warning("Coiffeur ajouté mais l'email de bienvenue n'a pas pu être envoyé");
        } else {
          toast.success("Coiffeur ajouté et email de bienvenue envoyé");
        }
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
              <MultiSelectPopover
                selected={selectedHotels}
                onChange={setSelectedHotels}
                options={hotels.map((h) => ({ value: h.id, label: h.name }))}
                popoverWidthClassName="w-48"
                popoverMaxHeightClassName="h-40"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Trunk</Label>
              <MultiSelectPopover
                selected={selectedTrunks}
                onChange={setSelectedTrunks}
                options={trunks.map((t) => ({ value: t.id, label: t.name }))}
                popoverWidthClassName="w-48"
                popoverMaxHeightClassName="h-40"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Compétences</Label>
              <MultiSelectPopover
                selected={selectedSkills}
                onChange={setSelectedSkills}
                options={SKILLS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                popoverWidthClassName="w-36"
                popoverMaxHeightClassName="h-32"
              />
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
