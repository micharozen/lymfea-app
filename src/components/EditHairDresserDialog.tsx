import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

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
    boxes: string | null;
    status: string;
    skills: string[];
    hairdresser_hotels?: { hotel_id: string }[];
  };
  onSuccess: () => void;
}

interface Hotel {
  id: string;
  name: string;
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
  const [selectedHotels, setSelectedHotels] = useState<string[]>(
    hairdresser.hairdresser_hotels?.map((hh) => hh.hotel_id) || []
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    hairdresser.skills || []
  );
  const [formData, setFormData] = useState({
    first_name: hairdresser.first_name,
    last_name: hairdresser.last_name,
    email: hairdresser.email,
    country_code: hairdresser.country_code,
    phone: hairdresser.phone,
    boxes: hairdresser.boxes || "",
    status: hairdresser.status,
  });

  useEffect(() => {
    if (open) {
      fetchHotels();
      setFormData({
        first_name: hairdresser.first_name,
        last_name: hairdresser.last_name,
        email: hairdresser.email,
        country_code: hairdresser.country_code,
        phone: hairdresser.phone,
        boxes: hairdresser.boxes || "",
        status: hairdresser.status,
      });
      setSelectedHotels(
        hairdresser.hairdresser_hotels?.map((hh) => hh.hotel_id) || []
      );
      setSelectedSkills(hairdresser.skills || []);
    }
  }, [open, hairdresser]);

  const fetchHotels = async () => {
    const { data, error } = await supabase
      .from("hotels")
      .select("id, name")
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des hôtels");
      return;
    }

    setHotels(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase
      .from("hairdressers")
      .update({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        country_code: formData.country_code,
        phone: formData.phone,
        boxes: formData.boxes || null,
        status: formData.status,
        skills: selectedSkills,
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
            <div className="border rounded-md p-3 space-y-2">
              {hotels.map((hotel) => (
                <div key={hotel.id} className="flex items-center space-x-2">
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
                  <Label htmlFor={`hotel-${hotel.id}`} className="cursor-pointer">
                    {hotel.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="boxes">Box</Label>
            <Input
              id="boxes"
              value={formData.boxes}
              onChange={(e) =>
                setFormData({ ...formData, boxes: e.target.value })
              }
              placeholder="Ex: Box 1, Box 2"
            />
          </div>

          <div className="space-y-2">
            <Label>Compétences</Label>
            <div className="border rounded-md p-3 space-y-2">
              {SKILLS_OPTIONS.map((skill) => (
                <div key={skill.value} className="flex items-center space-x-2">
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
                  <Label htmlFor={`skill-${skill.value}`} className="cursor-pointer">
                    {skill.label}
                  </Label>
                </div>
              ))}
            </div>
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
                <SelectItem value="Actif">Actif</SelectItem>
                <SelectItem value="En attente">En attente</SelectItem>
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
