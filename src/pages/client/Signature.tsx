import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eraser, Check } from 'lucide-react';

export default function Signature() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAlreadySigned, setIsAlreadySigned] = useState(false);
  
  const [bookingInfo, setBookingInfo] = useState<{ client_name: string; hotel_name: string; room_number: string; treatment_name: string; price: string } | null>(null);

  const [formData, setFormData] = useState({
    room_number: '',
    is_pregnant: '',
    heart_issues: '',
    medical_treatment: '',
    medical_treatment_details: '',
    chronic_pain: '',
    chronic_pain_details: '',
    allergies: '',
    allergies_details: '',
    recent_surgery: '',
    emotional_state: '5',
    physical_state: '5',
    mental_state: '5',
    body_sensation: '5',
    localized_tensions: '',
    preferred_intensity: '',
    focus_zones: '',
    avoid_zones: '',
    billing_confirmed: false,
  });

  useEffect(() => {
    if (!token) {
      setIsAlreadySigned(true);
      setLoading(false);
      return;
    }

    const fetchBooking = async () => {
      try {
        // La méthode la plus sécurisée : on interroge via la fonction RPC
        const { data, error } = await supabase.rpc('get_booking_by_signature_token', { p_token: token });
        
        // Si le token n'existe pas OU si signed_at n'est pas NULL, la requête renverra 0 résultats.
        if (error || !data || data.length === 0) {
          setIsAlreadySigned(true);
          return;
        }

        const b = data[0] as any; // On force le type pour TS avec le format retourné par le RPC
        setBookingInfo({
          client_name: `${b.client_first_name} ${b.client_last_name}`,
          hotel_name: b.hotel_name,
          room_number: '',
          treatment_name: b.treatment_name || 'Soin', 
          price: b.total_price ? `${b.total_price} €` : 'À définir',
        });
      } catch (err) {
        console.error('Erreur:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [token]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // --- LOGIQUE CANVAS ---
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
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1a1a1a';
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

  const stopDrawing = () => setIsDrawing(false);
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSubmit = async () => {
    if (!hasDrawn || !token) {
      toast({ title: 'Veuillez signer le document', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const canvas = canvasRef.current;
    const signatureBase64 = canvas?.toDataURL('image/png');

    try {
      // Retour à la méthode ultra-sécurisée de Michael (RPC) pour contourner l'erreur 400 RLS
      const { data, error } = await supabase.rpc('submit_client_signature', {
        p_token: token,
        p_signature: signatureBase64,
        p_form_data: formData,
      });

      if (error) throw error;
      
      setIsSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error("Erreur lors de la soumission :", err);
      toast({ title: 'Erreur lors de la sauvegarde', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // --- ÉCRAN DE CHARGEMENT ---
  if (loading) return <div className="flex justify-center items-center min-h-screen bg-[#FAFAFA]"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;

  // --- ÉCRAN : DÉJÀ SIGNÉ OU INVALIDE ---
  if (isAlreadySigned && !isSuccess) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] py-20 px-4 flex justify-center items-center font-sans text-gray-900">
        <div className="w-full max-w-lg bg-white shadow-xl border border-gray-200 p-12 text-center">
          <h1 className="text-2xl font-serif tracking-widest uppercase mb-4 text-[#1a1a1a]">Document indisponible</h1>
          <div className="w-12 h-[1px] bg-gray-300 mx-auto mb-6"></div>
          <p className="text-gray-500 uppercase tracking-widest text-sm leading-relaxed">Ce lien est expiré ou le formulaire a déjà été complété et signé.</p>
        </div>
      </div>
    );
  }

  // --- ÉCRAN : SUCCÈS APRÈS SIGNATURE ---
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] py-20 px-4 flex justify-center items-center font-sans text-gray-900">
        <div className="w-full max-w-lg bg-white shadow-xl border border-gray-200 p-12 sm:p-16 text-center">
          <h2 className="text-xs tracking-[0.3em] text-gray-400 uppercase mb-6">Spa Hana by Lymfea</h2>
          <h1 className="text-2xl sm:text-3xl font-serif tracking-widest uppercase mb-6 text-[#1a1a1a]">Votre expérience <br/> commence</h1>
          <div className="w-12 h-[1px] bg-black mx-auto mb-8"></div>
          <p className="text-gray-600 uppercase tracking-[0.15em] text-[11px] leading-loose">
            Nous vous remercions pour votre confiance. Votre profil a bien été transmis à votre praticien(ne).
            <br/><br/>
            Il ne vous reste plus qu'à lâcher prise et profiter pleinement de votre instant de bien-être.
          </p>
        </div>
      </div>
    );
  }

  // --- ÉCRAN : LE FORMULAIRE ---
  return (
    <div className="min-h-screen bg-[#F3F4F6] py-10 px-4 sm:px-8 flex flex-col items-center font-sans text-gray-900 selection:bg-black selection:text-white">
      
      <div className="w-full max-w-4xl bg-white shadow-xl border border-gray-200 p-6 sm:p-12 md:p-16 flex flex-col">
        
        {/* EN-TÊTE */}
        <div className="text-center mb-16">
          <h1 className="text-3xl sm:text-4xl font-serif tracking-widest uppercase mb-4 text-[#1a1a1a]">
            Spa Hana <span className="text-gray-400 font-sans text-xl mx-2 font-light">BY</span> Lymfea
          </h1>
          <h2 className="text-sm tracking-[0.2em] text-gray-500 uppercase">Formulaire de Consentement</h2>
          <div className="w-16 h-[1px] bg-black mx-auto mt-8"></div>
        </div>

        {/* INFOS CLIENT */}
        <div className="flex flex-col gap-6 mb-16">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8">
            <div className="flex items-baseline gap-3 flex-1 overflow-hidden">
              <span className="text-xs text-gray-500 uppercase tracking-widest shrink-0">Nom, Prénom :</span>
              <div className="flex-1 border-b border-gray-400 pb-1 text-gray-900 font-serif text-lg tracking-wide uppercase truncate">
                {bookingInfo?.client_name}
              </div>
            </div>
            <div className="flex items-baseline gap-3 md:w-1/3 shrink-0">
              <span className="text-xs text-gray-500 uppercase tracking-widest shrink-0">Date :</span>
              <div className="flex-1 border-b border-gray-400 pb-1 text-gray-900 font-serif text-lg tracking-wide">
                {new Date().toLocaleDateString('fr-FR')}
              </div>
            </div>
          </div>
          <div className="flex items-baseline gap-3 w-full md:w-2/3">
            <span className="text-xs text-gray-500 uppercase tracking-widest shrink-0">N° Chambre <span className="text-[10px] text-gray-400 tracking-normal hidden sm:inline">(Si client de l'hôtel)</span> :</span>
            <input type="text" value={formData.room_number} onChange={(e) => handleInputChange('room_number', e.target.value)} className="flex-1 bg-transparent border-b border-gray-400 text-gray-900 font-serif text-lg outline-none pb-1 focus:border-black transition-colors uppercase" />
          </div>
        </div>

        {/* SECTION 1 - INFORMATIONS IMPORTANTES */}
        <div className="mb-14">
          <h3 className="font-serif text-2xl uppercase tracking-widest mb-1 text-[#1a1a1a]">Informations Importantes Avant Le Soin :</h3>
          <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-10 leading-relaxed border-b border-gray-200 pb-6">Afin de vous proposer une expérience sécurisée, adaptée à vos besoins et à votre état du moment, merci de bien vouloir répondre aux questions suivantes :</p>
          
          <div className="space-y-8">
            {[
              { label: "Êtes-vous actuellement enceinte ?", field: "is_pregnant" },
              { label: "Avez-vous des antécédents cardiaques, circulatoires ou respiratoires ?", field: "heart_issues" }
            ].map((q) => (
              <div key={q.field} className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-3">
                <label className="text-sm text-gray-800 uppercase tracking-widest leading-relaxed lg:pr-4">{q.label}</label>
                <div className="flex items-center gap-6 shrink-0 pt-2 lg:pt-0">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800"><input type="radio" name={q.field} value="oui" checked={formData[q.field as keyof typeof formData] === 'oui'} onChange={(e) => handleInputChange(q.field, e.target.value)} className="w-4 h-4 text-black border-gray-400 focus:ring-black accent-black" /> OUI</label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800"><input type="radio" name={q.field} value="non" checked={formData[q.field as keyof typeof formData] === 'non'} onChange={(e) => handleInputChange(q.field, e.target.value)} className="w-4 h-4 text-black border-gray-400 focus:ring-black accent-black" /> NON</label>
                </div>
              </div>
            ))}

            {[
              { label: "Suivez-vous un traitement médical en cours ?", field: "medical_treatment", detail: "medical_treatment_details" },
              { label: "Présentez-vous des douleurs chroniques, inflammations, blessures ou opérations récentes ?", field: "chronic_pain", detail: "chronic_pain_details" },
              { label: "Avez-vous des allergies connues (huiles, produits, latex, etc) ?", field: "allergies", detail: "allergies_details" }
            ].map((q) => (
              <div key={q.field} className="space-y-4">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-3">
                  <label className="text-sm text-gray-800 uppercase tracking-widest leading-relaxed lg:pr-4">{q.label}</label>
                  <div className="flex items-center gap-6 shrink-0 pt-2 lg:pt-0">
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800"><input type="radio" name={q.field} value="oui" checked={formData[q.field as keyof typeof formData] === 'oui'} onChange={(e) => handleInputChange(q.field, e.target.value)} className="w-4 h-4 text-black border-gray-400 focus:ring-black accent-black" /> OUI</label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800"><input type="radio" name={q.field} value="non" checked={formData[q.field as keyof typeof formData] === 'non'} onChange={(e) => handleInputChange(q.field, e.target.value)} className="w-4 h-4 text-black border-gray-400 focus:ring-black accent-black" /> NON</label>
                  </div>
                </div>
                {/* Toujours affiché pour imiter le papier */}
                <div className="flex items-baseline gap-3 pl-0 lg:pl-4 pt-1">
                  <span className="text-xs text-gray-500 uppercase tracking-widest shrink-0">Si oui, précisez :</span>
                  <input type="text" value={formData[q.detail as keyof typeof formData] as string} onChange={(e) => handleInputChange(q.detail, e.target.value)} className="flex-1 bg-transparent border-b border-gray-400 text-gray-900 font-serif text-base outline-none pb-1 focus:border-black transition-colors" />
                </div>
              </div>
            ))}

            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-3 mt-8 pt-8 border-t border-gray-100">
              <label className="text-sm text-gray-800 uppercase tracking-widest leading-relaxed lg:pr-4">Avez-vous eu une intervention chirurgicale dans les 6 derniers mois :</label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 shrink-0 pt-2 lg:pt-0">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800"><input type="radio" name="recent_surgery" value="oui_accord" checked={formData.recent_surgery === 'oui_accord'} onChange={(e) => handleInputChange('recent_surgery', e.target.value)} className="w-4 h-4 text-black border-gray-400 focus:ring-black accent-black" /> OUI, AVEC ACCORD MÉDICAL</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800"><input type="radio" name="recent_surgery" value="non" checked={formData.recent_surgery === 'non'} onChange={(e) => handleInputChange('recent_surgery', e.target.value)} className="w-4 h-4 text-black border-gray-400 focus:ring-black accent-black" /> NON</label>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2 - SLIDERS */}
        <div className="mb-14 pt-8 border-t border-gray-200">
          <h3 className="font-serif text-2xl uppercase tracking-widest mb-10 text-[#1a1a1a]">Comment vous sentez-vous en ce moment ? :</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 mb-10">
            {[
              { label: 'État émotionnel', field: 'emotional_state' },
              { label: 'État physique général', field: 'physical_state' },
              { label: 'État mental / psychique', field: 'mental_state' },
              { label: 'Sensation corporelle globale', field: 'body_sensation' },
            ].map((item) => (
              <div key={item.field} className="flex flex-col gap-3">
                <div className="flex justify-between items-end gap-4">
                  <span className="text-[13px] text-gray-800 uppercase tracking-widest leading-tight">{item.label} :</span>
                  <span className="text-lg font-serif text-black shrink-0 whitespace-nowrap">
                    {(formData[item.field as keyof typeof formData] as string | number) || 5} <span className="text-sm text-gray-400">/ 10</span>
                  </span>
                </div>
                <input 
                  type="range" min="1" max="10" 
                  value={(formData[item.field as keyof typeof formData] as string | number) || 5} 
                  onChange={(e) => handleInputChange(item.field, e.target.value)} 
                  className="w-full h-[1px] bg-gray-300 appearance-none cursor-pointer accent-black mt-1" 
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row gap-3 lg:items-baseline mt-10">
            <span className="shrink-0 text-sm text-gray-800 uppercase tracking-widest">Tensions localisées <span className="text-[10px] text-gray-500 tracking-normal">(ex. visage, mâchoires, trapèzes...)</span> :</span>
            <input type="text" value={formData.localized_tensions} onChange={(e) => handleInputChange('localized_tensions', e.target.value)} className="flex-1 bg-transparent border-b border-gray-400 text-gray-900 font-serif text-base outline-none pb-1 focus:border-black transition-colors" />
          </div>
        </div>

        {/* SECTION 3 - PRÉFÉRENCES */}
        <div className="mb-14 pt-8 border-t border-gray-200">
          <h3 className="font-serif text-2xl uppercase tracking-widest mb-10 text-[#1a1a1a]">Intensité du massage souhaitée :</h3>
          
          <div className="flex flex-col lg:flex-row lg:items-center gap-6 mb-10">
            <span className="text-sm text-gray-800 uppercase tracking-widest shrink-0">Quelle intensité préférez-vous ?</span>
            <div className="flex flex-wrap items-center gap-6 sm:gap-8">
              {['leger', 'moyen', 'appuye'].map((intensity) => (
                <label key={intensity} className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-800 uppercase tracking-wider">
                  <input type="radio" name="preferred_intensity" value={intensity} checked={formData.preferred_intensity === intensity} onChange={(e) => handleInputChange('preferred_intensity', e.target.value)} className="w-4 h-4 text-black border-gray-400 focus:ring-black accent-black" />
                  {intensity === 'leger' ? 'Léger' : intensity === 'moyen' ? 'Moyen' : 'Appuyé'}
                </label>
              ))}
            </div>
          </div>
          
          <div className="space-y-10">
            <div className="flex flex-col gap-3">
              <span className="text-sm text-gray-800 uppercase tracking-widest">Quelles sont les zones sur lesquelles vous souhaitez que l'on porte une attention particulière ?</span>
              <input type="text" value={formData.focus_zones} onChange={(e) => handleInputChange('focus_zones', e.target.value)} className="w-full bg-transparent border-b border-gray-400 text-gray-900 font-serif text-base outline-none pb-1 focus:border-black transition-colors" />
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-sm text-gray-800 uppercase tracking-widest">Y a-t-il des zones que vous préférez que l'on évite ?</span>
              <input type="text" value={formData.avoid_zones} onChange={(e) => handleInputChange('avoid_zones', e.target.value)} className="w-full bg-transparent border-b border-gray-400 text-gray-900 font-serif text-base outline-none pb-1 focus:border-black transition-colors" />
            </div>
          </div>
        </div>

        {/* SECTION 4 : FACTURATION */}
        <div className="mb-14 bg-[#FAFAFA] p-6 sm:p-10 border border-gray-200">
          <h3 className="font-serif text-xl uppercase tracking-widest mb-8 text-[#1a1a1a]">
            Clause de facturation <span className="text-xs text-gray-500 tracking-normal font-sans ml-0 sm:ml-2 block sm:inline mt-2 sm:mt-0">(Clients de l'hôtel uniquement) :</span>
          </h3>
          
          <div className="text-sm text-gray-800 leading-loose uppercase tracking-wide">
            Je soussigné(e) 
            <span className="inline-block border-b border-gray-400 font-serif text-lg px-2 sm:px-4 mx-2 text-black">{bookingInfo?.client_name}</span>
            occupant de la chambre n° 
            <input type="text" value={formData.room_number} onChange={(e) => handleInputChange('room_number', e.target.value)} className="bg-transparent border-b border-gray-400 text-center font-serif text-lg outline-none w-16 sm:w-24 mx-2 focus:border-black" />
            autorise le spa à porter le montant suivant sur ma note de chambre :
            
            <div className="mt-8 flex flex-col md:flex-row gap-6 md:gap-8 md:items-baseline">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-3 flex-1">
                <span className="shrink-0 text-gray-600 text-xs tracking-widest">TYPE DE PRESTATION :</span>
                <div className="flex-1 border-b border-gray-400 pb-1 text-black font-serif text-lg">{bookingInfo?.treatment_name}</div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-3 w-full md:w-1/3">
                <span className="shrink-0 text-gray-600 text-xs tracking-widest">MONTANT :</span>
                <div className="flex-1 border-b border-gray-400 pb-1 text-black font-serif text-lg sm:text-right pr-2">{bookingInfo?.price}</div>
              </div>
            </div>
          </div>
          
          <div className="mt-10 flex items-center gap-4">
            <input type="checkbox" id="confirm-billing" checked={formData.billing_confirmed} onChange={(e) => handleInputChange('billing_confirmed', e.target.checked)} className="w-5 h-5 text-black border-gray-400 focus:ring-black accent-black rounded-sm cursor-pointer" />
            <label htmlFor="confirm-billing" className="text-sm font-semibold uppercase tracking-widest cursor-pointer text-[#1a1a1a]">Je confirme</label>
          </div>
        </div>

        {/* SECTION 5 : CONSENTEMENT & SIGNATURE */}
        <div className="mb-4">
          <h3 className="font-serif text-2xl uppercase tracking-widest mb-6 text-[#1a1a1a]">Consentement Éclairé :</h3>
          <div className="text-[11px] text-gray-600 space-y-4 uppercase tracking-widest leading-relaxed text-justify mb-10">
            <p>Le client déclare que les données concernant ses informations personnelles, expressément demandées dans le but d'évaluer la compatibilité avec les soins fournis, sont vraies. Le client dégage donc l'Hôtel Hana et Lymfea de toute responsabilité quant à tout problème découlant de l'omission intentionnelle ou non d'informations concernant tout état pathologique, allergique, inflammatoire ou autre, qui peut compromettre l'état de santé de ce dernier. L'Hôtel Hana et Lymfea déclarent respecter les règles de confidentialité du client sur la base de la législation en vigueur et ne pas divulguer à des tiers les données à caractère personnel de ce dernier, que ce soit à des fins lucratives ou commerciales.</p>
          </div>

          <div className="mt-10">
            <p className="text-sm font-bold uppercase tracking-widest mb-6 text-center text-[#1a1a1a]">Signature du client : <br/><span className="text-[10px] font-normal text-gray-500 tracking-widest mt-1 block">Précédée de la mention « Lu et approuvé »</span></p>
            <div className="border border-gray-300 p-2 bg-[#FAFAFA] relative shadow-inner">
              <span className="absolute top-4 left-6 text-gray-300 font-serif italic pointer-events-none select-none text-lg">Lu et approuvé...</span>
              <canvas
                ref={canvasRef} width={800} height={250}
                className="w-full bg-transparent touch-none cursor-crosshair relative z-10"
                onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
              />
            </div>
            
            <div className="flex justify-between items-center mt-3">
              <button onClick={clearCanvas} className="text-xs text-gray-500 hover:text-black uppercase tracking-widest flex items-center gap-1 transition-colors">
                <Eraser className="w-3 h-3" /> Recommencer
              </button>
            </div>
          </div>
        </div>

        {/* BOUTON VALIDATION */}
        <div className="flex justify-center mt-12 mb-4">
          <button 
            onClick={handleSubmit} 
            disabled={!hasDrawn || submitting}
            className="bg-[#1a1a1a] text-white px-8 sm:px-12 py-4 sm:py-5 uppercase tracking-[0.2em] text-xs sm:text-sm font-medium hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center shadow-lg hover:shadow-xl w-full sm:w-auto justify-center"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : <Check className="w-4 h-4 mr-3" />}
            Soumettre le document
          </button>
        </div>

      </div> 

      {/* FOOTER PDF */}
      <div className="text-center text-[10px] text-gray-400 font-serif uppercase tracking-widest mt-10 mb-4">
        <p>17, Rue du Quatre-Septembre, Paris 2</p>
      </div>

    </div>
  );
}