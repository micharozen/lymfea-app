import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import type { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { roomsSchema, toNumOrNull } from "@/lib/venueSetup/schemas";
import { ROOM_CAPABILITY_VALUES } from "@shared/venueSetup/spec";
import { Field, ToggleChips } from "../SetupFields";
import { sectionList, str, type StepProps } from "../types";

type Values = z.infer<typeof roomsSchema>;
type Capability = (typeof ROOM_CAPABILITY_VALUES)[number];

export function RoomsStep({ state, formId, onSave }: StepProps) {
  const { t } = useTranslation("setup");
  const rooms = sectionList(state, "treatment_rooms");

  const form = useForm<Values>({
    resolver: zodResolver(roomsSchema),
    defaultValues: {
      // Start with one row ready to fill: a venue always has at least one room.
      treatment_rooms: rooms.length
        ? rooms.map((r) => ({
            name: str(r.name),
            capabilities: (r.capabilities as Capability[]) ?? [],
            capacity: typeof r.capacity === "number" ? r.capacity : 1,
          }))
        : [{ name: "", capabilities: ["Massage"], capacity: 1 }],
    },
  });
  const { register, control, handleSubmit, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "treatment_rooms" });
  const capabilityOptions = ROOM_CAPABILITY_VALUES.map((c) => ({ value: c, label: t(`rooms.capabilities.${c}`) }));

  return (
    <form id={formId} onSubmit={handleSubmit((v) => onSave(v))} className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("rooms.count", { count: fields.length })}</p>
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">{t("rooms.empty")}</p>
      )}
      {formState.errors.treatment_rooms?.root?.message && (
        <p className="text-xs text-destructive">{t(formState.errors.treatment_rooms.root.message)}</p>
      )}
      {formState.errors.treatment_rooms?.message && (
        <p className="text-xs text-destructive">{t(formState.errors.treatment_rooms.message)}</p>
      )}
      {fields.map((f, i) => {
        const e = formState.errors.treatment_rooms?.[i];
        return (
          <div key={f.id} className="rounded-lg border p-3 space-y-3">
            <div className="grid gap-3 grid-cols-[1fr_110px_auto] items-end">
              <Field label={t("rooms.name")} required error={e?.name?.message}>
                <Input placeholder={t("rooms.namePlaceholder", { n: i + 1 })} {...register(`treatment_rooms.${i}.name`)} />
              </Field>
              <Field label={t("rooms.capacity")} required error={e?.capacity?.message}>
                <Input type="number" min={1} max={10} {...register(`treatment_rooms.${i}.capacity`, { setValueAs: toNumOrNull })} />
              </Field>
              <Button type="button" variant="ghost" size="icon" aria-label={t("common.remove")} onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Field label={t("rooms.capabilitiesLabel")} required error={e?.capabilities?.message}>
              <Controller
                control={control}
                name={`treatment_rooms.${i}.capabilities`}
                render={({ field }) => (
                  <ToggleChips value={field.value ?? []} onChange={field.onChange} options={capabilityOptions} />
                )}
              />
            </Field>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ name: "", capabilities: ["Massage"], capacity: 1 })}
      >
        <Plus className="h-4 w-4 mr-2" />
        {t("rooms.add")}
      </Button>
    </form>
  );
}
