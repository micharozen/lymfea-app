import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface CreateBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
  selectedTime?: string;
}

export default function CreateBookingDialog({
  open,
  onOpenChange,
  selectedDate,
  selectedTime,
}: CreateBookingDialogProps) {
  const queryClient = useQueryClient();
  const [hotelId, setHotelId] = useState("");
  const [clientFirstName, setClientFirstName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [date, setDate] = useState(selectedDate ? format(selectedDate, "yyyy-MM-dd") : "");
  const [time, setTime] = useState(selectedTime || "");

  // Update date and time when props change
  useEffect(() => {
    if (selectedDate) {
      setDate(format(selectedDate, "yyyy-MM-dd"));
    }
    if (selectedTime) {
      setTime(selectedTime);
    }
  }, [selectedDate, selectedTime]);

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

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const hotel = hotels?.find((h) => h.id === data.hotelId);
      
      const { error } = await supabase.from("bookings").insert({
        hotel_id: data.hotelId,
        hotel_name: hotel?.name || "",
        client_first_name: data.clientFirstName,
        client_last_name: data.clientLastName,
        phone: data.phone,
        room_number: data.roomNumber,
        booking_date: data.date,
        booking_time: data.time,
        status: "Assigned",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Réservation créée",
        description: "La réservation a été créée avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la création de la réservation.",
        variant: "destructive",
      });
      console.error("Error creating booking:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!hotelId || !clientFirstName || !clientLastName || !phone || !date || !time) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      hotelId,
      clientFirstName,
      clientLastName,
      phone,
      roomNumber,
      date,
      time,
    });
  };

  const handleClose = () => {
    setHotelId("");
    setClientFirstName("");
    setClientLastName("");
    setPhone("");
    setRoomNumber("");
    setDate(selectedDate ? format(selectedDate, "yyyy-MM-dd") : "");
    setTime(selectedTime || "");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Créer une réservation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hotel">Hôtel *</Label>
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un hôtel" />
              </SelectTrigger>
              <SelectContent>
                {hotels?.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom *</Label>
              <Input
                id="firstName"
                value={clientFirstName}
                onChange={(e) => setClientFirstName(e.target.value)}
                placeholder="Prénom"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom *</Label>
              <Input
                id="lastName"
                value={clientLastName}
                onChange={(e) => setClientLastName(e.target.value)}
                placeholder="Nom"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone *</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+33 6 14 21 64 42"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="room">Numéro de chambre</Label>
            <Input
              id="room"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="1002"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Heure *</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Création..." : "Créer la réservation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
