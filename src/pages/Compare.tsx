import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CompareCta } from "@/components/landing/compare/CompareCta";
import { ComparisonMatrix, ComparisonLegend } from "@/components/landing/compare/ComparisonMatrix";
import { JsonLd } from "@/components/landing/compare/JsonLd";
import { useCompareSeo, SITE_ORIGIN } from "@/components/landing/compare/useCompareSeo";
import { COMPETITORS, DATA_AS_OF } from "@/components/landing/compare/competitors";

const Compare = () => {
  const { t, i18n } = useTranslation("compare");
  const lang = i18n.language.startsWith("fr") ? "fr" : "en";

  useCompareSeo({
    title: `${t("hub.title")} | Saoma`,
    description: t("hub.subtitle"),
    path: "/compare",
  });

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("breadcrumb.home"), item: `${SITE_ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: t("breadcrumb.compare"), item: `${SITE_ORIGIN}/compare` },
    ],
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: COMPETITORS.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `Saoma vs ${c.name}`,
      url: `${SITE_ORIGIN}/compare/saoma-vs-${c.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-background font-grotesk text-foreground antialiased">
      <Navbar />
      <main>
        <section className="px-4 pb-12 pt-28 md:px-6 md:pb-16 md:pt-36">
          <div className="container mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mx-auto max-w-3xl text-center"
            >
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
                {t("hub.eyebrow")}
              </span>
              <h1 className="mt-3 font-serif text-4xl tracking-tight text-foreground md:text-6xl">
                {t("hub.title")}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground md:text-xl">
                {t("hub.subtitle")}
              </p>
            </motion.div>
          </div>
        </section>

        <section className="px-4 md:px-6">
          <div className="container mx-auto">
            <div className="mx-auto max-w-5xl">
              <h2 className="font-serif text-2xl tracking-tight text-foreground md:text-3xl">
                {t("hub.tableHeading")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("hub.tableNote")}</p>
              <div className="mt-6">
                <ComparisonMatrix competitors={COMPETITORS} linkColumns />
              </div>
              <div className="mt-4">
                <ComparisonLegend />
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 md:px-6 md:py-24">
          <div className="container mx-auto">
            <div className="mx-auto max-w-5xl">
              <h2 className="font-serif text-2xl tracking-tight text-foreground md:text-3xl">
                {t("hub.cardsHeading")}
              </h2>
              <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {COMPETITORS.map((c, i) => (
                  <motion.a
                    key={c.slug}
                    href={`/compare/saoma-vs-${c.slug}`}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5, delay: (i % 3) * 0.06 }}
                    whileHover={{ y: -4 }}
                    className="group flex flex-col rounded-2xl border border-border/60 bg-card p-6 transition-colors hover:border-gold-400"
                  >
                    <span className="w-fit rounded-full bg-gold-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-gold-700">
                      {t(`categories.${c.category}`)}
                    </span>
                    <h3 className="mt-4 font-serif text-xl text-foreground">
                      Saoma vs {c.name}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {c[lang].tagline}
                    </p>
                    <p className="mt-4 text-sm text-foreground/80">
                      <span className="font-medium">{t("hub.bestForLabel")} : </span>
                      {c[lang].bestFor}
                    </p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      {t("hub.cardCta")}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </motion.a>
                ))}
              </div>
            </div>
          </div>
        </section>

        <CompareCta />

        <div className="container mx-auto px-4 pb-12 md:px-6">
          <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted-foreground/70">
            {t("disclaimer", { date: DATA_AS_OF })}
          </p>
        </div>
      </main>
      <Footer />

      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />
    </div>
  );
};

export default Compare;
