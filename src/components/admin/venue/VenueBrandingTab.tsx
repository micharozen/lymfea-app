import { useCallback, useMemo, useRef, useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Plus, Loader2, Upload, X, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { VenueWizardFormValues } from "@/components/admin/VenueWizardDialog";
import { buildVenueThemeCss } from "@/pages/client/context/VenueThemeProvider";

interface VenueBrandingTabProps {
  form: UseFormReturn<VenueWizardFormValues>;
  disabled: boolean;
  hotelImage: string;
  coverImage: string;
  hotelName: string;
  onRequestEdit: () => void;
}

const FONT_EXTS = [".woff2", ".woff", ".ttf", ".otf"];
const MAX_FONT_SIZE_MB = 2;

function slugifyFontName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "venue-font"
  );
}

export function VenueBrandingTab({
  form,
  disabled,
  hotelImage,
  coverImage,
  hotelName,
  onRequestEdit,
}: VenueBrandingTabProps) {
  const { t } = useTranslation("admin");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFont, setUploadingFont] = useState(false);

  const [welcomeBg, buttonColor, buttonTextColor, customFontUrl, customFontFamily] =
    useWatch({
      control: form.control,
      name: [
        "welcome_background_color",
        "button_color",
        "button_text_color",
        "custom_font_url",
        "custom_font_family",
      ],
    });

  // Inject preview font into document head for live preview rendering
  const previewCss = useMemo(
    () =>
      buildVenueThemeCss({
        id: "preview",
        welcome_background_color: welcomeBg || null,
        button_color: buttonColor || null,
        button_text_color: buttonTextColor || null,
        custom_font_url: customFontUrl || null,
        custom_font_family: customFontFamily || null,
      }),
    [welcomeBg, buttonColor, buttonTextColor, customFontUrl, customFontFamily],
  );

  const handleFontUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = "";

      const lower = file.name.toLowerCase();
      if (!FONT_EXTS.some((ext) => lower.endsWith(ext))) {
        toast.error(t("venue.branding.fontInvalidFormat", "Format de police invalide (woff2, woff, ttf, otf)"));
        return;
      }
      if (file.size > MAX_FONT_SIZE_MB * 1024 * 1024) {
        toast.error(t("venue.branding.fontTooLarge", `Le fichier ne doit pas dépasser ${MAX_FONT_SIZE_MB} Mo`));
        return;
      }

      setUploadingFont(true);
      try {
        const ext = lower.match(/\.[^.]+$/)?.[0] ?? ".woff2";
        const filename = `${Math.random().toString(36).slice(2)}-${slugifyFontName(file.name)}${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("venue-fonts")
          .upload(filename, file, {
            cacheControl: "31536000",
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("venue-fonts").getPublicUrl(filename);

        form.setValue("custom_font_url", publicUrl, { shouldDirty: true });
        if (!form.getValues("custom_font_family")) {
          form.setValue("custom_font_family", slugifyFontName(file.name), {
            shouldDirty: true,
          });
        }
        toast.success(t("venue.branding.fontUploaded", "Police téléchargée"));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        toast.error(message);
      } finally {
        setUploadingFont(false);
      }
    },
    [form, t],
  );

  const handleRemoveFont = useCallback(() => {
    form.setValue("custom_font_url", "", { shouldDirty: true });
    form.setValue("custom_font_family", "", { shouldDirty: true });
  }, [form]);

  const handleReset = useCallback(() => {
    form.setValue("welcome_background_color", "", { shouldDirty: true });
    form.setValue("button_color", "", { shouldDirty: true });
    form.setValue("button_text_color", "", { shouldDirty: true });
    form.setValue("custom_font_url", "", { shouldDirty: true });
    form.setValue("custom_font_family", "", { shouldDirty: true });
  }, [form]);

  const previewBg = welcomeBg || "#ffffff";
  const previewButtonBg = buttonColor || "#EDE0C6";
  const previewButtonText = buttonTextColor || "#000000";
  const previewFontStack = customFontFamily
    ? `"${customFontFamily}", 'Founders Grotesk', sans-serif`
    : "'Kormelink', serif";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Inject live @font-face + variables for the preview */}
      {previewCss && (
        <style dangerouslySetInnerHTML={{ __html: previewCss }} />
      )}

      {/* Form column */}
      <Card className="p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">
            {t("venue.branding.title", "Personnalisation visuelle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "venue.branding.description",
              "Adapte les couleurs et la typographie du parcours de réservation à l'identité de ton lieu.",
            )}
          </p>
        </div>

        {!disabled ? null : (
          <button
            type="button"
            onClick={onRequestEdit}
            className="text-sm text-primary underline"
          >
            {t("venue.branding.enableEdit", "Activer la modification")}
          </button>
        )}

        <ColorPickerField
          form={form}
          name="welcome_background_color"
          label={t("venue.branding.welcomeBg", "Fond de la page d'accueil")}
          placeholder="#FFFFFF"
          disabled={disabled}
        />
        <ColorPickerField
          form={form}
          name="button_color"
          label={t("venue.branding.buttonColor", "Couleur du bouton +")}
          placeholder="#EDE0C6"
          disabled={disabled}
        />
        <ColorPickerField
          form={form}
          name="button_text_color"
          label={t("venue.branding.buttonTextColor", "Couleur du texte des boutons")}
          placeholder="#000000"
          disabled={disabled}
        />

        <div className="border-t pt-6 space-y-3">
          <Label>{t("venue.branding.font", "Police de caractères")}</Label>
          <p className="text-xs text-muted-foreground">
            {t(
              "venue.branding.fontHelp",
              "Formats acceptés : woff2, woff, ttf, otf. Taille max 2 Mo.",
            )}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
            className="hidden"
            onChange={handleFontUpload}
            disabled={disabled || uploadingFont}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploadingFont}
            >
              {uploadingFont ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {customFontUrl
                ? t("venue.branding.replaceFont", "Remplacer la police")
                : t("venue.branding.uploadFont", "Téléverser une police")}
            </Button>
            {customFontUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveFont}
                disabled={disabled}
              >
                <X className="mr-2 h-4 w-4" />
                {t("venue.branding.removeFont", "Retirer")}
              </Button>
            )}
          </div>

          {customFontUrl && (
            <FormField
              control={form.control}
              name="custom_font_family"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">
                    {t("venue.branding.fontFamily", "Nom CSS de la police (font-family)")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="hotel-display"
                      disabled={disabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="border-t pt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={disabled}
          >
            {t("venue.branding.reset", "Réinitialiser")}
          </Button>
        </div>
      </Card>

      {/* Preview column */}
      <div className="lg:sticky lg:top-24 self-start">
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          {t("venue.branding.previewLabel", "Aperçu temps réel")}
        </div>
        <div className="mx-auto w-full max-w-[360px] rounded-[2.25rem] border-8 border-zinc-900 shadow-xl overflow-hidden bg-zinc-900">
          <div
            className="h-[640px] overflow-y-auto"
            style={{ backgroundColor: previewBg, fontFamily: previewFontStack }}
          >
            {/* Hero */}
            <div className="relative h-48 w-full overflow-hidden">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: coverImage
                    ? `url(${coverImage})`
                    : "linear-gradient(135deg, #2c2c2c, #0a0a0a)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "brightness(0.55)",
                }}
              />
              <div className="relative z-10 h-full flex flex-col justify-end p-4">
                {hotelImage && (
                  <img
                    src={hotelImage}
                    alt=""
                    className="h-9 w-9 object-contain mb-2"
                  />
                )}
                <div
                  className="text-[10px] uppercase tracking-[0.3em] mb-1"
                  style={{ color: previewButtonBg }}
                >
                  Services exclusifs
                </div>
                <div className="text-white text-2xl leading-tight">
                  {hotelName || "Votre établissement"}
                </div>
              </div>
            </div>

            {/* Treatment item w/ + button */}
            <div className="p-4 space-y-3">
              <div className="text-xs uppercase tracking-widest text-zinc-500">
                Soins
              </div>
              <PreviewTreatmentRow
                title="Massage relaxant"
                subtitle="60 min · 120 €"
                buttonBg={previewButtonBg}
                buttonText={previewButtonText}
              />
              <PreviewTreatmentRow
                title="Soin du visage"
                subtitle="45 min · 95 €"
                buttonBg={previewButtonBg}
                buttonText={previewButtonText}
              />
              <PreviewTreatmentRow
                title="Gommage corps"
                subtitle="30 min · 70 €"
                buttonBg={previewButtonBg}
                buttonText={previewButtonText}
              />

              {/* CTA */}
              <button
                type="button"
                className="w-full h-12 rounded-md font-medium tracking-wide mt-4"
                style={{
                  backgroundColor: previewButtonBg,
                  color: previewButtonText,
                }}
              >
                Réserver
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ColorPickerFieldProps {
  form: VenueBrandingTabProps["form"];
  name: "welcome_background_color" | "button_color" | "button_text_color";
  label: string;
  placeholder: string;
  disabled: boolean;
}

function ColorPickerField({
  form,
  name,
  label,
  placeholder,
  disabled,
}: ColorPickerFieldProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const value = (field.value ?? "") as string;
        const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <FormControl>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={swatch}
                  disabled={disabled}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <Input
                  value={value}
                  placeholder={placeholder}
                  disabled={disabled}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="font-mono uppercase"
                />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function PreviewTreatmentRow({
  title,
  subtitle,
  buttonBg,
  buttonText,
}: {
  title: string;
  subtitle: string;
  buttonBg: string;
  buttonText: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-zinc-100">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-900 truncate">{title}</div>
        <div className="text-xs text-zinc-500">{subtitle}</div>
      </div>
      <button
        type="button"
        className="h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: buttonBg, color: buttonText }}
        aria-label="Ajouter"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
