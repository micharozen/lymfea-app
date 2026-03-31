import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

export default function Signature() {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [error, setError] = useState("");

  // Fausses données pour le MVP visuel
  const mockData = {
    clientName: "Jean Dupont",
    hotelName: "Hôtel HANA",
    date: new Date().toLocaleDateString("fr-FR"),
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setError("");
  };

  const saveSignature = () => {
    if (sigCanvas.current?.isEmpty()) {
      setError("Veuillez signer le document avant de valider.");
      return;
    }
    
    // Récupère l'image dessinée en format texte (Base64)
    const signatureBase64 = sigCanvas.current?.getTrimmedCanvas().toDataURL("image/png");
    console.log("Signature prête à être envoyée :", signatureBase64);
    alert("Signature capturée ! Regarde la console.");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex justify-center">
      <div className="max-w-2xl w-full bg-white p-6 md:p-10 rounded-xl shadow-lg">
        
        {/* En-tête dynamique */}
        <h1 className="text-2xl font-bold text-center mb-8 uppercase">
          Formulaire de Consentement - {mockData.hotelName}
        </h1>

        <div className="space-y-4 mb-8 text-sm md:text-base">
          <p><strong>Nom, Prénom :</strong> {mockData.clientName}</p>
          <p><strong>Date :</strong> {mockData.date}</p>
        </div>

        {/* Texte Légal inspiré du PDF */}
        <div className="bg-gray-100 p-4 rounded-md mb-8 text-sm text-gray-700">
          <p className="font-bold mb-2">Consentement éclairé :</p>
          <p className="mb-2">
            Je déclare que les informations fournies pour évaluer la compatibilité avec les soins sont vraies. 
            Je dégage {mockData.hotelName} et LYMFEA de toute responsabilité quant à tout problème découlant 
            d'une omission d'informations sur mon état de santé.
          </p>
        </div>

        {/* Zone de Signature */}
        <div className="mb-8">
          <p className="font-semibold mb-2 text-sm">Signature précédée de la mention « LU ET APPROUVÉ » :</p>
          <div className="border-2 border-dashed border-gray-400 rounded-lg bg-white overflow-hidden">
            <SignatureCanvas 
              ref={sigCanvas}
              canvasProps={{
                className: "w-full h-64 touch-none cursor-crosshair"
              }}
            />
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          <div className="flex justify-end mt-2">
            <button 
              onClick={clearSignature}
              className="text-sm text-gray-500 hover:text-gray-800 underline"
            >
              Effacer et recommencer
            </button>
          </div>
        </div>

        {/* Bouton de validation */}
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