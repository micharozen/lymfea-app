import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND_LOGO, BRAND_NAME } from "@/components/landing/constants";
import { contactHref } from "@/lib/venueSetup/contact";
import { isSoundMuted, setSoundMuted } from "@/lib/venueSetup/sound";

export function ContactButton({ label, compact }: { label?: string; compact?: boolean }) {
  const { t } = useTranslation("setup");
  return (
    <Button asChild variant="outline" size="sm">
      <a href={contactHref(label)} aria-label={t("header.contact")}>
        <Mail className="h-4 w-4" />
        <span className={compact ? "hidden sm:inline ml-2" : "ml-2"}>{t("header.contact")}</span>
      </a>
    </Button>
  );
}

const LANGUAGES = [
  { value: "fr", flag: "🇫🇷", label: "Français" },
  { value: "en", flag: "🇬🇧", label: "English" },
] as const;

function LanguageSwitch() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("fr") ? "fr" : "en";
  return (
    <div className="flex items-center rounded-lg border p-0.5" role="radiogroup" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={lang === l.value}
          aria-label={l.label}
          title={l.label}
          onClick={() => void i18n.changeLanguage(l.value)}
          className={cn(
            "h-8 w-9 rounded-md text-lg leading-none flex items-center justify-center transition-all",
            lang === l.value ? "bg-muted shadow-sm" : "opacity-50 grayscale hover:opacity-100 hover:grayscale-0",
          )}
        >
          {l.flag}
        </button>
      ))}
    </div>
  );
}

function SoundToggle() {
  const { t } = useTranslation("setup");
  const [muted, setMuted] = useState(isSoundMuted);
  const toggle = () => {
    setSoundMuted(!muted);
    setMuted(!muted);
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={toggle}
      aria-label={muted ? t("header.soundOn") : t("header.soundOff")}
      title={muted ? t("header.soundOn") : t("header.soundOff")}
    >
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </Button>
  );
}

interface SetupHeaderProps {
  label: string;
  /** 0–100; hidden when undefined (welcome, error screens). */
  progress?: number;
  /** Non-sticky anchor at the very top of the page, used to scroll back up. */
  topRef?: React.Ref<HTMLDivElement>;
}

export function SetupHeader({ label, progress, topRef }: SetupHeaderProps) {
  const { t } = useTranslation("setup");
  return (
    <>
    <div ref={topRef} aria-hidden />
    <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src={BRAND_LOGO} alt={BRAND_NAME} className="h-8 w-8 rounded-md object-cover flex-shrink-0" />
          <div className="min-w-0 leading-tight">
            <p className={label ? "text-xs text-muted-foreground" : "text-base font-medium"}>{BRAND_NAME}</p>
            {label && <p className="text-sm truncate">{t("title", { name: label })}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <ContactButton label={label} compact />
          <SoundToggle />
          <LanguageSwitch />
        </div>
      </div>
      {progress !== undefined && (
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <div className="flex items-center gap-3">
            <div
              className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-24 text-right">
              {t("header.progress", { percent: progress })}
            </span>
          </div>
        </div>
      )}
    </header>
    </>
  );
}
