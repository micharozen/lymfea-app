import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Phone,
  Mail,
  Building2,
  Calendar,
  Clock,
  DoorOpen,
  User,
  Euro,
  Timer,
  MessageSquare,
  ArrowRight,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import CreateBookingFromRequestDialog from "./CreateBookingFromRequestDialog";

interface TreatmentRequest {
  id: string;
  hotel_id: string;
  treatment_id: string | null;
  client_first_name: string;
  client_last_name: string | null;
  client_phone: string;
  client_email: string | null;
  room_number: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  description: string | null;
  quoted_price: number | null;
  quoted_duration: number | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  converted_booking_id: string | null;
}

interface TreatmentRequestDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: TreatmentRequest | null;
  onUpdate: () => void;
}

export default function TreatmentRequestDetailDialog({
  open,
  onOpenChange,
  request,
  onUpdate,
}: TreatmentRequestDetailDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [quotedPrice, setQuotedPrice] = useState<string>("");
  const [quotedDuration, setQuotedDuration] = useState<string>("");
  const [adminNotes, setAdminNotes] = useState<string>("");
  const [isCreateBookingOpen, setIsCreateBookingOpen] = useState(false);

  // Reset form when request changes
  useEffect(() => {
    if (request) {
      setQuotedPrice(request.quoted_price?.toString() || "");
      setQuotedDuration(request.quoted_duration?.toString() || "");
      setAdminNotes(request.admin_notes || "");
    }
  }, [request]);

  const { data: hotel } = useQuery({
    queryKey: ["hotel", request?.hotel_id],
    queryFn: async () => {
      if (!request?.hotel_id) return null;
      const { data, error } = await supabase
        .from("hotels")
        .select("*")
        .eq("id", request.hotel_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!request?.hotel_id,
  });

  const { data: treatment } = useQuery({
    queryKey: ["treatment", request?.treatment_id],
    queryFn: async () => {
      if (!request?.treatment_id) return null;
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("*")
        .eq("id", request.treatment_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!request?.treatment_id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<TreatmentRequest>) => {
      if (!request) return;
      const { error } = await supabase
        .from("treatment_requests")
        .update(data)
        .eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Demande mise à jour",
        description: "Les modifications ont été enregistrées.",
      });
      onUpdate();
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour la demande.",
        variant: "destructive",
      });
    },
  });

  const handleSaveQuote = () => {
    updateMutation.mutate({
      quoted_price: quotedPrice ? parseFloat(quotedPrice) : null,
      quoted_duration: quotedDuration ? parseInt(quotedDuration) : null,
      admin_notes: adminNotes || null,
      status: "quoted",
    });
  };

  const handleReject = () => {
    updateMutation.mutate({
      status: "rejected",
      admin_notes: adminNotes || null,
    });
    onOpenChange(false);
  };

  const handleConvertSuccess = (bookingId: string) => {
    updateMutation.mutate({
      status: "converted",
      converted_booking_id: bookingId,
    });
    setIsCreateBookingOpen(false);
    onOpenChange(false);
    navigate(`/admin/bookings?bookingId=${bookingId}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-warning/10 text-warning border-warning/30">En attente</Badge>;
      case "quoted":
        return <Badge className="bg-info/10 text-info border-info/30">Devis envoyé</Badge>;
      case "converted":
        return <Badge className="bg-success/10 text-success border-success/30">Converti</Badge>;
      case "rejected":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Rejeté</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!request) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Demande On Request</span>
              {getStatusBadge(request.status)}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Client Info */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Informations Client
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {request.client_first_name} {request.client_last_name || ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={`tel:${request.client_phone}`}
                    className="text-primary hover:underline"
                  >
                    {request.client_phone}
                  </a>
                </div>
                {request.client_email && (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`mailto:${request.client_email}`}
                      className="text-primary hover:underline truncate"
                    >
                      {request.client_email}
                    </a>
                  </div>
                )}
                {request.room_number && (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <DoorOpen className="h-4 w-4 text-muted-foreground" />
                    <span>Chambre {request.room_number}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Request Details */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Détails de la demande
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{hotel?.name || request.hotel_id}</span>
                </div>
                {treatment && (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <span className="font-medium">Soin demandé:</span>
                    <span>{treatment.name}</span>
                  </div>
                )}
                {request.preferred_date && (
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(new Date(request.preferred_date), "EEEE d MMMM yyyy", { locale: fr })}
                    </span>
                    {request.preferred_time && (
                      <>
                        <Clock className="h-4 w-4 text-muted-foreground ml-2" />
                        <span>{request.preferred_time}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              {request.description && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium mb-1">Description du besoin:</p>
                      <p className="text-sm text-muted-foreground">{request.description}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Quote Section */}
            {request.status !== "converted" && request.status !== "rejected" && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Devis
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="quotedPrice" className="flex items-center gap-1">
                      <Euro className="h-4 w-4" />
                      Prix proposé (€)
                    </Label>
                    <Input
                      id="quotedPrice"
                      type="number"
                      min="0"
                      step="1"
                      value={quotedPrice}
                      onChange={(e) => setQuotedPrice(e.target.value)}
                      placeholder="Ex: 150"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quotedDuration" className="flex items-center gap-1">
                      <Timer className="h-4 w-4" />
                      Durée estimée (min)
                    </Label>
                    <Input
                      id="quotedDuration"
                      type="number"
                      min="0"
                      step="15"
                      value={quotedDuration}
                      onChange={(e) => setQuotedDuration(e.target.value)}
                      placeholder="Ex: 90"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminNotes">Notes internes</Label>
                  <Textarea
                    id="adminNotes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Notes pour l'équipe..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="text-xs text-muted-foreground">
              <p>
                Créé le{" "}
                {format(new Date(request.created_at), "dd/MM/yyyy à HH:mm", { locale: fr })}
              </p>
              {request.updated_at !== request.created_at && (
                <p>
                  Modifié le{" "}
                  {format(new Date(request.updated_at), "dd/MM/yyyy à HH:mm", { locale: fr })}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {request.status !== "converted" && request.status !== "rejected" && (
              <>
                <Button
                  variant="outline"
                  onClick={handleReject}
                  disabled={updateMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4 mr-2" />
                  Rejeter
                  {updateMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSaveQuote}
                  disabled={updateMutation.isPending}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Enregistrer le devis
                  {updateMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
                <Button
                  onClick={() => setIsCreateBookingOpen(true)}
                  disabled={updateMutation.isPending}
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Convertir en réservation
                  {updateMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Booking Dialog */}
      <CreateBookingFromRequestDialog
        open={isCreateBookingOpen}
        onOpenChange={setIsCreateBookingOpen}
        request={request}
        quotedPrice={quotedPrice ? parseFloat(quotedPrice) : null}
        quotedDuration={quotedDuration ? parseInt(quotedDuration) : null}
        onSuccess={handleConvertSuccess}
      />
    </>
  );
}
