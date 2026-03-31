import { useRef, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { supabase } from "@/integrations/supabase/client";

export default function Signature() {
  const { bookingId } = useParams(); // Le token récupéré dans l'URL
  const sigCanvas = useRef<SignatureCanvas>(null);
  
  const [bookingData, setBookingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  
  // États demandés par le ticket S1-04
  const [hasSignature, setHasSignature] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [alreadySigned, setAlreadySigned] = useState(false);

  // 1. CHARGEMENT DES DONNÉES
  useEffect(() => {
    async function fetchBooking() {
      if (!bookingId) return;
      
      const { data, error: fetchError } = await supabase.rpc('get_booking_by_signature_token', {
        p_token: bookingId
      });

      if (fetchError || !data || data.length === 0) {
        console.error("Erreur de récupération:", fetchError);
        setError("Ce lien est invalide, expiré, ou la réservation est introuvable.");
        setLoading(false);
        return;
      }

      const booking = data[0];
      
      // Ticket : Vérifier si le document est déjà signé
      if (booking.signed_at) {
        setAlreadySigned(true);
      }
      
      setBookingData(booking);
      setRoomNumber(booking.room_number || ""); // Pré-remplit le numéro de chambre
      setLoading(false);
    }

    fetchBooking();
  }, [bookingId]);

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setHasSignature(false);
    setError("");
  };

  // 2. ENREGISTREMENT DE LA SIGNATURE
  const saveSignature = async () => {
    if (!hasSignature) return; // Sécurité supplémentaire
    
    setLoading(true);
    // On utilise getCanvas() pour éviter l'erreur TypeError rencontrée plus tôt
    const signatureBase64 = sigCanvas.current?.getCanvas().toDataURL("image/png");
    
    // Appel du RPC mis à jour avec p_room_number
    const { error: submitError } = await supabase.rpc('submit_client_signature', {
      p_token: bookingId,
      p_signature: signatureBase64,
      p_room_number: roomNumber
    });

    if (submitError) {
      console.error("Erreur d'enregistrement:", submitError);
      setError("Erreur lors de l'enregistrement de la signature.");
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false); 
    }
  };

  // --- RENDU : ÉTATS SPÉCIAUX ---

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-semibold text-gray-500">
        Chargement du document sécurisé...
      </div>
    );
  }

  // Ticket : Message si déjà signé
  if (alreadySigned) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full border border-gray-100">
          <div className="text-4xl mb-4">📝</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Décharge déjà signée</h2>
          <p className="text-gray-600">
            Ce formulaire a déjà été complété le {new Date(bookingData.signed_at).toLocaleDateString("fr-FR")}.
          </p>
        </div>
      </div>
    );
  }

  // Ticket : Écran de succès
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-600 mb-2">Document signé</h2>
          <p className="text-gray-600">Merci {bookingData?.client_first_name}, votre décharge a bien été enregistrée.</p>
        </div>
      </div>
    );
  }

  if (!bookingData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-red-500 font-bold text-center bg-red-50 p-6 rounded-lg">{error}</p>
      </div>
    );
  }

  // --- RENDU : FORMULAIRE PRINCIPAL ---
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex justify-center">
      <div className="max-w-2xl w-full bg-white p-6 md:p-10 rounded-xl shadow-lg">
        
        <h1 className="text-2xl font-bold text-center mb-8 uppercase text-gray-900">
          Formulaire de Consentement - {bookingData.hotel_name || "Hôtel"}
        </h1>

        {/* Infos pré-remplies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 bg-gray-50 p-4 rounded-lg border border-gray-100">
          <p className="text-sm"><strong>Client :</strong> {bookingData.client_first_name} {bookingData.client_last_name}</p>
          <p className="text-sm"><strong>Soin prévu le :</strong> {new Date(bookingData.booking_date).toLocaleDateString("fr-FR")} à {bookingData.booking_time?.substring(0, 5)}</p>
          
          {/* Ticket : Champ Chambre modifiable */}
          <div className="md:col-span-2 mt-2">
            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Numéro de chambre (Optionnel)</label>
            <input 
              type="text" 
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="Saisissez votre n° de chambre"
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-black outline-none transition-all"
            />
          </div>
        </div>

        {/* Texte légal */}
        <div className="bg-gray-100 p-4 rounded-md mb-8 text-sm text-gray-700 leading-relaxed">
          <p className="font-bold mb-2">Consentement éclairé :</p>
          <p>
            Je déclare que les informations fournies pour évaluer la compatibilité avec les soins sont vraies. 
            Je dégage {bookingData.hotel_name || "l'établissement"} et LYMFEA de toute responsabilité quant à tout problème découlant 
            d'une omission d'informations sur mon état de santé.
          </p>
        </div>

        {/* Zone de signature */}
        <div className="mb-8">
          <p className="font-semibold mb-2 text-sm text-gray-800">Signature précédée de la mention « LU ET APPROUVÉ » :</p>
          <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
            <SignatureCanvas 
              ref={sigCanvas}
              onEnd={() => setHasSignature(!sigCanvas.current?.isEmpty())}
              canvasProps={{ className: "w-full h-64 touch-none cursor-crosshair bg-[#fdfdfd]" }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <p className="text-red-500 text-xs">{error}</p>
            <button onClick={clearSignature} className="text-sm text-gray-400 hover:text-red-500 transition-colors underline">
              Effacer
            </button>
          </div>
        </div>

        {/* Ticket : Bouton désactivé si vide */}
        <button 
          onClick={saveSignature}
          disabled={!hasSignature || loading}
          className={`w-full font-bold py-4 rounded-lg transition-all ${
            hasSignature && !loading
              ? "bg-black text-white hover:bg-gray-800 shadow-md" 
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {loading ? "Enregistrement..." : "Valider et Signer"}
        </button>

      </div>
    </div>
  );
}