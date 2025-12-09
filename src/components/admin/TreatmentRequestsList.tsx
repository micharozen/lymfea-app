import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Phone, MessageSquare, ArrowRight, Calendar, Clock, Building2, User } from "lucide-react";
import TreatmentRequestDetailDialog from "./TreatmentRequestDetailDialog";

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

export default function TreatmentRequestsList() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedRequest, setSelectedRequest] = useState<TreatmentRequest | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["treatment-requests", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("treatment_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as TreatmentRequest[];
    },
  });

  const { data: hotels = [] } = useQuery({
    queryKey: ["hotels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const { data: treatments = [] } = useQuery({
    queryKey: ["treatment_menus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("id, name");
      if (error) throw error;
      return data;
    },
  });

  const getHotelName = (hotelId: string) => {
    return hotels.find((h) => h.id === hotelId)?.name || hotelId;
  };

  const getTreatmentName = (treatmentId: string | null) => {
    if (!treatmentId) return "Non spécifié";
    return treatments.find((t) => t.id === treatmentId)?.name || "Inconnu";
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

  const handleOpenDetail = (request: TreatmentRequest) => {
    setSelectedRequest(request);
    setIsDetailDialogOpen(true);
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Demandes On Request</h2>
          {pendingCount > 0 && (
            <Badge className="bg-warning text-warning-foreground">
              {pendingCount} en attente
            </Badge>
          )}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="quoted">Devis envoyé</SelectItem>
            <SelectItem value="converted">Convertis</SelectItem>
            <SelectItem value="rejected">Rejetés</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {requests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Aucune demande {statusFilter !== "all" ? `"${statusFilter}"` : ""}</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Hôtel</TableHead>
                <TableHead>Soin demandé</TableHead>
                <TableHead>Date souhaitée</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow
                  key={request.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleOpenDetail(request)}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {request.client_first_name} {request.client_last_name || ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {request.client_phone}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{getHotelName(request.hotel_id)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{getTreatmentName(request.treatment_id)}</span>
                  </TableCell>
                  <TableCell>
                    {request.preferred_date ? (
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(request.preferred_date), "dd/MM/yyyy", { locale: fr })}
                        {request.preferred_time && (
                          <>
                            <Clock className="h-3 w-3 text-muted-foreground ml-2" />
                            {request.preferred_time}
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Non spécifié</span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(request.status)}</TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(request.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`tel:${request.client_phone}`, "_blank");
                        }}
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(request);
                        }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Dialog */}
      <TreatmentRequestDetailDialog
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        request={selectedRequest}
        onUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ["treatment-requests"] });
        }}
      />
    </div>
  );
}
