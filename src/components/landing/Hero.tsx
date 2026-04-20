import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEMO_CTA = "mailto:hello@lymfea.fr?subject=Demo%20Ei%CC%88a";

export const Hero = () => {
  const { t } = useTranslation("landing");

  return (
    <section id="top" className="relative overflow-hidden pt-28 md:pt-32">
      {/* Ambient background blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[780px] -translate-x-1/2 rounded-full bg-gold-200/60 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 right-0 h-[360px] w-[360px] rounded-full bg-primary/10 blur-[100px]"
      />

      <div className="container relative mx-auto px-4 pb-20 md:px-6 md:pb-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-start"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium tracking-wide text-gold-700">
              <Sparkles className="h-3.5 w-3.5" />
              {t("hero.eyebrow")}
            </span>

            <h1 className="mt-6 font-serif text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-[4.2rem]">
              {t("hero.title")}{" "}
              <span className="italic text-primary">{t("hero.titleHighlight")}</span>
              <span className="text-primary">.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {t("hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="group h-12 bg-foreground px-6 text-base text-background hover:bg-foreground/90"
              >
                <a href={DEMO_CTA}>
                  {t("hero.ctaPrimary")}
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 border-foreground/20 bg-transparent px-6 text-base hover:bg-foreground/5"
              >
                <a href="#features">{t("hero.ctaSecondary")}</a>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
              {["confirmation", "pms", "modules"].map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span>{t(`hero.stats.${key}`)}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: product mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <DashboardMockup />
            <motion.div
              initial={{ opacity: 0, y: 30, rotate: -4 }}
              animate={{ opacity: 1, y: 0, rotate: -6 }}
              transition={{ duration: 0.9, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute -bottom-10 -left-6 hidden w-[220px] md:block lg:-left-10"
            >
              <PhoneMockup />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

const DashboardMockup = () => (
  <div className="relative rounded-[20px] border border-border/60 bg-card p-2 shadow-[0_30px_80px_-20px_rgba(90,60,30,0.25)] ring-1 ring-foreground/5">
    {/* Window chrome */}
    <div className="flex items-center gap-1.5 px-3 py-2">
      <span className="h-2.5 w-2.5 rounded-full bg-gold-200" />
      <span className="h-2.5 w-2.5 rounded-full bg-gold-300" />
      <span className="h-2.5 w-2.5 rounded-full bg-gold-400" />
      <div className="ml-auto hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:block">
        app.lymfea.fr
      </div>
    </div>

    {/* App body */}
    <div className="rounded-2xl bg-background p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="font-serif text-lg text-foreground">Bookings</div>
          <div className="text-xs text-muted-foreground">Jeudi 18 avril · 24 soins</div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          Semaine
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1 text-[10px] text-muted-foreground">
        {["Lun", "Mar", "Mer", "Jeu", "Ven"].map((d, i) => (
          <div key={d} className={`rounded-md px-1.5 py-1 text-center ${i === 3 ? "bg-gold-100 font-medium text-gold-800" : ""}`}>
            {d}
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <TimelineRow time="09:00" name="Sarah M." treatment="Massage suédois · 60 min" status="confirmed" />
        <TimelineRow time="10:30" name="Julie D." treatment="Soin signature · 90 min" status="inprogress" />
        <TimelineRow time="12:00" name="Thomas B." treatment="Massage couple · 60 min" status="pending" />
        <TimelineRow time="14:30" name="Anna K." treatment="Soin visage · 45 min" status="confirmed" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <StatCard label="Revenus" value="2 840 €" />
        <StatCard label="Taux occupation" value="87%" />
        <StatCard label="Soins à venir" value="14" />
      </div>
    </div>
  </div>
);

const TimelineRow = ({
  time,
  name,
  treatment,
  status,
}: {
  time: string;
  name: string;
  treatment: string;
  status: "confirmed" | "pending" | "inprogress";
}) => {
  const statusStyles = {
    confirmed: "bg-primary/10 text-primary",
    pending: "bg-gold-100 text-gold-800",
    inprogress: "bg-success/15 text-success",
  }[status];
  const statusLabel = {
    confirmed: "Confirmé",
    pending: "En attente",
    inprogress: "En cours",
  }[status];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2">
      <div className="w-10 text-[10px] font-medium text-muted-foreground">{time}</div>
      <div className="flex-1">
        <div className="text-xs font-medium text-foreground">{name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{treatment}</div>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles}`}>
        {statusLabel}
      </span>
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-0.5 font-serif text-base text-foreground">{value}</div>
  </div>
);

const PhoneMockup = () => (
  <div className="rounded-[32px] border border-border/60 bg-foreground p-2 shadow-[0_30px_60px_-15px_rgba(40,25,10,0.4)]">
    <div className="rounded-[24px] bg-card p-3">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
        <span>09:41</span>
        <span>●●● ▲</span>
      </div>
      <div className="mt-3 rounded-2xl bg-primary/10 p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-primary">
          Nouveau booking
        </div>
        <div className="mt-1 font-serif text-sm leading-tight text-foreground">
          Massage deep tissue · 11h00
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          Le Grand Hôtel · Salle Zen
        </div>
        <div className="mt-3 flex gap-2">
          <div className="flex-1 rounded-lg bg-primary py-1.5 text-center text-[10px] font-medium text-primary-foreground">
            Accepter
          </div>
          <div className="flex-1 rounded-lg bg-muted py-1.5 text-center text-[10px] font-medium text-muted-foreground">
            Refuser
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <MiniRow label="Cette semaine" value="18 soins" />
        <MiniRow label="Gains" value="1 240 €" />
      </div>
    </div>
  </div>
);

const MiniRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5">
    <span className="text-[10px] text-muted-foreground">{label}</span>
    <span className="text-[10px] font-medium text-foreground">{value}</span>
  </div>
);
