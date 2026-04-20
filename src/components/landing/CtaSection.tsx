import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEMO_CTA = "mailto:hello@lymfea.fr?subject=Demo%20Ei%CC%88a";

export const CtaSection = () => {
  const { t } = useTranslation("landing");

  return (
    <section className="py-24 md:py-32">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl border border-gold-300 bg-gradient-to-br from-gold-50 via-background to-gold-100 px-6 py-16 text-center md:px-12 md:py-24"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-[360px] w-[560px] -translate-x-1/2 rounded-full bg-primary/10 blur-[100px]"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl font-serif text-3xl tracking-tight text-foreground md:text-5xl">
              {t("cta.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground md:text-xl">
              {t("cta.subtitle")}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Button
                asChild
                size="lg"
                className="group h-12 bg-foreground px-7 text-base text-background hover:bg-foreground/90"
              >
                <a href={DEMO_CTA}>
                  {t("cta.button")}
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">{t("cta.secondary")}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
