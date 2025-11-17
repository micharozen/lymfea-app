import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const countries = [
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+1", label: "USA", flag: "🇺🇸" },
  { code: "+44", label: "UK", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
];

const formatPhoneNumber = (value: string, countryCode: string): string => {
  const numbers = value.replace(/\D/g, '');
  
  switch (countryCode) {
    case "+33":
      const fr = numbers.slice(0, 10);
      if (fr.length <= 1) return fr;
      if (fr.length <= 3) return `${fr.slice(0, 1)} ${fr.slice(1)}`;
      if (fr.length <= 5) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3)}`;
      if (fr.length <= 7) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5)}`;
      if (fr.length <= 9) return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7)}`;
      return `${fr.slice(0, 1)} ${fr.slice(1, 3)} ${fr.slice(3, 5)} ${fr.slice(5, 7)} ${fr.slice(7, 9)} ${fr.slice(9, 10)}`;
      
    case "+971":
      const uae = numbers.slice(0, 9);
      if (uae.length <= 1) return uae;
      if (uae.length <= 4) return `${uae.slice(0, 1)} ${uae.slice(1)}`;
      if (uae.length <= 7) return `${uae.slice(0, 1)} ${uae.slice(1, 4)} ${uae.slice(4)}`;
      return `${uae.slice(0, 1)} ${uae.slice(1, 4)} ${uae.slice(4, 7)} ${uae.slice(7)}`;
      
    default:
      return numbers.slice(0, 15);
  }
};

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
  const [countryCode, setCountryCode] = useState("+33");
  const [countryOpen, setCountryOpen] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [date, setDate] = useState(selectedDate ? format(selectedDate, "yyyy-MM-dd") : "");
  const [time, setTime] = useState(selectedTime || "");
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);

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

  const { data: treatments } = useQuery({
    queryKey: ["treatment_menus"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_menus")
        .select("*")
        .eq("status", "Actif")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Recalculer le prix total quand les traitements changent
  useEffect(() => {
    if (treatments && selectedTreatments.length > 0) {
      const total = selectedTreatments.reduce((sum, treatmentId) => {
        const treatment = treatments.find(t => t.id === treatmentId);
        return sum + (treatment?.price || 0);
      }, 0);
      setTotalPrice(total);
    } else {
      setTotalPrice(0);
    }
  }, [selectedTreatments, treatments]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const hotel = hotels?.find((h) => h.id === data.hotelId);
      
      const { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          hotel_id: data.hotelId,
          hotel_name: hotel?.name || "",
          client_first_name: data.clientFirstName,
          client_last_name: data.clientLastName,
          phone: `${data.countryCode} ${data.phone}`,
          room_number: data.roomNumber,
          booking_date: data.date,
          booking_time: data.time,
          status: "Assigned",
          total_price: data.totalPrice,
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      // Insérer les traitements sélectionnés
      if (data.selectedTreatments.length > 0) {
        const treatmentRecords = data.selectedTreatments.map((treatmentId: string) => ({
          booking_id: bookingData.id,
          treatment_id: treatmentId,
        }));

        const { error: treatmentsError } = await supabase
          .from("booking_treatments")
          .insert(treatmentRecords);

        if (treatmentsError) throw treatmentsError;
      }
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
      countryCode,
      roomNumber,
      date,
      time,
      selectedTreatments,
      totalPrice,
    });
  };

  const handleClose = () => {
    setHotelId("");
    setClientFirstName("");
    setClientLastName("");
    setPhone("");
    setCountryCode("+33");
    setRoomNumber("");
    setDate(selectedDate ? format(selectedDate, "yyyy-MM-dd") : "");
    setTime(selectedTime || "");
    setSelectedTreatments([]);
    setTotalPrice(0);
    onOpenChange(false);
  };

  const toggleTreatment = (treatmentId: string) => {
    setSelectedTreatments(prev => 
      prev.includes(treatmentId) 
        ? prev.filter(id => id !== treatmentId)
        : [...prev, treatmentId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer une réservation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="info">Informations</TabsTrigger>
              <TabsTrigger value="prestations">Prestations</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 mt-4">
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
                <div className="flex gap-2">
                  <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={countryOpen}
                        className="w-[140px] justify-between"
                      >
                        {countries.find((country) => country.code === countryCode)?.flag}{" "}
                        {countryCode}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0">
                      <Command>
                        <CommandInput placeholder="Rechercher..." />
                        <CommandList>
                          <CommandEmpty>Aucun pays trouvé.</CommandEmpty>
                          <CommandGroup>
                            {countries.map((country) => (
                              <CommandItem
                                key={country.code}
                                value={`${country.label} ${country.code}`}
                                onSelect={() => {
                                  setCountryCode(country.code);
                                  setCountryOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    countryCode === country.code ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {country.flag} {country.label} ({country.code})
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value, countryCode))}
                    placeholder="6 14 21 64 42"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="roomNumber">Numéro de chambre</Label>
                <Input
                  id="roomNumber"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="1002"
                />
              </div>
            </TabsContent>

            <TabsContent value="prestations" className="space-y-4 mt-4">
              <Tabs defaultValue="Women" className="w-full">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="Women">WOMEN'S MENU</TabsTrigger>
                  <TabsTrigger value="Men">MEN'S MENU</TabsTrigger>
                </TabsList>
                
                <TabsContent value="Women" className="mt-4">
                  <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                    {treatments?.filter(t => t.service_for === "Women").map((treatment) => (
                      <div 
                        key={treatment.id} 
                        className="flex items-center justify-between p-4 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-base">{treatment.name}</div>
                          <div className="text-sm text-muted-foreground mt-1">{treatment.category}</div>
                          {treatment.description && (
                            <div className="text-xs text-muted-foreground mt-1">{treatment.description}</div>
                          )}
                          <div className="text-sm font-medium mt-2">
                            {treatment.price}€ • {treatment.duration} min
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedTreatments.includes(treatment.id) ? "default" : "outline"}
                          onClick={() => toggleTreatment(treatment.id)}
                          className="ml-4"
                        >
                          {selectedTreatments.includes(treatment.id) ? "Sélectionné" : "Select"}
                        </Button>
                      </div>
                    ))}
                    {!treatments?.filter(t => t.service_for === "Women").length && (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        Aucune prestation disponible
                      </div>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="Men" className="mt-4">
                  <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                    {treatments?.filter(t => t.service_for === "Men").map((treatment) => (
                      <div 
                        key={treatment.id} 
                        className="flex items-center justify-between p-4 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-base">{treatment.name}</div>
                          <div className="text-sm text-muted-foreground mt-1">{treatment.category}</div>
                          {treatment.description && (
                            <div className="text-xs text-muted-foreground mt-1">{treatment.description}</div>
                          )}
                          <div className="text-sm font-medium mt-2">
                            {treatment.price}€ • {treatment.duration} min
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedTreatments.includes(treatment.id) ? "default" : "outline"}
                          onClick={() => toggleTreatment(treatment.id)}
                          className="ml-4"
                        >
                          {selectedTreatments.includes(treatment.id) ? "Sélectionné" : "Select"}
                        </Button>
                      </div>
                    ))}
                    {!treatments?.filter(t => t.service_for === "Men").length && (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        Aucune prestation disponible
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              
              {selectedTreatments.length > 0 && (
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg font-semibold mt-4">
                  <span>Prix total</span>
                  <span className="text-lg">{totalPrice}€</span>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
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
