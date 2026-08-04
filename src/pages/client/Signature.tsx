import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eraser, Check } from 'lucide-react';

type ClientLanguage = 'fr' | 'en';

export default function Signature() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const { t } = useTranslation('signature');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAlreadySigned, setIsAlreadySigned] = useState(false);

  // Langue du client (customers.language, repli indicatif téléphone) renvoyée par le RPC.
  // Le document est rendu dans cette langue, indépendamment de la langue du navigateur.
  const [language, setLanguage] = useState<ClientLanguage>('fr');

  const [bookingInfo, setBookingInfo] = useState<{ client_name: string; hotel_name: string; treatment_name: string | null; total_price: number | null } | null>(null);

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

  // Traduction forcée dans la langue du client, sans toucher à la langue globale de l'app.
  const tr = (key: string, options?: Record<string, unknown>) => t(key, { lng: language, ...options });

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

        const b = data[0];
        setLanguage(b.client_language === 'en' ? 'en' : 'fr');
        setBookingInfo({
          client_name: `${b.client_first_name} ${b.client_last_name}`,
          hotel_name: b.hotel_name,
          treatment_name: b.treatment_name ?? null,
          total_price: b.total_price ?? null,
        });
      } catch (err) {
        console.error('Erreur:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBooking();
  }, [token]);

  const handleInputChange = (field: string, value: string | boolean) => {
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
    ctx.strokeStyle = '#2C2622';
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
      toast({ title: tr('errors.signRequired'), variant: 'destructive' });
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
      toast({ title: tr('errors.saveFailed'), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const treatmentLabel = bookingInfo?.treatment_name || tr('common.defaultTreatment');
  const priceLabel = bookingInfo?.total_price != null ? `${bookingInfo.total_price} €` : tr('common.priceToBeDefined');

  // --- ÉCRAN DE CHARGEMENT ---
  if (loading) return <div className="lymfea-client flex justify-center items-center min-h-screen bg-[#FBF7F2]"><Loader2 className="w-8 h-8 animate-spin text-[#C96A43]" /></div>;

  // --- ÉCRAN : DÉJÀ SIGNÉ OU INVALIDE ---
  if (isAlreadySigned && !isSuccess) {
    return (
      <div className="lymfea-client min-h-screen bg-[#FBF7F2] py-20 px-4 flex justify-center items-center text-[#2C2622]">
        <div className="w-full max-w-lg bg-white shadow-sm border border-[#E8DFD2] rounded-sm p-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-2xl font-serif tracking-widest uppercase mb-4 text-[#2C2622]">{tr('unavailable.title')}</h1>
          <div className="w-12 h-[1px] bg-[#C96A43] mx-auto mb-6"></div>
          <p className="text-[#8A7D6D] uppercase tracking-widest text-sm leading-relaxed">{tr('unavailable.text')}</p>
        </div>
      </div>
    );
  }

  // --- ÉCRAN : SUCCÈS APRÈS SIGNATURE ---
  if (isSuccess) {
    return (
      <div className="lymfea-client min-h-screen bg-[#FBF7F2] py-20 px-4 flex justify-center items-center text-[#2C2622]">
        <div className="w-full max-w-lg bg-white shadow-sm border border-[#E8DFD2] rounded-sm p-12 sm:p-16 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h2 className="text-xs tracking-[0.3em] text-[#A8542F] uppercase mb-6">{tr('success.byBrand', { hotelName: bookingInfo?.hotel_name })}</h2>
          <h1 className="text-2xl sm:text-3xl font-serif tracking-widest uppercase mb-6 text-[#2C2622]">{tr('success.titleLine1')} <br/> {tr('success.titleLine2')}</h1>
          <div className="w-12 h-[1px] bg-[#C96A43] mx-auto mb-8"></div>
          <p className="text-[#6B6055] uppercase tracking-[0.15em] text-[11px] leading-loose">
            {tr('success.text')}
            <br/><br/>
            {tr('success.text2')}
          </p>
        </div>
      </div>
    );
  }

  // --- ÉCRAN : LE FORMULAIRE ---
  return (
    <div className="lymfea-client min-h-screen bg-[#FBF7F2] py-10 px-4 sm:px-8 flex flex-col items-center text-[#2C2622] selection:bg-[#C96A43] selection:text-white">

      <div className="w-full max-w-4xl bg-white shadow-sm border border-[#E8DFD2] rounded-sm p-6 sm:p-12 md:p-16 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* EN-TÊTE */}
        <div className="text-center mb-16">
          <h1 className="text-3xl sm:text-4xl font-serif tracking-widest uppercase mb-4 text-[#2C2622]">
            {bookingInfo?.hotel_name} <span className="text-[#C96A43] text-xl mx-2 font-light">BY</span> Eïa
          </h1>
          <h2 className="text-sm tracking-[0.2em] text-[#8A7D6D] uppercase">{tr('header.subtitle')}</h2>
          <div className="w-16 h-[1px] bg-[#C96A43] mx-auto mt-8"></div>
        </div>

        {/* INFOS CLIENT */}
        <div className="flex flex-col gap-6 mb-16">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8">
            <div className="flex items-baseline gap-3 flex-1 overflow-hidden">
              <span className="text-xs text-[#8A7D6D] uppercase tracking-widest shrink-0">{tr('client.name')}</span>
              <div className="flex-1 border-b border-[#D9CDBC] pb-1 text-[#2C2622] font-serif text-lg tracking-wide uppercase truncate">
                {bookingInfo?.client_name}
              </div>
            </div>
            <div className="flex items-baseline gap-3 md:w-1/3 shrink-0">
              <span className="text-xs text-[#8A7D6D] uppercase tracking-widest shrink-0">{tr('client.date')}</span>
              <div className="flex-1 border-b border-[#D9CDBC] pb-1 text-[#2C2622] font-serif text-lg tracking-wide">
                {new Date().toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR')}
              </div>
            </div>
          </div>
          <div className="flex items-baseline gap-3 w-full md:w-2/3">
            <span className="text-xs text-[#8A7D6D] uppercase tracking-widest shrink-0">{tr('client.roomNumber')} <span className="text-[10px] text-[#A89B89] tracking-normal hidden sm:inline">{tr('client.roomNumberHint')}</span> :</span>
            <input type="text" value={formData.room_number} onChange={(e) => handleInputChange('room_number', e.target.value)} className="flex-1 bg-transparent border-b border-[#D9CDBC] text-[#2C2622] font-serif text-lg outline-none pb-1 focus:border-[#C96A43] transition-colors uppercase" />
          </div>
        </div>

        {/* SECTION 1 - INFORMATIONS IMPORTANTES */}
        <div className="mb-14">
          <h3 className="font-serif text-2xl uppercase tracking-widest mb-1 text-[#2C2622]">{tr('medical.title')}</h3>
          <p className="text-[11px] text-[#8A7D6D] uppercase tracking-widest mb-10 leading-relaxed border-b border-[#EFE7DA] pb-6">{tr('medical.intro')}</p>

          <div className="space-y-8">
            {[
              { label: tr('medical.pregnant'), field: "is_pregnant" },
              { label: tr('medical.heartIssues'), field: "heart_issues" }
            ].map((q) => (
              <div key={q.field} className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-3">
                <label className="text-sm text-[#4A4038] uppercase tracking-widest leading-relaxed lg:pr-4">{q.label}</label>
                <div className="flex items-center gap-6 shrink-0 pt-2 lg:pt-0">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[#4A4038] uppercase"><input type="radio" name={q.field} value="oui" checked={formData[q.field as keyof typeof formData] === 'oui'} onChange={(e) => handleInputChange(q.field, e.target.value)} className="w-4 h-4 border-[#D9CDBC] focus:ring-[#C96A43] accent-[#C96A43]" /> {tr('common.yes')}</label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[#4A4038] uppercase"><input type="radio" name={q.field} value="non" checked={formData[q.field as keyof typeof formData] === 'non'} onChange={(e) => handleInputChange(q.field, e.target.value)} className="w-4 h-4 border-[#D9CDBC] focus:ring-[#C96A43] accent-[#C96A43]" /> {tr('common.no')}</label>
                </div>
              </div>
            ))}

            {[
              { label: tr('medical.medicalTreatment'), field: "medical_treatment", detail: "medical_treatment_details" },
              { label: tr('medical.chronicPain'), field: "chronic_pain", detail: "chronic_pain_details" },
              { label: tr('medical.allergies'), field: "allergies", detail: "allergies_details" }
            ].map((q) => (
              <div key={q.field} className="space-y-4">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-3">
                  <label className="text-sm text-[#4A4038] uppercase tracking-widest leading-relaxed lg:pr-4">{q.label}</label>
                  <div className="flex items-center gap-6 shrink-0 pt-2 lg:pt-0">
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[#4A4038] uppercase"><input type="radio" name={q.field} value="oui" checked={formData[q.field as keyof typeof formData] === 'oui'} onChange={(e) => handleInputChange(q.field, e.target.value)} className="w-4 h-4 border-[#D9CDBC] focus:ring-[#C96A43] accent-[#C96A43]" /> {tr('common.yes')}</label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[#4A4038] uppercase"><input type="radio" name={q.field} value="non" checked={formData[q.field as keyof typeof formData] === 'non'} onChange={(e) => handleInputChange(q.field, e.target.value)} className="w-4 h-4 border-[#D9CDBC] focus:ring-[#C96A43] accent-[#C96A43]" /> {tr('common.no')}</label>
                  </div>
                </div>
                {/* Toujours affiché pour imiter le papier */}
                <div className="flex items-baseline gap-3 pl-0 lg:pl-4 pt-1">
                  <span className="text-xs text-[#8A7D6D] uppercase tracking-widest shrink-0">{tr('medical.ifYes')}</span>
                  <input type="text" value={formData[q.detail as keyof typeof formData] as string} onChange={(e) => handleInputChange(q.detail, e.target.value)} className="flex-1 bg-transparent border-b border-[#D9CDBC] text-[#2C2622] font-serif text-base outline-none pb-1 focus:border-[#C96A43] transition-colors" />
                </div>
              </div>
            ))}

            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-3 mt-8 pt-8 border-t border-[#EFE7DA]">
              <label className="text-sm text-[#4A4038] uppercase tracking-widest leading-relaxed lg:pr-4">{tr('medical.recentSurgery')}</label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 shrink-0 pt-2 lg:pt-0">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[#4A4038] uppercase"><input type="radio" name="recent_surgery" value="oui_accord" checked={formData.recent_surgery === 'oui_accord'} onChange={(e) => handleInputChange('recent_surgery', e.target.value)} className="w-4 h-4 border-[#D9CDBC] focus:ring-[#C96A43] accent-[#C96A43]" /> {tr('common.yesWithMedicalApproval')}</label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[#4A4038] uppercase"><input type="radio" name="recent_surgery" value="non" checked={formData.recent_surgery === 'non'} onChange={(e) => handleInputChange('recent_surgery', e.target.value)} className="w-4 h-4 border-[#D9CDBC] focus:ring-[#C96A43] accent-[#C96A43]" /> {tr('common.no')}</label>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2 - SLIDERS */}
        <div className="mb-14 pt-8 border-t border-[#EFE7DA]">
          <h3 className="font-serif text-2xl uppercase tracking-widest mb-10 text-[#2C2622]">{tr('state.title')}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 mb-10">
            {[
              { label: tr('state.emotional'), field: 'emotional_state' },
              { label: tr('state.physical'), field: 'physical_state' },
              { label: tr('state.mental'), field: 'mental_state' },
              { label: tr('state.body'), field: 'body_sensation' },
            ].map((item) => (
              <div key={item.field} className="flex flex-col gap-3">
                <div className="flex justify-between items-end gap-4">
                  <span className="text-[13px] text-[#4A4038] uppercase tracking-widest leading-tight">{item.label} :</span>
                  <span className="text-lg font-serif text-[#C96A43] shrink-0 whitespace-nowrap">
                    {(formData[item.field as keyof typeof formData] as string | number) || 5} <span className="text-sm text-[#A89B89]">/ 10</span>
                  </span>
                </div>
                <input
                  type="range" min="1" max="10"
                  value={(formData[item.field as keyof typeof formData] as string | number) || 5}
                  onChange={(e) => handleInputChange(item.field, e.target.value)}
                  className="w-full h-[2px] bg-[#E8DFD2] appearance-none cursor-pointer accent-[#C96A43] mt-1"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row gap-3 lg:items-baseline mt-10">
            <span className="shrink-0 text-sm text-[#4A4038] uppercase tracking-widest">{tr('state.tensions')} <span className="text-[10px] text-[#8A7D6D] tracking-normal">{tr('state.tensionsHint')}</span> :</span>
            <input type="text" value={formData.localized_tensions} onChange={(e) => handleInputChange('localized_tensions', e.target.value)} className="flex-1 bg-transparent border-b border-[#D9CDBC] text-[#2C2622] font-serif text-base outline-none pb-1 focus:border-[#C96A43] transition-colors" />
          </div>
        </div>

        {/* SECTION 3 - PRÉFÉRENCES */}
        <div className="mb-14 pt-8 border-t border-[#EFE7DA]">
          <h3 className="font-serif text-2xl uppercase tracking-widest mb-10 text-[#2C2622]">{tr('preferences.title')}</h3>

          <div className="flex flex-col lg:flex-row lg:items-center gap-6 mb-10">
            <span className="text-sm text-[#4A4038] uppercase tracking-widest shrink-0">{tr('preferences.question')}</span>
            <div className="flex flex-wrap items-center gap-6 sm:gap-8">
              {[
                { value: 'leger', label: tr('preferences.light') },
                { value: 'moyen', label: tr('preferences.medium') },
                { value: 'appuye', label: tr('preferences.firm') },
              ].map((intensity) => (
                <label key={intensity.value} className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[#4A4038] uppercase tracking-wider">
                  <input type="radio" name="preferred_intensity" value={intensity.value} checked={formData.preferred_intensity === intensity.value} onChange={(e) => handleInputChange('preferred_intensity', e.target.value)} className="w-4 h-4 border-[#D9CDBC] focus:ring-[#C96A43] accent-[#C96A43]" />
                  {intensity.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-10">
            <div className="flex flex-col gap-3">
              <span className="text-sm text-[#4A4038] uppercase tracking-widest">{tr('preferences.focusZones')}</span>
              <input type="text" value={formData.focus_zones} onChange={(e) => handleInputChange('focus_zones', e.target.value)} className="w-full bg-transparent border-b border-[#D9CDBC] text-[#2C2622] font-serif text-base outline-none pb-1 focus:border-[#C96A43] transition-colors" />
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-sm text-[#4A4038] uppercase tracking-widest">{tr('preferences.avoidZones')}</span>
              <input type="text" value={formData.avoid_zones} onChange={(e) => handleInputChange('avoid_zones', e.target.value)} className="w-full bg-transparent border-b border-[#D9CDBC] text-[#2C2622] font-serif text-base outline-none pb-1 focus:border-[#C96A43] transition-colors" />
            </div>
          </div>
        </div>

        {/* SECTION 4 : FACTURATION */}
        <div className="mb-14 bg-[#F8F3EC] p-6 sm:p-10 border border-[#E8DFD2] rounded-sm">
          <h3 className="font-serif text-xl uppercase tracking-widest mb-8 text-[#2C2622]">
            {tr('billing.title')} <span className="text-xs text-[#8A7D6D] tracking-normal ml-0 sm:ml-2 block sm:inline mt-2 sm:mt-0">{tr('billing.titleHint')}</span>
          </h3>

          <div className="text-sm text-[#4A4038] leading-loose uppercase tracking-wide">
            {tr('billing.undersignedPrefix')}
            <span className="inline-block border-b border-[#D9CDBC] font-serif text-lg px-2 sm:px-4 mx-2 text-[#2C2622]">{bookingInfo?.client_name}</span>
            {tr('billing.roomPrefix')}
            <input type="text" value={formData.room_number} onChange={(e) => handleInputChange('room_number', e.target.value)} className="bg-transparent border-b border-[#D9CDBC] text-center font-serif text-lg outline-none w-16 sm:w-24 mx-2 focus:border-[#C96A43]" />
            {tr('billing.authorize')}

            <div className="mt-8 flex flex-col md:flex-row gap-6 md:gap-8 md:items-baseline">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-3 flex-1">
                <span className="shrink-0 text-[#8A7D6D] text-xs tracking-widest">{tr('billing.serviceType')}</span>
                <div className="flex-1 border-b border-[#D9CDBC] pb-1 text-[#2C2622] font-serif text-lg">{treatmentLabel}</div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-3 w-full md:w-1/3">
                <span className="shrink-0 text-[#8A7D6D] text-xs tracking-widest">{tr('billing.amount')}</span>
                <div className="flex-1 border-b border-[#D9CDBC] pb-1 text-[#2C2622] font-serif text-lg sm:text-right pr-2">{priceLabel}</div>
              </div>
            </div>
          </div>

          <div className="mt-10 flex items-center gap-4">
            <input type="checkbox" id="confirm-billing" checked={formData.billing_confirmed} onChange={(e) => handleInputChange('billing_confirmed', e.target.checked)} className="w-5 h-5 border-[#D9CDBC] focus:ring-[#C96A43] accent-[#C96A43] rounded-sm cursor-pointer" />
            <label htmlFor="confirm-billing" className="text-sm font-semibold uppercase tracking-widest cursor-pointer text-[#2C2622]">{tr('billing.confirm')}</label>
          </div>
        </div>

        {/* SECTION 5 : CONSENTEMENT & SIGNATURE */}
        <div className="mb-4">
          <h3 className="font-serif text-2xl uppercase tracking-widest mb-6 text-[#2C2622]">{tr('consent.title')}</h3>
          <div className="text-[11px] text-[#6B6055] space-y-4 uppercase tracking-widest leading-relaxed text-justify mb-10">
            <p>{tr('consent.text', { hotelName: bookingInfo?.hotel_name })}</p>
          </div>

          <div className="mt-10">
            <p className="text-sm font-bold uppercase tracking-widest mb-6 text-center text-[#2C2622]">{tr('consent.signatureLabel')} <br/><span className="text-[10px] font-normal text-[#8A7D6D] tracking-widest mt-1 block">{tr('consent.signatureHint')}</span></p>
            <div className="border border-[#E8DFD2] p-2 bg-[#F8F3EC] relative shadow-inner rounded-sm">
              <span className="absolute top-4 left-6 text-[#D9CDBC] font-serif italic pointer-events-none select-none text-lg">{tr('consent.canvasPlaceholder')}</span>
              <canvas
                ref={canvasRef} width={800} height={250}
                className="w-full bg-transparent touch-none cursor-crosshair relative z-10"
                onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
              />
            </div>

            <div className="flex justify-between items-center mt-3">
              <button onClick={clearCanvas} className="text-xs text-[#8A7D6D] hover:text-[#C96A43] uppercase tracking-widest flex items-center gap-1 transition-colors">
                <Eraser className="w-3 h-3" /> {tr('consent.clear')}
              </button>
            </div>
          </div>
        </div>

        {/* BOUTON VALIDATION */}
        <div className="flex justify-center mt-12 mb-4">
          <button
            onClick={handleSubmit}
            disabled={!hasDrawn || submitting}
            className="bg-[#2C2622] text-white px-8 sm:px-12 py-4 sm:py-5 uppercase tracking-[0.2em] text-xs sm:text-sm font-medium hover:bg-[#2C2622]/90 disabled:bg-[#E8DFD2] disabled:text-[#A89B89] disabled:cursor-not-allowed transition-all flex items-center shadow-sm hover:shadow-md rounded-sm w-full sm:w-auto justify-center active:scale-[0.98]"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : <Check className="w-4 h-4 mr-3" />}
            {tr('actions.submit')}
          </button>
        </div>

      </div>

      {/* FOOTER PDF */}
      <div className="text-center text-[10px] text-[#A89B89] font-serif uppercase tracking-widest mt-10 mb-4">
        <p>17, Rue du Quatre-Septembre, Paris 2</p>
      </div>

    </div>
  );
}
