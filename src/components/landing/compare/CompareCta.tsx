import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BRAND_DEMO_CTA } from "../constants";

export const CompareCta = () => {
  const { t } = useTranslation("compare");

  return (
    <section className="py-20 md:py-28">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl rounded-3xl border border-gold-200 bg-gradient-to-br from-gold-50 to-background px-6 py-12 text-center md:px-12 md:py-16"
        >
          <h2 className="font-serif text-3xl tracking-tight text-foreground md:text-4xl">
            {t("cta.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            {t("cta.subtitle")}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-foreground text-background hover:bg-foreground/90">
              <a href={BRAND_DEMO_CTA}>{t("cta.button")}</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="/#pricing">{t("cta.secondary")}</a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
