import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Save, Pencil } from "lucide-react";
import { TreatmentRoomGeneralTab } from "@/components/admin/treatment-room/TreatmentRoomGeneralTab";
import { TreatmentRoomPlanningTab } from "@/components/admin/treatment-room/TreatmentRoomPlanningTab";

const generateRoomNumber = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "ROOM-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const createFormSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, t("errors.validation.nameRequired")),
    capabilities: z
      .array(z.string())
      .min(1, "Sélectionnez au moins un type de soin"),
    hotel_id: z.string().optional(),
    status: z.string().default("active"),
  });

export type TreatmentRoomFormValues = z.infer<
  ReturnType<typeof createFormSchema>
>;

export default function TreatmentRoomDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const isNewMode = !id;
  const [savedRoomId, setSavedRoomId] = useState<string | null>(id || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [roomName, setRoomName] = useState("");
  const [isEditingState, setIsEditingState] = useState(false);
  const isEditing = isNewMode || isEditingState;

  const {
    url: roomImage,
    setUrl: setRoomImage,
    uploading: isUploading,
    fileInputRef,
    handleUpload: handleImageUpload,
    triggerFileSelect,
  } = useFileUpload({ path: "treatment-rooms/" });

  const form = useForm<TreatmentRoomFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      capabilities: [],
      hotel_id: "",
      status: "active",
    },
  });

  const { data: hotels } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const loadRoomData = useCallback(
    async (roomId: string) => {
      setLoading(true);
      try {
        const { data: room, error } = await supabase
          .from("treatment_rooms")
          .select("*")
          .eq("id", roomId)
          .single();

        if (error) throw error;

        if (room) {
          // Parse capabilities: use new field if available, fallback to room_type
          const capabilities = (room as any).capabilities?.length
            ? (room as any).capabilities
            : room.room_type
              ? [room.room_type]
              : [];

          form.reset({
            name: room.name || "",
            capabilities,
            hotel_id: room.hotel_id || "",
            status: room.status || "active",
          });

          setRoomImage(room.image || "");
          setRoomName(room.name || "");
        }
      } catch (error) {
        console.error("Error loading room data:", error);
        toast.error("Erreur lors du chargement de la salle");
      } finally {
        setLoading(false);
      }
    },
    [form, setRoomImage]
  );

  useEffect(() => {
    if (id) {
      loadRoomData(id);
    }
  }, [id, loadRoomData]);

  const handleSave = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      setActiveTab("general");
      return;
    }

    setSaving(true);
    try {
      const values = form.getValues();
      const selectedHotel = hotels?.find((h) => h.id === values.hotel_id);

      const roomPayload = {
        name: values.name,
        room_type: values.capabilities[0] || "Multi-purpose",
        capabilities: values.capabilities,
        hotel_id: values.hotel_id || null,
        hotel_name: selectedHotel?.name || null,
        image: roomImage || null,
        status: values.status,
      };

      if (isNewMode && !savedRoomId) {
        // INSERT
        const { data: newRoom, error } = await supabase
          .from("treatment_rooms")
          .insert({
            ...roomPayload,
            room_number: generateRoomNumber(),
          })
          .select("id")
          .single();

        if (error || !newRoom) throw error;

        setSavedRoomId(newRoom.id);
        setRoomName(values.name);
        toast.success("Salle créée avec succès");
        navigate(`/admin/treatment-rooms/${newRoom.id}`, { replace: true });
      } else {
        // UPDATE
        const targetId = savedRoomId || id!;

        const { error } = await supabase
          .from("treatment_rooms")
          .update(roomPayload)
          .eq("id", targetId);

        if (error) throw error;

        setRoomName(values.name);
        toast.success("Salle mise à jour avec succès");
        setIsEditingState(false);
      }
    } catch (error: any) {
      console.error("Error saving room:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = async () => {
    if (id) {
      await loadRoomData(id);
    }
    setIsEditingState(false);
  };

  const effectiveRoomId = savedRoomId || id || null;
  const canAccessTabs = !!effectiveRoomId;

  const watchedName = form.watch("name");

  return (
    <div className="bg-background">
      {/* Header — sticky */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin/treatment-rooms")}
              className="flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
            <div className="h-5 w-px bg-border flex-shrink-0" />
            <h1 className="text-lg font-semibold truncate">
              {isNewMode && !savedRoomId
                ? "Nouvelle salle"
                : watchedName || roomName || "Salle"}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isNewMode ? (
              <Button
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer
              </Button>
            ) : isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Enregistrer
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => setIsEditingState(true)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Modifier
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 flex-1">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="px-4 md:px-6 pt-4 bg-background sticky top-[57px] z-[9]">
            <TabsList className="w-full justify-start overflow-x-auto bg-transparent rounded-none border-b p-0 h-auto">
              <TabsTrigger
                value="general"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                Général
              </TabsTrigger>
              <TabsTrigger
                value="planning"
                disabled={!canAccessTabs}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
              >
                Planning
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="px-4 md:px-6 py-4">
            <Form {...form}>
              <form onSubmit={(e) => e.preventDefault()}>
                <TabsContent value="general" className="mt-0">
                  <TreatmentRoomGeneralTab
                    form={form}
                    disabled={!isEditing}
                    roomImage={roomImage}
                    isUploading={isUploading}
                    fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
                    handleImageUpload={handleImageUpload}
                    triggerFileSelect={triggerFileSelect}
                  />
                </TabsContent>
              </form>
            </Form>

            <TabsContent value="planning" className="mt-0">
              {canAccessTabs ? (
                <TreatmentRoomPlanningTab roomId={effectiveRoomId!} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Enregistrez la salle pour accéder au planning
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}
