import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle, XCircle, Loader2, AlertCircle } from "lucide-react";

export default function QuoteResponse() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "refused" | "error" | "already_processed">("loading");
  const [message, setMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState("");

  useEffect(() => {
    const processQuoteResponse = async () => {
      const bookingId = searchParams.get("bookingId");
      const action = searchParams.get("action") as "approve" | "refuse";
      const token = searchParams.get("token");

      if (!bookingId || !action || !token) {
        setStatus("error");
        setMessage("Lien invalide");
        setErrorDetails("Les paramètres requis sont manquants.");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("handle-quote-response", {
          body: { bookingId, action, token }
        });

        if (error) {
          console.error("Error processing quote response:", error);
          setStatus("error");
          setMessage("Une erreur est survenue");
          setErrorDetails(error.message || "Veuillez réessayer plus tard.");
          return;
        }

        if (data.alreadyProcessed) {
          setStatus("already_processed");
          setMessage(data.message || "Ce devis a déjà été traité");
          return;
        }

        if (data.success) {
          if (data.action === "approved") {
            setStatus("success");
            setMessage(data.message || "Merci ! Un coiffeur va confirmer votre rdv sous peu.");
          } else {
            setStatus("refused");
            setMessage(data.message || "Demande annulée. Aucun frais ne sera débité.");
          }
        } else {
          setStatus("error");
          setMessage(data.error || "Une erreur est survenue");
        }
      } catch (err: any) {
        console.error("Exception processing quote response:", err);
        setStatus("error");
        setMessage("Une erreur est survenue");
        setErrorDetails(err.message || "Veuillez réessayer plus tard.");
      }
    };

    processQuoteResponse();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {/* Logo */}
        <div className="mb-8">
          <img
            src="https://jpvgfxchupfukverhcgt.supabase.co/storage/v1/object/public/assets/oom-logo-email.png"
            alt="OOM World"
            className="h-10 mx-auto"
          />
        </div>

        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="w-16 h-16 text-primary mx-auto animate-spin" />
            <p className="text-lg text-gray-600">Traitement en cours...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-12 h-12 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Réservation confirmée !</h1>
            <p className="text-gray-600">{message}</p>
            <div className="mt-8 p-4 bg-emerald-50 rounded-lg">
              <p className="text-sm text-emerald-800">
                Vous recevrez un email de confirmation dès qu'un coiffeur aura accepté votre demande.
              </p>
            </div>
          </div>
        )}

        {status === "refused" && (
          <div className="space-y-4">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-12 h-12 text-gray-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Demande annulée</h1>
            <p className="text-gray-600">{message}</p>
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700">
                Vous pouvez faire une nouvelle demande à tout moment depuis l'hôtel.
              </p>
            </div>
          </div>
        )}

        {status === "already_processed" && (
          <div className="space-y-4">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-12 h-12 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Lien déjà utilisé</h1>
            <p className="text-gray-600">{message}</p>
            <div className="mt-8 p-4 bg-amber-50 rounded-lg">
              <p className="text-sm text-amber-800">
                Ce lien a déjà été utilisé. Si vous avez des questions, contactez l'hôtel.
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Erreur</h1>
            <p className="text-gray-600">{message}</p>
            {errorDetails && (
              <p className="text-sm text-gray-500">{errorDetails}</p>
            )}
            <div className="mt-8 p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-red-800">
                Ce lien est peut-être expiré ou invalide. Veuillez contacter l'hôtel.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">OOM World - Luxury Hair Services</p>
        </div>
      </div>
    </div>
  );
}
