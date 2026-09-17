import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CtaSection } from "@/components/landing/CtaSection";
import { useCompareSeo } from "@/components/landing/compare/useCompareSeo";
import { BRAND_DEMO_CTA } from "@/components/landing/constants";
import { findCustomerStory } from "@/components/landing/customers";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Étude de cas d'un établissement.
 *
 * Tant que `status` vaut "soon", la page annonce que le témoignage est en
 * préparation. Elle n'affiche ni citation, ni chiffre, ni photo : un
 * témoignage attribué à un établissement réel n'est publiable qu'une fois
 * relu et validé par lui.
 */
const CustomerStory = () => {
  const { t } = useTranslation("landing");
  const { slug } = useParams<{ slug: string }>();
  const story = findCustomerStory(slug);

  const venueName = story ? t(`trustedBy.venues.${story.key}.name`) : "";

  useCompareSeo({
    title: story ? `${venueName} | Saoma` : "Saoma",
    description: story ? t("customers.story.metaDescription", { venue: venueName }) : "",
    path: story ? `/clients/${story.slug}` : "/clients",
  });

  if (!story) return <Navigate to="/clients" replace />;

  return (
    <div className="min-h-screen bg-background font-grotesk text-foreground antialiased">
      <Navbar />
      <main>
        <section className="px-4 pb-16 pt-28 md:px-6 md:pb-24 md:pt-36">
          <div className="container mx-auto max-w-3xl">
            <Link
              to="/clients"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              {t("customers.story.back")}
            </Link>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mt-10"
            >
              <img
                src={story.logo}
                alt={venueName}
                className={`w-auto object-contain brightness-0 ${story.logoClass}`}
              />

              <h1 className="mt-8 font-serif text-4xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
                {venueName}
              </h1>
              <p className="mt-3 text-base text-muted-foreground md:text-lg">
                {t(`trustedBy.venues.${story.key}.kind`)}
                {" · "}
                {t(`trustedBy.venues.${story.key}.area`)}
              </p>

              <div className="mt-12 rounded-2xl border border-dashed border-gold-400 bg-gold-50/60 p-8 md:p-12">
                <p className="font-serif text-2xl leading-snug text-foreground md:text-3xl">
                  {t("customers.story.soonTitle")}
                </p>
                <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                  {t("customers.story.soonBody")}
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    asChild
                    size="lg"
                    className="group h-12 bg-foreground px-6 text-base text-background hover:bg-foreground/90"
                  >
                    <a href={BRAND_DEMO_CTA}>
                      {t("customers.story.cta")}
                      <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </a>
                  </Button>
                  <a
                    href={story.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {t("customers.story.visitSite")}
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <CtaSection />
      </main>
      <Footer />
    </div>
  );
};

export default CustomerStory;
