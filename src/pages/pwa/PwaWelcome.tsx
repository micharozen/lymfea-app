import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { X } from "lucide-react";
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
          <div className="space-y-3 min-h-[88px]">
            <h1 className="text-4xl font-bold leading-tight">
              Beauty Room Service
            </h1>
            <p className="text-base text-white/90 leading-relaxed min-h-[24px]">
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