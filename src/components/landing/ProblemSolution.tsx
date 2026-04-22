import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Boxes, Clock, Link2Off } from "lucide-react";

const ICONS = {
  fragmented: Boxes,
  slow: Clock,
  noPms: Link2Off,
};

export const ProblemSolution = () => {
  const { t } = useTranslation("landing");
  const points = ["fragmented", "slow", "noPms"] as const;

  return (
    <section className="border-y border-border/60 bg-gold-50/50 py-20 md:py-28">
      <div className="container mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="font-serif text-3xl tracking-tight text-foreground md:text-5xl">
            {t("problem.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground md:text-xl">
            {t("problem.subtitle")}
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {points.map((key, i) => {
            const Icon = ICONS[key];
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="rounded-2xl border border-border/60 bg-card p-6 md:p-7"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-100 text-gold-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-serif text-xl text-foreground">
                  {t(`problem.points.${key}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`problem.points.${key}.desc`)}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
