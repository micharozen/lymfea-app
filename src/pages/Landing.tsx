import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { ProblemSolution } from "@/components/landing/ProblemSolution";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { CtaSection } from "@/components/landing/CtaSection";
import { Footer } from "@/components/landing/Footer";

const Landing = () => {
  const { t, i18n } = useTranslation("landing");

  useEffect(() => {
    const isFr = i18n.language.startsWith("fr");
    document.title = isFr
      ? "Eïa — La plateforme de gestion spa pour hôtels"
      : "Eïa — The spa management platform for hotels";

    const metaDesc = document.querySelector('meta[name="description"]');
    const descContent = isFr
      ? "La plateforme tout-en-un pour gérer le spa de votre hôtel : agenda unifié, PMS Opera & Mews, app thérapeute, booking client sans friction."
      : "The all-in-one platform to run your hotel spa: unified schedule, Opera & Mews PMS, therapist app, frictionless client booking.";
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
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
};

export default Landing;
