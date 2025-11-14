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
    hotel_id: string | null;
    boxes_list: string | null;
    status: string;
    skills: string[];
    rating: number | null;
  };
  onSuccess: () => void;
}

interface Hotel {
  id: string;
  name: string;
}

export default function EditHairDresserDialog({
  open,
  onOpenChange,
  hairdresser,
  onSuccess,
}: EditHairDresserDialogProps) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [formData, setFormData] = useState({
    first_name: hairdresser.first_name,
    last_name: hairdresser.last_name,
    email: hairdresser.email,
    country_code: hairdresser.country_code,
    phone: hairdresser.phone,
    hotel_id: hairdresser.hotel_id || "",
    boxes_list: hairdresser.boxes_list || "",
    status: hairdresser.status,
    rating: hairdresser.rating?.toString() || "",
  });
  const [skills, setSkills] = useState({
    men: hairdresser.skills?.includes("men") || false,
    women: hairdresser.skills?.includes("women") || false,
    barber: hairdresser.skills?.includes("barber") || false,
    beauty: hairdresser.skills?.includes("beauty") || false,
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
        hotel_id: hairdresser.hotel_id || "",
        boxes_list: hairdresser.boxes_list || "",
        status: hairdresser.status,
        rating: hairdresser.rating?.toString() || "",
      });
      setSkills({
        men: hairdresser.skills?.includes("men") || false,
        women: hairdresser.skills?.includes("women") || false,
        barber: hairdresser.skills?.includes("barber") || false,
        beauty: hairdresser.skills?.includes("beauty") || false,
      });
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

    const selectedSkills = Object.entries(skills)
      .filter(([_, value]) => value)
      .map(([key, _]) => key);

    const { error } = await supabase
      .from("hairdressers")
      .update({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        country_code: formData.country_code,
        phone: formData.phone,
        hotel_id: formData.hotel_id || null,
        boxes_list: formData.boxes_list || null,
        status: formData.status,
        skills: selectedSkills,
        rating: formData.rating ? parseInt(formData.rating) : null,
      })
      .eq("id", hairdresser.id);

    if (error) {
      toast.error("Erreur lors de la modification du coiffeur");
      return;
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
            <Label htmlFor="hotel_id">Hôtel</Label>
            <Select
              value={formData.hotel_id}
              onValueChange={(value) =>
                setFormData({ ...formData, hotel_id: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un hôtel" />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="boxes_list">Boxes list</Label>
            <Input
              id="boxes_list"
              value={formData.boxes_list}
              onChange={(e) =>
                setFormData({ ...formData, boxes_list: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Compétences</Label>
            <div className="flex flex-wrap gap-4">
              {Object.entries(skills).map(([skill, checked]) => (
                <div key={skill} className="flex items-center space-x-2">
                  <Checkbox
                    id={skill}
                    checked={checked}
                    onCheckedChange={(checked) =>
                      setSkills({ ...skills, [skill]: checked === true })
                    }
                  />
                  <Label htmlFor={skill} className="cursor-pointer">
                    {skill === "men" && "👨 Men"}
                    {skill === "women" && "👩 Women"}
                    {skill === "barber" && "💈 Barber"}
                    {skill === "beauty" && "💅 Beauty"}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <Label htmlFor="rating">Note</Label>
              <Input
                id="rating"
                type="number"
                min="1"
                max="5"
                value={formData.rating}
                onChange={(e) =>
                  setFormData({ ...formData, rating: e.target.value })
                }
              />
            </div>
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
