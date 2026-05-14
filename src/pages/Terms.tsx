import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";

const SECTION_KEYS = [
  "objet",
  "definitions",
  "service",
  "account",
  "pricing",
  "data",
  "ip",
  "liability",
  "law",
  "contact",
] as const;

const Terms = () => {
  const { t, i18n } = useTranslation("terms");

  useEffect(() => {
    document.title = t("meta.title");
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", t("meta.description"));
    document.documentElement.lang = i18n.language.startsWith("fr") ? "fr" : "en";
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [i18n.language, t]);

  const intro = t("intro.paragraphs", { returnObjects: true }) as string[];

  return (
    <div className="min-h-screen bg-background font-grotesk text-foreground antialiased">
      <Navbar />
      <main className="pt-28 md:pt-36">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mx-auto max-w-3xl">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("header.back")}
            </Link>

            <div className="mt-8">
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
                {t("header.eyebrow")}
              </span>
              <h1 className="mt-3 font-serif text-4xl tracking-tight text-foreground md:text-5xl">
                {t("header.title")}
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">{t("header.subtitle")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("header.lastUpdated")}</p>
            </div>

            <div className="mt-12 space-y-6 text-base leading-relaxed text-foreground/90">
              {intro.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>

            <div className="mt-16 space-y-14 pb-24">
              {SECTION_KEYS.map((key) => {
                const paragraphs = t(`sections.${key}.paragraphs`, {
                  returnObjects: true,
                }) as string[];
                return (
                  <section key={key} id={key} className="scroll-mt-28">
                    <h2 className="font-serif text-2xl text-foreground md:text-3xl">
                      {t(`sections.${key}.title`)}
                    </h2>
                    <div className="mt-5 space-y-4 text-base leading-relaxed text-foreground/85">
                      {paragraphs.map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
