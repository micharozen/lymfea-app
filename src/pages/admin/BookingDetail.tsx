import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, ArrowLeft, User, Phone,
  Calendar, Clock, Building2, HandHeart,
  CheckCircle2, AlertCircle, Send, Pencil,
  PenTool
} from "lucide-react";

import { formatPrice } from "@/lib/formatPrice";
import { SendPaymentLinkDialog } from "@/components/booking/SendPaymentLinkDialog";
import EditBookingDialog from "@/components/EditBookingDialog";
import { useBookingData } from "@/hooks/booking/useBookingData";

export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPaymentLinkOpen, setIsPaymentLinkOpen] = useState(false);

  const { bookings, getHotelInfo } = useBookingData();
  const isLoading = !bookings; 
  
  const booking = bookings?.find((b) => b.id === id);

  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!booking) return <div className="p-10 text-center text-muted-foreground">Réservation introuvable.</div>;

  // États logiques
  const isPaid = booking.payment_status === 'paid' || booking.payment_status === 'charged_to_room';
  const isSigned = !!booking.signed_at; // Vérifie si la date de signature existe

  const hotelInfo = getHotelInfo(booking.hotel_id);
  const currency = hotelInfo?.currency || 'EUR';
  
  const displayPrice = booking.total_price && booking.total_price > 0 
    ? booking.total_price 
    : booking.treatmentsTotalPrice;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="flex-shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Retour</span>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">Réservation #{booking.booking_id}</h1>
              {booking.room_number ? (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  Client Hôtel — Ch. {booking.room_number}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-gray-500">Client Extérieur</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={booking.status} type="booking" />
              <StatusBadge status={booking.payment_status || "pending"} type="payment" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* BOUTON SIGNATURE 100% SÉCURISÉ (Via Token) */}
          {isSigned ? (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-green-600 border-green-200 bg-green-50 hover:bg-green-100"
              onClick={() => window.open(`/client/signature/${booking.signature_token}`, '_blank')}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> Signé
            </Button>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
              onClick={() => window.open(`/client/signature/${booking.signature_token}`, '_blank')}
            >
              <PenTool className="h-4 w-4 mr-2" /> Signature
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => setIsPaymentLinkOpen(true)}>
            <Send className="h-4 w-4 mr-2" /> Paiement
          </Button>
          <Button variant="default" size="sm" onClick={() => setIsEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Modifier
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-4">
        {/* ALERTES DE STATUT (PAIEMENT) */}
        {isPaid ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 text-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-medium text-sm">Le paiement a été réalisé avec succès.</span>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-800">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <span className="font-medium text-sm">En attente de règlement.</span>
          </div>
        )}

        {/* ALERTES DE STATUT (SIGNATURE) */}
        {isSigned ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between text-blue-800">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-sm">Document de décharge signé.</span>
            </div>
            <span className="text-xs opacity-70">
              Le {format(new Date(booking.signed_at), "d MMMM à HH:mm", { locale: fr })}
            </span>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-800">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="font-medium text-sm">Décharge non signée : signature obligatoire avant le soin.</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="md:col-span-2 space-y-6">
            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2">
                <User className="h-4 w-4" /> Client
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Nom</p>
                  <p className="font-medium">{booking.client_first_name} {booking.client_last_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Contact</p>
                  <p className="text-sm">{booking.phone || "-"} / {booking.client_email || "-"}</p>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2">
                <HandHeart className="h-4 w-4" /> Soins & Praticien
              </h3>
              <div className="mb-4 p-3 bg-muted/30 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {booking.therapist_name?.charAt(0) || "?"}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Thérapeute assigné</p>
                    <p className="font-semibold text-sm">{booking.therapist_name || "Non assigné"}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {booking.treatments?.map((t, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium">{t.name} ({t.duration} min)</span>
                    <span className="font-semibold">{formatPrice(t.price || 0, currency)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-white rounded-xl border p-6 shadow-sm">
              <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4">Organisation</h3>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>{booking.booking_date ? format(new Date(booking.booking_date), "EEEE d MMMM", { locale: fr }) : "-"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span>{booking.booking_time?.substring(0, 5) || "-"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span>{hotelInfo?.name || "-"}</span>
                </div>
              </div>
            </section>

            <section className="bg-gray-900 text-white rounded-xl p-6 shadow-lg">
              <p className="text-xs opacity-70 uppercase mb-1">Montant Total</p>
              <p className="text-3xl font-bold">{formatPrice(displayPrice, currency)}</p>
              <div className="mt-4 pt-4 border-t border-white/10 text-xs opacity-70">
                Méthode : {booking.payment_method || "À définir"}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* MODALES */}
      <EditBookingDialog 
        open={isEditOpen} 
        onOpenChange={setIsEditOpen} 
        booking={booking} 
        initialMode="edit" 
      />
      
      <SendPaymentLinkDialog 
        open={isPaymentLinkOpen} 
        onOpenChange={setIsPaymentLinkOpen} 
        booking={booking} 
      />
    </div>
  );
}