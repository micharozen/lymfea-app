import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import oomLogo from "@/assets/oom-monogram.svg";
import welcomeBg from "@/assets/welcome-bg.png";

const PwaWelcome = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('pwa');
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  
  return <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 bg-cover bg-center" style={{
      backgroundImage: `url(${welcomeBg})`
    }}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col justify-between p-6 text-white">
        {/* Top Logo and Language Switcher */}
        <div className="pt-12 flex justify-between items-start">
          <div className="flex-1" />
          <img src={oomLogo} alt="OOM" className="w-16 h-16" />
          <div className="flex-1 flex justify-end">
            <LanguageSwitcher variant="client" />
          </div>
        </div>

        {/* Bottom Content */}
        <div className="pb-8 space-y-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold leading-tight">
              Beauty Room Service
            </h1>
            <p className="text-base text-white/90 leading-relaxed">
              {t('welcome.subtitle')}
            </p>
          </div>

          <Button onClick={() => navigate("/pwa/login")} className="w-full h-14 text-base bg-white text-black hover:bg-white/90 font-medium rounded-full" size="lg">
            {t('welcome.getStarted')}
          </Button>

          <p className="text-xs text-center text-white/70 px-4">
            {t('welcome.termsIntro')}{" "}
            <button onClick={() => setShowTerms(true)} className="underline hover:text-white transition-colors">
              {t('welcome.termsOfUse')}
            </button>
            {" "}{t('welcome.and')}{" "}
            <button onClick={() => setShowPrivacy(true)} className="underline hover:text-white transition-colors">
              {t('welcome.privacyPolicy')}
            </button>
          </p>
        </div>
      </div>

      {/* Terms of Use Sheet */}
      <Sheet open={showTerms} onOpenChange={setShowTerms}>
        <SheetContent side="bottom" className="h-[80vh] p-0 flex flex-col">
          <SheetHeader className="sticky top-0 bg-background z-10 p-4 border-b">
            <SheetTitle>{t('welcome.termsOfUse')}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">{t('terms.acceptance.title', '1. Acceptation des conditions')}</h3>
            <p>{t('terms.acceptance.content', "En accédant et en utilisant OOM Beauty Room Service, vous acceptez d'être lié par les termes et dispositions de cet accord.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('terms.service.title', '2. Description du service')}</h3>
            <p>{t('terms.service.content', "OOM fournit des services de soins capillaires et de beauté de luxe directement dans les chambres d'hôtel. Les services sont soumis à disponibilité et confirmation de réservation.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('terms.booking.title', '3. Réservation et paiement')}</h3>
            <p>{t('terms.booking.content', "Toutes les réservations doivent être effectuées via notre plateforme. Le paiement est requis au moment de la réservation. Les politiques d'annulation s'appliquent comme spécifié lors du processus de réservation.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('terms.responsibilities.title', "4. Responsabilités de l'utilisateur")}</h3>
            <p>{t('terms.responsibilities.content', "Vous acceptez de fournir des informations exactes lors de la réservation et d'être présent à l'endroit et à l'heure spécifiés pour votre rendez-vous.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('terms.liability.title', '5. Limitation de responsabilité')}</h3>
            <p>{t('terms.liability.content', "OOM n'est pas responsable des dommages indirects, accessoires ou consécutifs découlant de l'utilisation de nos services.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('terms.changes.title', '6. Modifications des conditions')}</h3>
            <p>{t('terms.changes.content', "Nous nous réservons le droit de modifier ces conditions à tout moment. L'utilisation continue du service constitue l'acceptation des conditions modifiées.")}</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Privacy Policy Sheet */}
      <Sheet open={showPrivacy} onOpenChange={setShowPrivacy}>
        <SheetContent side="bottom" className="h-[80vh] p-0 flex flex-col">
          <SheetHeader className="sticky top-0 bg-background z-10 p-4 border-b">
            <SheetTitle>{t('welcome.privacyPolicy')}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">{t('privacy.collect.title', '1. Informations collectées')}</h3>
            <p>{t('privacy.collect.content', "Nous collectons des informations personnelles incluant nom, email, numéro de téléphone et détails de chambre d'hôtel nécessaires pour fournir nos services.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('privacy.use.title', '2. Utilisation de vos informations')}</h3>
            <p>{t('privacy.use.content', "Vos informations sont utilisées pour traiter les réservations, communiquer les détails des rendez-vous et fournir un support client. Nous pouvons également les utiliser pour améliorer nos services.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('privacy.sharing.title', '3. Partage des informations')}</h3>
            <p>{t('privacy.sharing.content', "Nous partageons vos informations uniquement avec les professionnels de beauté assignés à votre réservation et l'hôtel où vous séjournez. Nous ne vendons pas vos informations personnelles.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('privacy.security.title', '4. Sécurité des données')}</h3>
            <p>{t('privacy.security.content', "Nous mettons en œuvre des mesures de sécurité appropriées pour protéger vos informations personnelles contre tout accès, modification ou destruction non autorisés.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('privacy.rights.title', '5. Vos droits')}</h3>
            <p>{t('privacy.rights.content', "Vous avez le droit d'accéder, de corriger ou de supprimer vos informations personnelles. Contactez-nous pour exercer ces droits.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('privacy.cookies.title', '6. Cookies')}</h3>
            <p>{t('privacy.cookies.content', "Nous utilisons des cookies pour améliorer votre expérience sur notre plateforme et analyser les tendances d'utilisation.")}</p>
            
            <h3 className="font-semibold text-foreground">{t('privacy.contact.title', '7. Nous contacter')}</h3>
            <p>{t('privacy.contact.content', "Pour toute question concernant cette politique de confidentialité, veuillez contacter notre équipe de support.")}</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>;
};
export default PwaWelcome;