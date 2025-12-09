import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, Clock, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Treatment {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  category: string;
}

interface OnRequestFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatment: Treatment | null;
  hotelId: string;
  hotelName?: string;
}

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

export default function OnRequestFormDrawer({
  open,
  onOpenChange,
  treatment,
  hotelId,
  hotelName,
}: OnRequestFormDrawerProps) {
  const { t } = useTranslation("client");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+33");
  const [email, setEmail] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [preferredDate, setPreferredDate] = useState<Date>();
  const [preferredTime, setPreferredTime] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setRoomNumber("");
    setPreferredDate(undefined);
    setPreferredTime("");
    setDescription("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !phone) {
      toast.error("Veuillez remplir les champs obligatoires");
      return;
    }

    setIsSubmitting(true);

    try {
      // Insert the request into treatment_requests table
      const { data: requestData, error: insertError } = await supabase
        .from("treatment_requests")
        .insert({
          hotel_id: hotelId,
          treatment_id: treatment?.id || null,
          client_first_name: firstName,
          client_last_name: lastName || null,
          client_phone: `${countryCode} ${phone}`,
          client_email: email || null,
          room_number: roomNumber || null,
          preferred_date: preferredDate ? format(preferredDate, "yyyy-MM-dd") : null,
          preferred_time: preferredTime || null,
          description: description || null,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Send email notification to admin
      try {
        await supabase.functions.invoke("send-treatment-request-email", {
          body: {
            requestId: requestData.id,
            treatmentName: treatment?.name || "Soin sur demande",
            clientName: `${firstName} ${lastName}`.trim(),
            clientPhone: `${countryCode} ${phone}`,
            clientEmail: email,
            hotelId,
            hotelName: hotelName || "Hôtel",
            roomNumber,
            preferredDate: preferredDate ? format(preferredDate, "dd/MM/yyyy") : null,
            preferredTime,
            description,
          },
        });
      } catch (emailError) {
        console.error("Error sending notification email:", emailError);
        // Don't block the request if email fails
      }

      toast.success("Votre demande a été envoyée avec succès !");
      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting request:", error);
      toast.error("Erreur lors de l'envoi de votre demande");
    } finally {
      setIsSubmitting(false);
    }
  };

  const timeSlots = [];
  for (let hour = 8; hour <= 20; hour++) {
    timeSlots.push(`${hour.toString().padStart(2, "0")}:00`);
    timeSlots.push(`${hour.toString().padStart(2, "0")}:30`);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="border-b border-border pb-4">
          <DrawerTitle className="text-lg">Demande de devis</DrawerTitle>
          <DrawerDescription>
            {treatment?.name || "Soin personnalisé"}
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          {/* Treatment info */}
          {treatment && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              {treatment.image && (
                <img
                  src={treatment.image}
                  alt={treatment.name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
              )}
              <div>
                <p className="font-medium text-sm">{treatment.name}</p>
                <p className="text-xs text-muted-foreground">{treatment.category}</p>
              </div>
            </div>
          )}

          {/* Name fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName" className="text-sm">
                Prénom *
              </Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Votre prénom"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName" className="text-sm">
                Nom
              </Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Votre nom"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-sm">
              Téléphone *
            </Label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="flex h-10 w-[100px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.code}
                  </option>
                ))}
              </select>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Numéro de téléphone"
                className="flex-1"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
            />
          </div>

          {/* Room number */}
          <div className="space-y-1.5">
            <Label htmlFor="roomNumber" className="text-sm">
              N° de chambre
            </Label>
            <Input
              id="roomNumber"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="Ex: 405"
            />
          </div>

          {/* Preferred date & time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Date souhaitée</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !preferredDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {preferredDate
                      ? format(preferredDate, "dd/MM/yyyy", { locale: fr })
                      : "Choisir"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={preferredDate}
                    onSelect={setPreferredDate}
                    initialFocus
                    locale={fr}
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Heure souhaitée</Label>
              <select
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Choisir</option>
                {timeSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-sm">
              Décrivez votre besoin
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Couleur souhaitée, type de prestation, etc."
              rows={3}
            />
          </div>
        </form>

        <DrawerFooter className="border-t border-border pt-4">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !firstName || !phone}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                Envoi en cours...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Envoyer ma demande
              </>
            )}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline" className="w-full">
              Annuler
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
