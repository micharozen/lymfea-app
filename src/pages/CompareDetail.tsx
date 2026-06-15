import { useTranslation } from "react-i18next";
import { Navigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ChevronRight, Sparkles } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CompareCta } from "@/components/landing/compare/CompareCta";
import { ComparisonMatrix, ComparisonLegend } from "@/components/landing/compare/ComparisonMatrix";
import { JsonLd } from "@/components/landing/compare/JsonLd";
import { useCompareSeo, SITE_ORIGIN } from "@/components/landing/compare/useCompareSeo";
import { getCompetitor, DATA_AS_OF } from "@/components/landing/compare/competitors";

const CompareDetail = () => {
  // Route is /compare/:slug (React Router v6 requires a full-segment param), so
  // the param carries the "saoma-vs-" prefix from the SEO-friendly URL.
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation("compare");
  const competitorSlug = (slug ?? "").replace(/^saoma-vs-/, "");
  const competitor = getCompetitor(competitorSlug);

  // useCompareSeo must run unconditionally (hooks order); feed safe fallbacks.
  const lang = i18n.language.startsWith("fr") ? "fr" : "en";
  const content = competitor?.[lang];
  const year = DATA_AS_OF.split("-")[0];
  const seoTitle = competitor
    ? lang === "fr"
      ? `Saoma vs ${competitor.name} : comparatif logiciel spa (${year})`
      : `Saoma vs ${competitor.name}: spa software comparison (${year})`
    : "Saoma — Comparatifs";

  useCompareSeo({
    title: seoTitle,
    description: content?.summary ?? "",
    path: competitor ? `/compare/saoma-vs-${competitor.slug}` : `/compare/${slug ?? ""}`,
  });

  if (!competitor || !content) {
    return <Navigate to="/compare" replace />;
  }

  const pageUrl = `${SITE_ORIGIN}/compare/saoma-vs-${competitor.slug}`;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("breadcrumb.home"), item: `${SITE_ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: t("breadcrumb.compare"), item: `${SITE_ORIGIN}/compare` },
      { "@type": "ListItem", position: 3, name: `Saoma vs ${competitor.name}`, item: pageUrl },
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faq.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <div className="min-h-screen bg-background font-grotesk text-foreground antialiased">
      <Navbar />
      <main>
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="container mx-auto px-4 pt-24 md:px-6 md:pt-28"
        >
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <li><a href="/" className="hover:text-foreground">{t("breadcrumb.home")}</a></li>
            <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
            <li><a href="/compare" className="hover:text-foreground">{t("breadcrumb.compare")}</a></li>
            <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
            <li className="text-foreground/80">Saoma vs {competitor.name}</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="px-4 pb-10 pt-8 md:px-6 md:pb-14 md:pt-10">
          <div className="container mx-auto max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
                {t("detail.eyebrow")}
              </span>
              <h1 className="mt-3 font-serif text-4xl tracking-tight text-foreground md:text-6xl">
                {t("detail.title", { name: competitor.name })}
              </h1>
              <p className="mt-5 text-lg text-muted-foreground md:text-xl">
                {t("detail.subtitlePrefix", { name: competitor.name })}
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-gold-100 px-2.5 py-1 font-medium uppercase tracking-wider text-gold-700">
                  {t(`categories.${competitor.category}`)}
                </span>
                <span className="rounded-full border border-border/60 px-2.5 py-1 text-muted-foreground">
                  {t("detail.originLabel")} : {competitor.origin}
                </span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Summary */}
        <section className="px-4 md:px-6">
          <div className="container mx-auto max-w-3xl">
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-6 md:p-8">
              <h2 className="font-serif text-xl text-foreground md:text-2xl">
                {t("detail.summaryHeading")}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {content.summary}
              </p>
            </div>
          </div>
        </section>

        {/* Comparison matrix */}
        <section className="px-4 py-16 md:px-6 md:py-20">
          <div className="container mx-auto max-w-3xl">
            <h2 className="font-serif text-2xl tracking-tight text-foreground md:text-3xl">
              {t("detail.tableHeading", { name: competitor.name })}
            </h2>
            <div className="mt-6">
              <ComparisonMatrix competitors={[competitor]} />
            </div>
            <div className="mt-4">
              <ComparisonLegend />
            </div>
          </div>
        </section>

        {/* Why Saoma */}
        <section className="px-4 md:px-6">
          <div className="container mx-auto max-w-3xl">
            <h2 className="font-serif text-2xl tracking-tight text-foreground md:text-3xl">
              {t("detail.advantagesHeading", { name: competitor.name })}
            </h2>
            <ul className="mt-6 space-y-4">
              {content.saomaAdvantages.map((adv, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="flex items-start gap-3"
                >
                  <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gold-100 text-gold-700">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="text-base leading-relaxed text-foreground/90">{adv}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        {/* When the competitor is a good choice (fairness / E-E-A-T) */}
        <section className="px-4 py-16 md:px-6 md:py-20">
          <div className="container mx-auto max-w-3xl">
            <div className="rounded-2xl border border-border/60 p-6 md:p-8">
              <h2 className="flex items-center gap-2 font-serif text-xl text-foreground md:text-2xl">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                {t("detail.strengthsHeading", { name: competitor.name })}
              </h2>
              <ul className="mt-5 space-y-3">
                {content.competitorStrengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 text-base leading-relaxed text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-muted-foreground/40" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-4 md:px-6">
          <div className="container mx-auto max-w-3xl">
            <h2 className="font-serif text-2xl tracking-tight text-foreground md:text-3xl">
              {t("detail.faqHeading")}
            </h2>
            <Accordion type="single" collapsible className="mt-6 w-full">
              {content.faq.map(({ q, a }, i) => (
                <AccordionItem key={i} value={`q${i}`} className="border-border/60">
                  <AccordionTrigger className="text-left font-serif text-lg text-foreground hover:no-underline">
                    {q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                    {a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
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
      <JsonLd data={faqSchema} />
    </div>
  );
};

export default CompareDetail;
