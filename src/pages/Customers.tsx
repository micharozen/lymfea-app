import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CtaSection } from "@/components/landing/CtaSection";
import { useCompareSeo } from "@/components/landing/compare/useCompareSeo";
import { CUSTOMER_STORIES } from "@/components/landing/customers";

const EASE = [0.16, 1, 0.3, 1] as const;

const Customers = () => {
  const { t } = useTranslation("landing");

  useCompareSeo({
    title: `${t("customers.title")} | Saoma`,
    description: t("customers.subtitle"),
    path: "/clients",
  });

  return (
    <div className="min-h-screen bg-background font-grotesk text-foreground antialiased">
      <Navbar />
      <main>
        <section className="px-4 pb-16 pt-28 md:px-6 md:pb-24 md:pt-36">
          <div className="container mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mx-auto max-w-3xl text-center"
            >
              <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-6xl">
                {t("customers.title")}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground md:text-xl">
                {t("customers.subtitle")}
              </p>
            </motion.div>

            <ul className="mt-14 grid gap-6 md:mt-20 md:grid-cols-3">
              {CUSTOMER_STORIES.map((story, i) => (
                <motion.li
                  key={story.key}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                >
                  <Link
                    to={`/clients/${story.slug}`}
                    className="group flex h-full flex-col justify-between rounded-2xl border border-border/60 bg-card p-8 transition-colors hover:border-gold-400 md:p-10"
                  >
                    <span className="flex min-h-[80px] items-center">
                      <img
                        src={story.logo}
                        alt={t(`trustedBy.venues.${story.key}.name`)}
                        loading="lazy"
                        className={`w-auto object-contain opacity-70 brightness-0 transition-opacity group-hover:opacity-100 ${story.logoClass}`}
                      />
                    </span>

                    <span className="mt-12 block">
                      <span className="block text-xs text-muted-foreground">
                        {t(`trustedBy.venues.${story.key}.kind`)}
                        {" · "}
                        {t(`trustedBy.venues.${story.key}.area`)}
                      </span>
                      <span className="mt-2 block font-serif text-xl leading-snug text-foreground md:text-2xl">
                        {t(`trustedBy.venues.${story.key}.name`)}
                      </span>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                        {/* Le statut est annoncé sur la carte : on ne fait pas
                            cliquer vers une page vide sans prévenir. */}
                        {story.status === "soon"
                          ? t("customers.soon")
                          : t("customers.readStory")}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        <CtaSection />
      </main>
      <Footer />
    </div>
  );
};

export default Customers;
