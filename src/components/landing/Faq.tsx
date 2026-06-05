import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const QUESTION_KEYS = [
  "pricing",
  "trial",
  "pms",
  "onboarding",
  "therapistApp",
  "roomCharge",
  "multiVenue",
  "data",
] as const;

export const Faq = () => {
  const { t } = useTranslation("landing");

  const questions = QUESTION_KEYS.map((key) => ({
    key,
    q: t(`faq.items.${key}.q`),
    a: t(`faq.items.${key}.a`),
  }));

  return (
    <section id="faq" className="py-20 md:py-28">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="text-xs font-medium uppercase tracking-wider text-primary">
            {t("faq.eyebrow")}
          </span>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground md:text-5xl">
            {t("faq.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("faq.subtitle")}
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            {questions.map(({ key, q, a }) => (
              <AccordionItem key={key} value={key} className="border-border/60">
                <AccordionTrigger className="text-left font-serif text-lg text-foreground hover:no-underline md:text-xl">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: questions.map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: {
                "@type": "Answer",
                text: a,
              },
            })),
          }),
        }}
      />
    </section>
  );
};
