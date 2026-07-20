import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { useCompareSeo } from "@/components/landing/compare/useCompareSeo";
import { changelogEntries, localize, type ChangelogItemType } from "@/lib/changelog";

const TYPE_STYLES: Record<ChangelogItemType, string> = {
  new: "bg-primary/10 text-primary",
  improved: "bg-foreground/10 text-foreground/80",
  fixed: "bg-muted text-muted-foreground",
};

const Changelog = () => {
  const { t, i18n } = useTranslation("changelog");
  const language = i18n.language;

  useCompareSeo({
    title: t("meta.title"),
    description: t("meta.description"),
    path: "/changelog",
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const dateFormatter = new Intl.DateTimeFormat(language.startsWith("fr") ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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

            {changelogEntries.length === 0 ? (
              <p className="mt-16 pb-24 text-muted-foreground">{t("empty")}</p>
            ) : (
              <div className="mt-16 space-y-16 pb-24">
                {changelogEntries.map((entry) => (
                  <article key={entry.slug} id={entry.slug} className="scroll-mt-28">
                    <time
                      dateTime={entry.date}
                      className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground"
                    >
                      {dateFormatter.format(new Date(`${entry.date}T00:00:00`))}
                    </time>
                    <h2 className="mt-3 font-serif text-2xl text-foreground md:text-3xl">
                      {localize(entry.title, language)}
                    </h2>
                    <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                      {localize(entry.summary, language)}
                    </p>

                    <div className="mt-8 space-y-8 border-l border-border pl-6">
                      {entry.items.map((item, index) => (
                        <div key={index}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLES[item.type]}`}
                            >
                              {t(`type.${item.type}`)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {t(`audience.${item.audience}`)}
                            </span>
                          </div>
                          <h3 className="mt-3 text-base font-medium text-foreground">
                            {localize(item.title, language)}
                          </h3>
                          <p className="mt-2 text-base leading-relaxed text-foreground/85">
                            {localize(item.body, language)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Changelog;
