import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowLeft, Activity, Clock, Mail } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { SupportForm } from "@/components/landing/SupportForm";
import { BRAND_EMAIL } from "@/components/landing/constants";

const CHANNELS = [
  { key: "email", icon: Mail, href: `mailto:${BRAND_EMAIL}` },
  { key: "hours", icon: Clock, href: null },
  { key: "status", icon: Activity, href: "https://status.saoma.io/" },
] as const;

const Support = () => {
  const { t, i18n } = useTranslation("support");

  useEffect(() => {
    document.title = t("meta.title");
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", t("meta.description"));
    document.documentElement.lang = i18n.language.startsWith("fr") ? "fr" : "en";
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [i18n.language, t]);

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
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {CHANNELS.map(({ key, icon: Icon, href }) => {
                const content = (
                  <>
                    <Icon className="h-5 w-5 text-primary" />
                    <div className="mt-3 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                      {t(`channels.${key}.label`)}
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {t(`channels.${key}.value`)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`channels.${key}.description`)}
                    </p>
                  </>
                );

                const className =
                  "block rounded-2xl border border-border/60 bg-card p-5 transition-colors";

                return href ? (
                  <a
                    key={key}
                    href={href}
                    className={`${className} hover:border-primary/40`}
                    {...(href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {content}
                  </a>
                ) : (
                  <div key={key} className={className}>
                    {content}
                  </div>
                );
              })}
            </div>

            <div className="mt-10 pb-24">
              <SupportForm />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Support;
