import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/hooks/useFileUpload";
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
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MinimumGuaranteeEditor } from "@/components/admin/MinimumGuaranteeEditor";

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

interface EditTherapistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  therapist: {
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
    minimum_guarantee?: Record<string, number> | null;
    therapist_venues?: { hotel_id: string }[];
  };
  onSuccess: () => void;
}

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface TreatmentRoom {
  id: string;
  name: string;
  room_number: string;
  image: string | null;
}

const SKILLS_OPTIONS = [
  { value: "men", label: "👨 Hommes" },
  { value: "women", label: "👩 Femmes" },
  { value: "barber", label: "💈 Barbier" },
  { value: "beauty", label: "💅 Beauté" },
];

export default function EditTherapistDialog({
  open,
  onOpenChange,
  therapist,
  onSuccess,
}: EditTherapistDialogProps) {
  const { t } = useTranslation('common');
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [rooms, setRooms] = useState<TreatmentRoom[]>([]);
  const [selectedHotels, setSelectedHotels] = useState<string[]>(
    therapist.therapist_venues?.map((hh) => hh.hotel_id) || []
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    therapist.skills || []
  );
  const [minimumGuarantee, setMinimumGuarantee] = useState<Record<string, number>>(
    (therapist.minimum_guarantee as Record<string, number>) || {}
  );
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const {
    url: profileImage,
    setUrl: setProfileImage,
    uploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload({ initialUrl: therapist.profile_image || "" });
  const [formData, setFormData] = useState({
    first_name: therapist.first_name,
    last_name: therapist.last_name,
    email: therapist.email,
    country_code: therapist.country_code,
    phone: therapist.phone,
    status: therapist.status,
  });

  useEffect(() => {
    if (open) {
      fetchHotels();
      fetchRooms();
      setFormData({
        first_name: therapist.first_name,
        last_name: therapist.last_name,
        email: therapist.email,
        country_code: therapist.country_code,
        phone: therapist.phone,
        status: therapist.status,
      });
      setSelectedHotels(
        therapist.therapist_venues?.map((hh) => hh.hotel_id) || []
      );
      setSelectedSkills(therapist.skills || []);
      setMinimumGuarantee((therapist.minimum_guarantee as Record<string, number>) || {});
      // Parse room IDs from stored string (now stores real room IDs)
      setSelectedRooms(
        therapist.trunks ? therapist.trunks.split(", ").filter(t => t.length > 0) : []
      );
      setProfileImage(therapist.profile_image);
    }
  }, [open, therapist]);

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

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from("treatment_rooms")
      .select("id, name, room_number, image")
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des salles de soin");
      return;
    }

    const list = data || [];
    setRooms(list);
    // Remove any legacy/unknown room values that might still be stored on the therapist
    setSelectedRooms((prev) => prev.filter((id) => list.some((r) => r.id === id)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validSelectedRooms = selectedRooms.filter((id) => rooms.some((r) => r.id === id));

    const { error } = await supabase
      .from("therapists")
      .update({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        country_code: formData.country_code,
        phone: formData.phone,
        trunks: validSelectedRooms.join(", ") || null,
        status: formData.status,
        skills: selectedSkills,
        profile_image: profileImage,
        minimum_guarantee: Object.keys(minimumGuarantee).length > 0 ? minimumGuarantee : null,
      })
      .eq("id", therapist.id);

    if (error) {
      toast.error("Erreur lors de la modification du thérapeute");
      return;
    }

    // Delete existing hotel relationships
    await supabase
      .from("therapist_venues")
      .delete()
      .eq("therapist_id", therapist.id);

    // Insert new hotel relationships
    if (selectedHotels.length > 0) {
      const hotelRelations = selectedHotels.map((hotelId) => ({
        therapist_id: therapist.id,
        hotel_id: hotelId,
      }));

      const { error: relationError } = await supabase
        .from("therapist_venues")
        .insert(hotelRelations);

      if (relationError) {
        toast.error("Erreur lors de l'association des hôtels");
        return;
      }
    }

    toast.success("Thérapeute modifié avec succès");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le thérapeute</DialogTitle>
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
                onClick={triggerFileSelect}
                disabled={uploading}
              >
                {uploading ? "Téléchargement..." : "Télécharger une image"}
                {uploading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
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
            <Label>Salle de soin</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground"
                >
                  <span className="truncate">
                    {(() => {
                      const validRooms = rooms.filter((r) => selectedRooms.includes(r.id));
                      return validRooms.length === 0
                        ? "Sélectionner des salles"
                        : validRooms.map((r) => r.name).join(", ");
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
                    {rooms.map((room) => {
                      const isSelected = selectedRooms.includes(room.id);
                      return (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedRooms(selectedRooms.filter((r) => r !== room.id));
                            } else {
                              setSelectedRooms([...selectedRooms, room.id]);
                            }
                          }}
                          className="w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-foreground/5"
                        >
                          <span className="min-w-0 truncate text-left">{room.name}</span>
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
            <Label>{t('admin:therapists.minimumGuarantee', 'Minimum garanti')}</Label>
            <p className="text-xs text-muted-foreground">{t('admin:therapists.minimumGuaranteeDesc', 'Nombre minimum de soins quotidiens garantis par jour')}</p>
            <MinimumGuaranteeEditor
              value={minimumGuarantee}
              onChange={setMinimumGuarantee}
            />
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
                <SelectItem value="active">{t('status.active')}</SelectItem>
                <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
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
