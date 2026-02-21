import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { X } from "lucide-react";
import { brand } from "@/config/brand";
import welcomeBg from "@/assets/pwa-welcome.webp";

const PwaWelcome = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('pwa');
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return <div className="h-dvh w-full relative overflow-hidden">
      {/* Background Image — cinematic zoom-out */}
      <div className="absolute inset-0">
        <img
          src={welcomeBg}
          className="h-full w-full object-cover object-[center_20%] animate-hero-zoom"
          alt="Ambiance"
        />
      </div>

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-end px-6 pt-safe pb-4 mt-4">
        <LanguageSwitcher variant="client" />
      </div>

      {/* Content — cinematic sequential reveal */}
      <div className="absolute inset-0 z-10 flex flex-col items-center px-8 sm:px-12">
        {/* Spacer top */}
        <div className="flex-1" />

        {/* Brand Name + Subtitle — centered */}
        <div className="text-center">
          <h1
            className="font-grotesk font-light text-4xl sm:text-5xl md:text-6xl leading-[0.95] text-white uppercase tracking-wide animate-reveal-text"
            style={{ animationDelay: '0.5s' }}
          >
            {brand.name}
          </h1>
          <div
            className="w-12 h-px bg-white/40 mx-auto mt-4 mb-3 animate-expand-line"
            style={{ animationDelay: '1s' }}
          />
          <p
            className="font-grotesk font-light italic text-xl sm:text-2xl text-white/90 uppercase tracking-wide animate-slide-up-fade"
            style={{ animationDelay: '1.3s' }}
          >
            {t('welcome.subtitle')}
          </p>
          <p
            className="font-grotesk font-light text-sm sm:text-base text-white/60 mt-3 animate-slide-up-fade"
            style={{ animationDelay: '1.6s' }}
          >
            {t('welcome.description')}
          </p>
        </div>

        {/* Spacer bottom */}
        <div className="flex-1" />

        {/* CTA + Legal — bottom */}
        <div
          className="w-full pb-safe mb-6 space-y-4 animate-slide-up-fade"
          style={{ animationDelay: '1.8s' }}
        >
          <Button
            onClick={() => navigate("/pwa/login")}
            className="w-full h-14 text-base font-grotesk font-medium tracking-widest uppercase bg-white text-black hover:bg-white/90 transition-all duration-300 shadow-lg rounded-full"
            size="lg"
          >
            {t('welcome.getStarted')}
          </Button>

          <p className="text-[10px] text-center text-white/50 px-2 leading-relaxed">
            {t('welcome.termsIntro')}
            <br />
            <button onClick={() => setShowTerms(true)} className="underline hover:text-white/80 transition-colors">
              {t('welcome.termsOfUse')}
            </button>
            {" "}{t('welcome.and')}{" "}
            <button onClick={() => setShowPrivacy(true)} className="underline hover:text-white/80 transition-colors">
              {t('welcome.privacyPolicy')}
            </button>
          </p>
        </div>
      </div>

      {/* Terms of Use Sheet */}
      <Sheet open={showTerms} onOpenChange={setShowTerms}>
        <SheetContent side="bottom" className="h-[80vh] max-h-[80vh] p-0 flex flex-col [&>button]:hidden">
          <div className="shrink-0 bg-background z-10 p-4 border-b flex items-center justify-between h-14">
            <SheetTitle className="truncate">{t('welcome.termsOfUse')}</SheetTitle>
            <button onClick={() => setShowTerms(false)} className="rounded-full p-1 hover:bg-muted shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">{t('terms.legalNotice.title')}</h3>
            <p className="whitespace-pre-line">{t('terms.legalNotice.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.object.title')}</h3>
            <p>{t('terms.object.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.acceptance.title')}</h3>
            <p>{t('terms.acceptance.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.service.title')}</h3>
            <p>{t('terms.service.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.account.title')}</h3>
            <p>{t('terms.account.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.obligations.title')}</h3>
            <p className="whitespace-pre-line">{t('terms.obligations.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.liability.title')}</h3>
            <p>{t('terms.liability.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.withdrawal.title')}</h3>
            <p className="whitespace-pre-line">{t('terms.withdrawal.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.mediation.title')}</h3>
            <p>{t('terms.mediation.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.ip.title')}</h3>
            <p>{t('terms.ip.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.law.title')}</h3>
            <p>{t('terms.law.content')}</p>

            <h3 className="font-semibold text-foreground">{t('terms.update.title')}</h3>
            <p>{t('terms.update.content')}</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Privacy Policy Sheet */}
      <Sheet open={showPrivacy} onOpenChange={setShowPrivacy}>
        <SheetContent side="bottom" className="h-[80vh] max-h-[80vh] p-0 flex flex-col [&>button]:hidden">
          <div className="shrink-0 bg-background z-10 p-4 border-b flex items-center justify-between h-14">
            <SheetTitle className="truncate">{t('welcome.privacyPolicy')}</SheetTitle>
            <button onClick={() => setShowPrivacy(false)} className="rounded-full p-1 hover:bg-muted shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">{t('privacy.controller.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.controller.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.collect.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.collect.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.purpose.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.purpose.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.legal.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.legal.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.retention.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.retention.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.rights.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.rights.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.cnil.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.cnil.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.recipients.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.recipients.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.transfer.title')}</h3>
            <p>{t('privacy.transfer.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.cookies.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.cookies.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.security.title')}</h3>
            <p>{t('privacy.security.content')}</p>

            <h3 className="font-semibold text-foreground">{t('privacy.update.title')}</h3>
            <p className="whitespace-pre-line">{t('privacy.update.content')}</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>;
};
export default PwaWelcome;
