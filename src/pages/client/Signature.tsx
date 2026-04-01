import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eraser, CheckCircle } from 'lucide-react';

export default function Signature() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bookingInfo, setBookingInfo] = useState<{ client_name: string; hotel_name: string } | null>(null);

  // Vérification du token au chargement
  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const { data, error } = await supabase.rpc('get_booking_by_signature_token', {
          p_token: token,
        });

        if (error || !data || data.length === 0) {
          toast({
            title: 'Lien invalide ou expiré',
            description: 'Cette décharge a peut-être déjà été signée.',
            variant: 'destructive',
          });
          navigate('/');
          return;
        }
        
        setBookingInfo({
          client_name: `${data[0].client_first_name} ${data[0].client_last_name}`,
          hotel_name: data[0].hotel_name,
        });
      } catch (err) {
        console.error('Erreur lors de la récupération:', err);
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchBooking();
  }, [token, navigate, toast]);

  // Logique du Canvas (Tactile et Souris)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Soumission de la signature
  const handleSubmit = async () => {
    if (!hasDrawn || !token) return;
    setSubmitting(true);

    const canvas = canvasRef.current;
    const signatureBase64 = canvas?.toDataURL('image/png');

    try {
      const { data, error } = await supabase.rpc('submit_client_signature', {
        p_token: token,
        p_signature: signatureBase64,
      });

      if (error || !data) throw error;

      toast({
        title: 'Décharge signée avec succès',
        description: 'Merci, votre document a bien été enregistré.',
      });
      navigate('/'); 
    } catch (err) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'enregistrer la signature.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-sm p-6 md:p-10">
        
        {/* En-tête */}
        <div className="mb-8 text-center border-b pb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 uppercase">Formulaire de Consentement</h1>
          <p className="text-gray-600">
            Client : <strong className="text-gray-900">{bookingInfo?.client_name}</strong>
          </p>
          <p className="text-gray-600">
            Lieu : <strong className="text-gray-900">{bookingInfo?.hotel_name}</strong>
          </p>
        </div>

        {/* Consentement Éclairé (Basé sur le vrai PDF) */}
        <div className="prose prose-sm text-gray-700 mb-8 p-5 bg-gray-50 border border-gray-200 rounded-lg text-justify">
          <h3 className="font-bold text-gray-900 mb-3 text-center uppercase">Consentement Éclairé</h3>
          <p className="mb-3">
            Le client déclare que les données concernant ses informations personnelles, expressément demandées dans le but d'évaluer la compatibilité avec les soins fournis, sont vraies.
          </p>
          <p className="mb-3">
            Le client dégage donc l'HÔTEL HANA ET LYMFEA de toute responsabilité quant à tout problème découlant de l'omission intentionnelle ou non d'informations concernant tout état pathologique, allergique, inflammatoire ou autre, qui peut compromettre l'état de santé de ce dernier.
          </p>
          <p className="mb-3">
            L'HÔTEL HANA ET LYMFEA déclarent respecter les règles de confidentialité du client sur la base de la législation en vigueur et ne pas divulguer à des tiers les données à caractère personnel de ce dernier, que ce soit à des fins lucratives ou commerciales.
          </p>
        </div>

        {/* Zone de signature (Tablette optimisée) */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-800 mb-3 text-center">
            Signature précédée de la mention « Lu et approuvé » :
          </label>
          {/* w-full, fond blanc, bordure bien visible, touch-none pour bloquer le scroll de la page quand on signe */}
          <canvas
            ref={canvasRef}
            width={800}
            height={300}
            className="w-full bg-white border-2 border-dashed border-gray-300 rounded-lg touch-none shadow-sm cursor-crosshair"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        {/* Boutons d'action (Min 48px / h-12 pour le tactile) */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={clearCanvas}
            className="h-12 flex-1 text-base font-medium"
          >
            <Eraser className="w-5 h-5 mr-2" />
            Effacer
          </Button>
          
          <Button 
            type="button" 
            onClick={handleSubmit} 
            disabled={!hasDrawn || submitting}
            className="h-12 flex-1 text-base font-medium bg-black text-white hover:bg-gray-800"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-5 h-5 mr-2" />
            )}
            Signer et Valider
          </Button>
        </div>

      </div>
    </div>
  );
}