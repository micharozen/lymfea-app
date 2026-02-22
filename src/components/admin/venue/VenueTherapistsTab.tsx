import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { MultiSelectPopover } from "@/components/MultiSelectPopover";
import { toast } from "sonner";
import { Plus, X, Loader2, UserPlus } from "lucide-react";

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

const SKILLS_OPTIONS = [
  { value: "men", label: "👨 Hommes" },
  { value: "women", label: "👩 Femmes" },
  { value: "barber", label: "💈 Barbier" },
  { value: "beauty", label: "💅 Beauté" },
];

interface VenueTherapistsTabProps {
  hotelId: string;
}

export function VenueTherapistsTab({ hotelId }: VenueTherapistsTabProps) {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedAssignIds, setSelectedAssignIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    country_code: "+33",
    phone: "",
  });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const {
    url: profileImage,
    setUrl: setProfileImage,
    uploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload();

  // Fetch assigned therapists
  const { data: assignedTherapists = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ["venue-therapists", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("therapist_venues")
        .select("hotel_id, therapist_id, therapists(*)")
        .eq("hotel_id", hotelId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((row: any) => row.therapists).filter(Boolean);
    },
  });

  // Fetch all therapists
  const { data: allTherapists = [] } = useQuery({
    queryKey: ["all-therapists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("therapists")
        .select("id, first_name, last_name, email, profile_image, skills")
        .order("first_name");
      if (error) throw error;
      return data;
    },
  });

  // Therapists not yet assigned to this venue
  const assignedIds = new Set(assignedTherapists.map((t: any) => t.id));
  const unassignedTherapists = allTherapists.filter((t) => !assignedIds.has(t.id));

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["venue-therapists", hotelId] });
    queryClient.invalidateQueries({ queryKey: ["all-therapists"] });
  };

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async (therapistIds: string[]) => {
      const rows = therapistIds.map((therapist_id) => ({
        therapist_id,
        hotel_id: hotelId,
      }));
      const { error } = await supabase.from("therapist_venues").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries();
      setSelectedAssignIds([]);
      toast.success("Thérapeute(s) assigné(s)");
    },
    onError: () => {
      toast.error("Erreur lors de l'assignation");
    },
  });

  // Unassign mutation
  const unassignMutation = useMutation({
    mutationFn: async (therapistId: string) => {
      const { error } = await supabase
        .from("therapist_venues")
        .delete()
        .eq("therapist_id", therapistId)
        .eq("hotel_id", hotelId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateQueries();
      toast.success("Thérapeute désassigné");
    },
    onError: () => {
      toast.error("Erreur lors de la désassignation");
    },
  });

  // Create & assign mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      // Insert therapist
      const { data: therapist, error } = await supabase
        .from("therapists")
        .insert({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          country_code: formData.country_code,
          phone: formData.phone,
          status: "pending",
          skills: selectedSkills,
          profile_image: profileImage || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Assign to venue
      const { error: relError } = await supabase
        .from("therapist_venues")
        .insert({ therapist_id: therapist.id, hotel_id: hotelId });

      if (relError) throw relError;

      // Send invite email
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const response = await fetch(`${supabaseUrl}/functions/v1/invite-therapist`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({
              therapistId: therapist.id,
              email: formData.email,
              firstName: formData.first_name,
              lastName: formData.last_name,
              phone: formData.phone,
              countryCode: formData.country_code,
              hotelIds: [hotelId],
            }),
          });
          if (!response.ok) {
            toast.warning("Thérapeute créé mais l'invitation email a échoué");
          }
        }
      } catch {
        toast.warning("Thérapeute créé mais l'invitation email a échoué");
      }

      return therapist;
    },
    onSuccess: () => {
      invalidateQueries();
      resetCreateForm();
      toast.success("Thérapeute créé et assigné");
    },
    onError: () => {
      toast.error("Erreur lors de la création");
    },
  });

  const resetCreateForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      country_code: "+33",
      phone: "",
    });
    setSelectedSkills([]);
    setProfileImage("");
    setShowCreateForm(false);
  };

  const handleCreate = () => {
    if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim()) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Assigned therapists list */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Thérapeutes assignés ({assignedTherapists.length})
        </h3>
        {loadingAssigned ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : assignedTherapists.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Aucun thérapeute assigné</p>
        ) : (
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {assignedTherapists.map((therapist: any) => (
              <div
                key={therapist.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-card"
              >
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarImage src={therapist.profile_image || undefined} />
                  <AvatarFallback className="text-xs">
                    {therapist.first_name?.[0]}{therapist.last_name?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {therapist.first_name} {therapist.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{therapist.email}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {(therapist.skills || []).map((skill: string) => {
                    const opt = SKILLS_OPTIONS.find((s) => s.value === skill);
                    return (
                      <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {opt?.label || skill}
                      </Badge>
                    );
                  })}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => unassignMutation.mutate(therapist.id)}
                  title="Désassigner"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign existing therapists */}
      {unassignedTherapists.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Assigner des thérapeutes existants
          </h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <MultiSelectPopover
                placeholder="Sélectionner des thérapeutes"
                selected={selectedAssignIds}
                onChange={setSelectedAssignIds}
                options={unassignedTherapists.map((t) => ({
                  value: t.id,
                  label: `${t.first_name} ${t.last_name}`,
                }))}
                popoverWidthClassName="w-64"
                popoverMaxHeightClassName="h-48"
              />
            </div>
            <Button
              size="sm"
              disabled={selectedAssignIds.length === 0 || assignMutation.isPending}
              onClick={() => assignMutation.mutate(selectedAssignIds)}
              className="bg-foreground text-background hover:bg-foreground/90"
            >
              {assignMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Assigner
            </Button>
          </div>
        </div>
      )}

      {/* Create new therapist */}
      <div>
        {!showCreateForm ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Créer un nouveau thérapeute
          </Button>
        ) : (
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Nouveau thérapeute
            </h3>

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
                onClick={triggerFileSelect}
                disabled={uploading}
              >
                {uploading ? "Téléchargement..." : "Photo"}
                {uploading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Prénom *</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nom *</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Téléphone</Label>
              <PhoneNumberField
                value={formData.phone}
                onChange={(value) => setFormData({ ...formData, phone: value })}
                countryCode={formData.country_code}
                setCountryCode={(value) => setFormData({ ...formData, country_code: value })}
                countries={countries}
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

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetCreateForm}>
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Créer et assigner
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
