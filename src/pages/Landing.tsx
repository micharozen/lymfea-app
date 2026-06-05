import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { ProblemSolution } from "@/components/landing/ProblemSolution";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { CtaSection } from "@/components/landing/CtaSection";
import { Footer } from "@/components/landing/Footer";

const Landing = () => {
  const { t, i18n } = useTranslation("landing");

  useEffect(() => {
    const isFr = i18n.language.startsWith("fr");
    document.title = isFr
      ? "Saoma — Logiciel de gestion spa pour hôtels | PMS Opera & Mews"
      : "Saoma — Spa management software for hotels | Opera & Mews PMS";

    const metaDesc = document.querySelector('meta[name="description"]');
    const descContent = isFr
      ? "Saoma, la plateforme tout-en-un pour gérer le spa de votre hôtel : agenda unifié, intégration PMS Opera Cloud & Mews, app thérapeute mobile, booking client sans friction. Essai gratuit 14 jours."
      : "Saoma, the all-in-one platform to run your hotel spa: unified schedule, Opera Cloud & Mews PMS, therapist app, frictionless client booking. 14-day free trial.";
    if (metaDesc) metaDesc.setAttribute("content", descContent);

    document.documentElement.lang = isFr ? "fr" : "en";
  }, [i18n.language, t]);

  return (
    <div className="min-h-screen bg-background font-grotesk text-foreground antialiased">
      <Navbar />
      <main>
        <Hero />
        <ProblemSolution />
        <FeaturesGrid />
        <HowItWorks />
        <Pricing />
        <Faq />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
};

export default Landing;
