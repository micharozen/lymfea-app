import { useCallback, useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Loader2, Upload, X, Sparkles, RefreshCw, ImageIcon, Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
  uploadingHotel: boolean;
  uploadingCover: boolean;
  hotelImageRef: RefObject<HTMLInputElement>;
  coverImageRef: RefObject<HTMLInputElement>;
  handleHotelImageUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  handleCoverImageUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  triggerHotelImageSelect: () => void;
  triggerCoverImageSelect: () => void;
  hotelName: string;
  onRequestEdit: () => void;
  /** Hotel id — used to render the live client preview iframe. */
  hotelId?: string | null;
  /** Canonical slug for the client URL. Falls back to hotelId. */
  hotelSlug?: string | null;
  /** External counter — incrementing forces an iframe reload (e.g. after Save). */
  previewRefreshKey?: number;
}

const FONT_EXTS = [".woff2", ".woff", ".ttf", ".otf"];
const MAX_FONT_SIZE_MB = 2;

type FontKind = "title" | "body";

interface FontFieldNames {
  url: "font_title_url" | "font_body_url";
  family: "font_title_family" | "font_body_family";
}

const FONT_FIELDS: Record<FontKind, FontFieldNames> = {
  title: { url: "font_title_url", family: "font_title_family" },
  body: { url: "font_body_url", family: "font_body_family" },
};

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
  uploadingHotel,
  uploadingCover,
  hotelImageRef,
  coverImageRef,
  handleHotelImageUpload,
  handleCoverImageUpload,
  triggerHotelImageSelect,
  triggerCoverImageSelect,
  hotelName: _hotelName,
  onRequestEdit,
  hotelId,
  hotelSlug,
  previewRefreshKey = 0,
}: VenueBrandingTabProps) {
  const { t } = useTranslation("admin");
  const [iframeKey, setIframeKey] = useState(0);
  const combinedIframeKey = iframeKey + previewRefreshKey;
  const identifier = hotelSlug || hotelId;
  const previewUrl = identifier
    ? `${window.location.origin}/client/${identifier}`
    : null;

  const [
    welcomeBg,
    buttonColor,
    buttonTextColor,
    fontTitleUrl,
    fontTitleFamily,
    fontBodyUrl,
    fontBodyFamily,
  ] = useWatch({
    control: form.control,
    name: [
      "welcome_background_color",
      "button_color",
      "button_text_color",
      "font_title_url",
      "font_title_family",
      "font_body_url",
      "font_body_family",
    ],
  });

  const previewCss = useMemo(
    () =>
      buildVenueThemeCss({
        id: "preview",
        welcome_background_color: welcomeBg || null,
        button_color: buttonColor || null,
        button_text_color: buttonTextColor || null,
        font_title_url: fontTitleUrl || null,
        font_title_family: fontTitleFamily || null,
        font_body_url: fontBodyUrl || null,
        font_body_family: fontBodyFamily || null,
      }),
    [
      welcomeBg,
      buttonColor,
      buttonTextColor,
      fontTitleUrl,
      fontTitleFamily,
      fontBodyUrl,
      fontBodyFamily,
    ],
  );

  const handleReset = useCallback(() => {
    form.setValue("welcome_background_color", "", { shouldDirty: true });
    form.setValue("welcome_background_opacity", 55, { shouldDirty: true });
    form.setValue("button_color", "", { shouldDirty: true });
    form.setValue("button_text_color", "", { shouldDirty: true });
    form.setValue("font_title_url", "", { shouldDirty: true });
    form.setValue("font_title_family", "", { shouldDirty: true });
    form.setValue("font_body_url", "", { shouldDirty: true });
    form.setValue("font_body_family", "", { shouldDirty: true });
  }, [form]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {previewCss && <style dangerouslySetInnerHTML={{ __html: previewCss }} />}

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

        {disabled && (
          <button
            type="button"
            onClick={onRequestEdit}
            className="text-sm text-primary underline"
          >
            {t("venue.branding.enableEdit", "Activer la modification")}
          </button>
        )}

        <div className="space-y-3">
          <Label>{t("venue.branding.images", "Images du lieu")}</Label>
          <div className="flex gap-3">
            {/* Venue photo */}
            <div className="space-y-1.5 text-center">
              <div
                className="group relative h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 overflow-hidden transition-colors cursor-pointer hover:border-gold-500/50"
                onClick={() => {
                  if (disabled) onRequestEdit();
                  triggerHotelImageSelect();
                }}
                role="button"
                aria-label="Modifier la photo"
              >
                {hotelImage ? (
                  <img src={hotelImage} className="h-full w-full object-cover" alt="Venue" />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="h-5 w-5 text-white" />
                </div>
                {uploadingHotel && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>
              <input
                ref={hotelImageRef}
                type="file"
                accept="image/*"
                onChange={handleHotelImageUpload}
                className="hidden"
              />
              <p className="text-[10px] text-muted-foreground font-medium">Photo</p>
            </div>

            {/* Cover image */}
            <div className="space-y-1.5 text-center">
              <div
                className="group relative h-20 w-32 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 overflow-hidden transition-colors cursor-pointer hover:border-gold-500/50"
                onClick={() => {
                  if (disabled) onRequestEdit();
                  triggerCoverImageSelect();
                }}
                role="button"
                aria-label="Modifier la couverture"
              >
                {coverImage ? (
                  <img src={coverImage} className="h-full w-full object-cover" alt="Cover" />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="h-5 w-5 text-white" />
                </div>
                {uploadingCover && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>
              <input
                ref={coverImageRef}
                type="file"
                accept="image/*"
                onChange={handleCoverImageUpload}
                className="hidden"
              />
              <p className="text-[10px] text-muted-foreground font-medium">Couverture</p>
            </div>
          </div>
        </div>

        <ColorPickerField
          form={form}
          name="welcome_background_color"
          label={t("venue.branding.welcomeBg", "Fond de la page d'accueil")}
          placeholder="#FFFFFF"
          disabled={disabled}
        />
        <OpacityField form={form} disabled={disabled} />
        <ColorPickerField
          form={form}
          name="button_color"
          label={t("venue.branding.buttonColor", "Couleur des boutons")}
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

        <FontUploadField
          form={form}
          kind="title"
          disabled={disabled}
          label={t("venue.branding.fontTitle", "Police des titres")}
        />
        <FontUploadField
          form={form}
          kind="body"
          disabled={disabled}
          label={t("venue.branding.fontBody", "Police du texte")}
        />

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

      {/* Preview column — same device frame as the "Aperçu client" sheet,
          iframes the real /client/<slug> page so saved branding is rendered live. */}
      <div className="lg:sticky lg:top-24 self-start flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          {t("venue.branding.previewLabel", "Aperçu client")}
        </div>
        {previewUrl ? (
          <>
            <div
              className="relative bg-black rounded-[40px] p-3 shadow-2xl"
              style={{ width: 390, height: 700 }}
            >
              <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-10" />
              <div className="w-full h-full rounded-[32px] overflow-hidden bg-background">
                <iframe
                  key={`${previewUrl}-${combinedIframeKey}`}
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="Aperçu client"
                  loading="lazy"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIframeKey((k) => k + 1)}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t(
                "venue.branding.refreshPreview",
                "Rafraîchir l'aperçu (après sauvegarde)",
              )}
            </Button>
          </>
        ) : (
          <div className="text-sm text-muted-foreground italic max-w-xs text-center px-4 py-8 border border-dashed rounded-lg">
            {t(
              "venue.branding.previewUnavailable",
              "Enregistre le lieu pour voir l'aperçu client en direct.",
            )}
          </div>
        )}
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

function OpacityField({
  form,
  disabled,
}: {
  form: VenueBrandingTabProps["form"];
  disabled: boolean;
}) {
  const { t } = useTranslation("admin");
  return (
    <FormField
      control={form.control}
      name="welcome_background_opacity"
      render={({ field }) => {
        const value = typeof field.value === "number" ? field.value : 55;
        return (
          <FormItem>
            <FormLabel>
              {t(
                "venue.branding.welcomeBgOpacity",
                "Opacité du fond (page d'accueil)",
              )}{" "}
              <span className="text-muted-foreground font-normal">— {value}%</span>
            </FormLabel>
            <FormControl>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[value]}
                disabled={disabled}
                onValueChange={(v) => field.onChange(v[0] ?? 0)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

interface FontUploadFieldProps {
  form: VenueBrandingTabProps["form"];
  kind: FontKind;
  disabled: boolean;
  label: string;
}

function FontUploadField({ form, kind, disabled, label }: FontUploadFieldProps) {
  const { t } = useTranslation("admin");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { url: urlField, family: familyField } = FONT_FIELDS[kind];

  const url = useWatch({ control: form.control, name: urlField }) as string;

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = "";

      const lower = file.name.toLowerCase();
      if (!FONT_EXTS.some((ext) => lower.endsWith(ext))) {
        toast.error(
          t(
            "venue.branding.fontInvalidFormat",
            "Format de police invalide (woff2, woff, ttf, otf)",
          ),
        );
        return;
      }
      if (file.size > MAX_FONT_SIZE_MB * 1024 * 1024) {
        toast.error(
          t(
            "venue.branding.fontTooLarge",
            `Le fichier ne doit pas dépasser ${MAX_FONT_SIZE_MB} Mo`,
          ),
        );
        return;
      }

      setUploading(true);
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

        form.setValue(urlField, publicUrl, { shouldDirty: true });
        if (!form.getValues(familyField)) {
          form.setValue(familyField, slugifyFontName(file.name), {
            shouldDirty: true,
          });
        }
        toast.success(t("venue.branding.fontUploaded", "Police téléchargée"));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        toast.error(message);
      } finally {
        setUploading(false);
      }
    },
    [form, t, urlField, familyField],
  );

  const handleRemove = useCallback(() => {
    form.setValue(urlField, "", { shouldDirty: true });
    form.setValue(familyField, "", { shouldDirty: true });
  }, [form, urlField, familyField]);

  return (
    <div className="border-t pt-6 space-y-3">
      <Label>{label}</Label>
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
        onChange={handleUpload}
        disabled={disabled || uploading}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {url
            ? t("venue.branding.replaceFont", "Remplacer la police")
            : t("venue.branding.uploadFont", "Téléverser une police")}
        </Button>
        {url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={disabled}
          >
            <X className="mr-2 h-4 w-4" />
            {t("venue.branding.removeFont", "Retirer")}
          </Button>
        )}
      </div>

      {url && (
        <FormField
          control={form.control}
          name={familyField}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">
                {t(
                  "venue.branding.fontFamily",
                  "Nom CSS de la police (font-family)",
                )}
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
  );
}
