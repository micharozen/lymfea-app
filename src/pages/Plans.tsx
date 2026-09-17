import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { Pricing } from "@/components/landing/Pricing";
import { PlanComparison } from "@/components/landing/plans/PlanComparison";
import { Faq } from "@/components/landing/Faq";
import { CtaSection } from "@/components/landing/CtaSection";
import { useCompareSeo } from "@/components/landing/compare/useCompareSeo";

/**
 * Le comparatif des offres vit ici plutôt que sur la page d'accueil : sur
 * soixante lignes, il coupait le scroll d'un visiteur qui découvre le produit,
 * alors qu'il n'intéresse qu'un prospect en fin de cycle. Les deux composants
 * partagent le cache TanStack Query des tarifs, donc pas de requête en double.
 */
const Plans = () => {
  const { t } = useTranslation("landing");

  useCompareSeo({
    title: `${t("plansPage.title")} | Saoma`,
    description: t("plansPage.subtitle"),
    path: "/tarifs",
  });

  return (
    <div className="min-h-screen bg-background font-grotesk text-foreground antialiased">
      <Navbar />
      <main>
        <section className="px-4 pb-4 pt-28 md:px-6 md:pt-36">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="container mx-auto max-w-3xl text-center"
          >
            <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-6xl">
              {t("plansPage.title")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground md:text-xl">
              {t("plansPage.subtitle")}
            </p>
          </motion.div>
        </section>

        <Pricing />
        <PlanComparison />
        <Faq />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
};

export default Plans;
