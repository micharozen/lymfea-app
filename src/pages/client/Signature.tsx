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

  // 1. CHERCHER LES DONNÉES AU CHARGEMENT DE LA PAGE
  useEffect(() => {
    async function fetchBooking() {
      if (!bookingId) return;
      
      const { data, error } = await supabase.rpc('get_booking_by_signature_token', {
        p_token: bookingId
      });

      if (error || !data || data.length === 0) {
        console.error("Erreur de récupération:", error);
        setError("Ce lien est invalide, expiré, ou la réservation est introuvable.");
        setLoading(false);
        return;
      }

      setBookingData(data[0]); // On stocke les infos trouvées
      setLoading(false);
    }

    fetchBooking();
  }, [bookingId]);

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setError("");
  };

  // 2. SAUVEGARDER LA SIGNATURE
  const saveSignature = async () => {
    if (sigCanvas.current?.isEmpty()) {
      setError("Veuillez signer le document avant de valider.");
      return;
    }
    
    setLoading(true);
    
    // 🚨 LE CORRECTIF EST ICI : On utilise getCanvas() au lieu de getTrimmedCanvas()
    const signatureBase64 = sigCanvas.current?.getCanvas().toDataURL("image/png");
    
    const { error: submitError } = await supabase.rpc('submit_client_signature', {
      p_token: bookingId,
      p_signature: signatureBase64
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

  // --- AFFICHAGE SELON L'ÉTAT ---

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center font-semibold text-gray-500">Chargement du document sécurisé...</div>;
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-600 mb-2">Document signé</h2>
          <p className="text-gray-600">Merci {bookingData?.client_first_name}, votre signature a bien été enregistrée.</p>
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

  // --- L'INTERFACE PRINCIPALE ---
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex justify-center">
      <div className="max-w-2xl w-full bg-white p-6 md:p-10 rounded-xl shadow-lg">
        
        <h1 className="text-2xl font-bold text-center mb-8 uppercase">
          Formulaire de Consentement - {bookingData.hotel_name || "Hôtel"}
        </h1>

        <div className="space-y-4 mb-8 text-sm md:text-base">
          <p><strong>Client :</strong> {bookingData.client_first_name} {bookingData.client_last_name}</p>
          <p><strong>Date du soin :</strong> {new Date(bookingData.booking_date).toLocaleDateString("fr-FR")}</p>
          {bookingData.room_number && <p><strong>N° de chambre :</strong> {bookingData.room_number}</p>}
        </div>

        <div className="bg-gray-100 p-4 rounded-md mb-8 text-sm text-gray-700">
          <p className="font-bold mb-2">Consentement éclairé :</p>
          <p className="mb-2">
            Je déclare que les informations fournies pour évaluer la compatibilité avec les soins sont vraies. 
            Je dégage {bookingData.hotel_name || "l'hôtel"} et LYMFEA de toute responsabilité quant à tout problème découlant 
            d'une omission d'informations sur mon état de santé.
          </p>
        </div>

        <div className="mb-8">
          <p className="font-semibold mb-2 text-sm">Signature précédée de la mention « LU ET APPROUVÉ » :</p>
          <div className="border-2 border-dashed border-gray-400 rounded-lg bg-white overflow-hidden">
            <SignatureCanvas 
              ref={sigCanvas}
              canvasProps={{ className: "w-full h-64 touch-none cursor-crosshair" }}
            />
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <div className="flex justify-end mt-2">
            <button onClick={clearSignature} className="text-sm text-gray-500 hover:text-gray-800 underline">
              Effacer
            </button>
          </div>
        </div>

        <button 
          onClick={saveSignature}
          className="w-full bg-black text-white font-bold py-4 rounded-lg hover:bg-gray-800 transition-colors"
        >
          Valider et Signer
        </button>

      </div>
    </div>
  );
}