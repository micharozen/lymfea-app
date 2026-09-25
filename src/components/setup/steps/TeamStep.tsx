import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { teamSchema } from "@/lib/venueSetup/schemas";
import { VENUE_ROLES } from "@shared/venueSetup/spec";
import { Field } from "../SetupFields";
import { COUNTRY_CODES, sectionList, str, type StepProps } from "../types";

type Values = z.infer<typeof teamSchema>;

export function TeamStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const members = sectionList(state, "concierges");

  const form = useForm<Values>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      concierges: members.map((m) => ({
        first_name: str(m.first_name),
        last_name: str(m.last_name),
        email: str(m.email),
        phone: str(m.phone),
        country_code: str(m.country_code) || "+33",
        venue_role: (m.venue_role as Values["concierges"][number]["venue_role"]) ?? "",
      })),
    },
  });
  const { register, control, handleSubmit, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "concierges" });
  const roleOptions = VENUE_ROLES.map((r) => ({ value: r, label: t(`team.roles.${r}`) }));

  return (
    <form id={formId} onSubmit={handleSubmit((v) => onSave(v))} className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("team.intro")}</p>
      {fields.map((f, i) => {
        const e = formState.errors.concierges?.[i];
        return (
          <div key={f.id} className="rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("team.firstName")} required error={e?.first_name?.message}>
                <Input {...register(`concierges.${i}.first_name`)} />
              </Field>
              <Field label={t("team.lastName")} required error={e?.last_name?.message}>
                <Input {...register(`concierges.${i}.last_name`)} />
              </Field>
              <Field label={t("fields.email")} required error={e?.email?.message}>
                <Input type="email" {...register(`concierges.${i}.email`)} />
              </Field>
              <Field label={t("fields.phone")} required error={e?.phone?.message}>
                <div className="flex gap-2">
                  <Controller
                    control={control}
                    name={`concierges.${i}.country_code`}
                    render={({ field }) => (
                      <SelectField
                        className="w-[130px] flex-shrink-0"
                        searchable={false}
                        value={field.value}
                        onChange={field.onChange}
                        options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.label }))}
                      />
                    )}
                  />
                  <Input type="tel" {...register(`concierges.${i}.phone`)} />
                </div>
              </Field>
              <Field label={t("team.role")}>
                <Controller
                  control={control}
                  name={`concierges.${i}.venue_role`}
                  render={({ field }) => (
                    <SelectField
                      searchable={false}
                      value={field.value || undefined}
                      onChange={field.onChange}
                      placeholder={t("team.rolePlaceholder")}
                      options={roleOptions}
                    />
                  )}
                />
              </Field>
              <div className="flex items-end justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("common.remove")}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          append({ first_name: "", last_name: "", email: "", phone: "", country_code: "+33", venue_role: "" })
        }
      >
        <Plus className="h-4 w-4 mr-2" />
        {t("team.add")}
      </Button>
    </form>
  );
}
