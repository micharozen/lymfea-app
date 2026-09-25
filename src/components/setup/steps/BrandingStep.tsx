import { Controller, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { brandingSchema } from "@/lib/venueSetup/schemas";
import { Field, FileUploadField, SectionTitle } from "../SetupFields";
import { sectionObject, str, type StepProps } from "../types";

type Values = z.infer<typeof brandingSchema>;
type ColorName = "venue_branding.button_color" | "venue_branding.button_text_color" | "venue_branding.welcome_background_color";

function ColorField({ control, name, label, error }: { control: Control<Values>; name: ColorName; label: string; error?: string }) {
  return (
    <Field label={label} error={error}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <div className="flex gap-2">
            <input
              type="color"
              aria-label={label}
              className="h-9 w-12 rounded border cursor-pointer bg-transparent"
              value={field.value || "#ffffff"}
              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
            />
            <Input placeholder="#8C6B3F" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value)} />
          </div>
        )}
      />
    </Field>
  );
}

export function BrandingStep({ token, state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const h = sectionObject(state, "hotel");
  const b = sectionObject(state, "venue_branding");

  const form = useForm<Values>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      hotel: {
        image_path: (h.image_path as string | null) ?? null,
        cover_image_path: (h.cover_image_path as string | null) ?? null,
      },
      venue_branding: {
        button_color: str(b.button_color),
        button_text_color: str(b.button_text_color),
        welcome_background_color: str(b.welcome_background_color),
        font_title_family: str(b.font_title_family),
        font_title_path: (b.font_title_path as string | null) ?? null,
        font_body_family: str(b.font_body_family),
        font_body_path: (b.font_body_path as string | null) ?? null,
      },
      notes: typeof state.data.notes === "string" ? state.data.notes : "",
    },
  });
  const { register, control, handleSubmit, watch, setValue, formState } = form;
  const e = formState.errors.venue_branding;

  const upload = (
    name: "hotel.image_path" | "hotel.cover_image_path" | "venue_branding.font_title_path" | "venue_branding.font_body_path",
    kind: "venue_logo" | "cover" | "font",
    label: string,
    hint?: string,
  ) => (
    <FileUploadField
      token={token}
      kind={kind}
      label={label}
      hint={hint}
      path={watch(name)}
      previewUrl={state.files[watch(name) ?? ""]}
      onChange={(p) => setValue(name, p, { shouldDirty: true })}
    />
  );

  return (
    <form id={formId} onSubmit={handleSubmit((v) => onSave(v))} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {upload("hotel.image_path", "venue_logo", t("branding.logo"), t("upload.logoHint"))}
        {upload("hotel.cover_image_path", "cover", t("branding.cover"), t("upload.coverHint"))}
      </div>

      <SectionTitle title={t("branding.colorsTitle")} description={t("branding.colorsDesc")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <ColorField control={control} name="venue_branding.button_color" label={t("branding.buttonColor")} error={e?.button_color?.message} />
        <ColorField control={control} name="venue_branding.button_text_color" label={t("branding.buttonTextColor")} error={e?.button_text_color?.message} />
        <ColorField control={control} name="venue_branding.welcome_background_color" label={t("branding.backgroundColor")} error={e?.welcome_background_color?.message} />
      </div>

      <SectionTitle title={t("branding.fontsTitle")} description={t("branding.fontsDesc")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <Field label={t("branding.titleFont")}>
            <Input placeholder="Playfair Display" {...register("venue_branding.font_title_family")} />
          </Field>
          {upload("venue_branding.font_title_path", "font", t("branding.fontFile"))}
        </div>
        <div className="space-y-3">
          <Field label={t("branding.bodyFont")}>
            <Input placeholder="Inter" {...register("venue_branding.font_body_family")} />
          </Field>
          {upload("venue_branding.font_body_path", "font", t("branding.fontFile"))}
        </div>
      </div>

      <SectionTitle title={t("branding.notesTitle")} />
      <Field label={t("branding.notes")} hint={t("branding.notesHint")}>
        <Textarea rows={4} {...register("notes")} />
      </Field>
    </form>
  );
}
