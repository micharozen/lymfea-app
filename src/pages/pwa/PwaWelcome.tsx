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
            {t('welcome.termsIntro', 'By continuing, you agree to our')}{" "}
            <button onClick={() => setShowTerms(true)} className="underline hover:text-white transition-colors">
              {t('welcome.termsOfUse')}
            </button>
            {" "}{t('common:and', 'and')}{" "}
            <button onClick={() => setShowPrivacy(true)} className="underline hover:text-white transition-colors">
              {t('welcome.privacyPolicy')}
            </button>
          </p>
        </div>
      </div>

      {/* Terms of Use Sheet */}
      <Sheet open={showTerms} onOpenChange={setShowTerms}>
        <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('welcome.termsOfUse')}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">1. Acceptance of Terms</h3>
            <p>By accessing and using OOM Beauty Room Service, you accept and agree to be bound by the terms and provision of this agreement.</p>
            
            <h3 className="font-semibold text-foreground">2. Service Description</h3>
            <p>OOM provides luxury hair and beauty treatment services directly to hotel guest rooms. Services are subject to availability and booking confirmation.</p>
            
            <h3 className="font-semibold text-foreground">3. Booking and Payment</h3>
            <p>All bookings must be made through our platform. Payment is required at the time of booking. Cancellation policies apply as specified during the booking process.</p>
            
            <h3 className="font-semibold text-foreground">4. User Responsibilities</h3>
            <p>You agree to provide accurate information during booking and to be present at the specified location and time for your appointment.</p>
            
            <h3 className="font-semibold text-foreground">5. Limitation of Liability</h3>
            <p>OOM is not liable for any indirect, incidental, or consequential damages arising from the use of our services.</p>
            
            <h3 className="font-semibold text-foreground">6. Changes to Terms</h3>
            <p>We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of modified terms.</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Privacy Policy Sheet */}
      <Sheet open={showPrivacy} onOpenChange={setShowPrivacy}>
        <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('welcome.privacyPolicy')}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4 text-sm text-muted-foreground">
            <h3 className="font-semibold text-foreground">1. Information We Collect</h3>
            <p>We collect personal information including name, email, phone number, and hotel room details necessary to provide our services.</p>
            
            <h3 className="font-semibold text-foreground">2. How We Use Your Information</h3>
            <p>Your information is used to process bookings, communicate appointment details, and provide customer support. We may also use it to improve our services.</p>
            
            <h3 className="font-semibold text-foreground">3. Information Sharing</h3>
            <p>We share your information only with beauty professionals assigned to your booking and the hotel where you are staying. We do not sell your personal information.</p>
            
            <h3 className="font-semibold text-foreground">4. Data Security</h3>
            <p>We implement appropriate security measures to protect your personal information from unauthorized access, alteration, or destruction.</p>
            
            <h3 className="font-semibold text-foreground">5. Your Rights</h3>
            <p>You have the right to access, correct, or delete your personal information. Contact us to exercise these rights.</p>
            
            <h3 className="font-semibold text-foreground">6. Cookies</h3>
            <p>We use cookies to enhance your experience on our platform and analyze usage patterns.</p>
            
            <h3 className="font-semibold text-foreground">7. Contact Us</h3>
            <p>For questions about this privacy policy, please contact our support team.</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>;
};
export default PwaWelcome;