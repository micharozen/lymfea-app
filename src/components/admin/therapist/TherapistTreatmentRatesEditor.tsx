import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { useVenuesTreatmentMenus } from "@/hooks/useVenueTreatmentMenus";
import { RATE_BRACKETS } from "@/components/admin/therapist/rateBrackets";
import type { TreatmentRateMap } from "@/lib/therapistEarnings";

interface TherapistTreatmentRatesEditorProps {
  /** Barèmes par soin : { "<treatment_menu_id>": { "60": 45 } }. Composant contrôlé. */
  value: TreatmentRateMap;
  onChange: (next: TreatmentRateMap) => void;
  /** Prestations cochées dans la carte au-dessus — la seule source du sélecteur. */
  selectedTreatmentIds: string[];
  /** Lieux du thérapeute, pour résoudre les libellés des prestations. */
  venueIds: string[];
  /** Noms des lieux, affichés en sous-titre seulement en multi-lieux. */
  venueNames: Record<string, string>;
  /** Barème par défaut du thérapeute, servant de point de départ à chaque soin. */
  defaultScale: Record<string, number>;
  disabled?: boolean;
}

/**
 * Barèmes de rémunération propres à certains soins d'un thérapeute.
 *
 * Un barème de soin est auto-suffisant : quand il existe, seuls ses paliers
 * servent à payer ce soin, sans jamais retomber sur le barème par défaut. Pour
 * que ce contrat ne piège personne, un soin ajouté démarre pré-rempli avec le
 * barème par défaut du thérapeute : on édite une grille cohérente au lieu de
 * partir du vide.
 */
export function TherapistTreatmentRatesEditor({
  value,
  onChange,
  selectedTreatmentIds,
  venueIds,
  venueNames,
  defaultScale,
  disabled,
}: TherapistTreatmentRatesEditorProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const { data: menus } = useVenuesTreatmentMenus(venueIds);

  // Paliers ajoutés à la main sur un soin pendant la session : une ligne est
  // affichée si elle porte une valeur, ou si elle vient d'être ajoutée ici.
  const [addedRows, setAddedRows] = useState<Record<string, string[]>>({});

  const isEn = i18n.language?.startsWith("en");

  const menuById = useMemo(() => {
    const map = new Map<string, { label: string; venueId: string | null }>();
    for (const menu of menus ?? []) {
      map.set(menu.id, {
        label: (isEn && menu.name_en) || menu.name,
        venueId: menu.hotel_id,
      });
    }
    return map;
  }, [menus, isEn]);

  // Le lieu n'est affiché qu'en multi-lieux : ailleurs il n'apporte rien.
  const showVenue = venueIds.length > 1;

  const configuredIds = Object.keys(value);

  // Un soin décoché plus haut n'est plus proposé, mais son barème reste affiché
  // tant qu'il est configuré — le supprimer en douce ferait disparaître des
  // montants sans que personne ne l'ait demandé.
  //
  // Une prestation cochée peut appartenir à un lieu qui n'est plus assigné au
  // thérapeute : elle n'a alors aucun libellé ici, et la carte « Prestations
  // réalisables » ne la montre pas non plus. On l'écarte plutôt que d'afficher
  // son UUID, qui ne veut rien dire pour un admin.
  const availableToAdd = selectedTreatmentIds
    .filter((id) => !configuredIds.includes(id))
    .flatMap((id) => {
      const label = menuById.get(id)?.label;
      return label ? [{ value: id, label }] : [];
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const addTreatment = (treatmentId: string) => {
    if (value[treatmentId]) return;
    onChange({ ...value, [treatmentId]: { ...defaultScale } });
  };

  const removeTreatment = (treatmentId: string) => {
    const next = { ...value };
    delete next[treatmentId];
    onChange(next);
    setAddedRows((prev) => {
      const copy = { ...prev };
      delete copy[treatmentId];
      return copy;
    });
  };

  const setRate = (treatmentId: string, minutes: string, raw: string) => {
    const scale = { ...(value[treatmentId] ?? {}) };
    if (raw === "") delete scale[minutes];
    else scale[minutes] = Number(raw);
    onChange({ ...value, [treatmentId]: scale });
  };

  const addRow = (treatmentId: string, minutes: string) => {
    setAddedRows((prev) => ({
      ...prev,
      [treatmentId]: [...(prev[treatmentId] ?? []), minutes],
    }));
  };

  const removeRow = (treatmentId: string, minutes: string) => {
    const scale = { ...(value[treatmentId] ?? {}) };
    delete scale[minutes];
    onChange({ ...value, [treatmentId]: scale });
    setAddedRows((prev) => ({
      ...prev,
      [treatmentId]: (prev[treatmentId] ?? []).filter((m) => m !== minutes),
    }));
  };

  if (selectedTreatmentIds.length === 0 && configuredIds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        {t("admin:therapists.treatmentRates.noTreatments", {
          defaultValue: "Cochez d'abord des prestations ci-dessus.",
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {configuredIds.map((treatmentId) => {
        const scale = value[treatmentId] ?? {};
        const added = addedRows[treatmentId] ?? [];
        const shown = RATE_BRACKETS.filter(
          (b) => scale[String(b.minutes)] != null || added.includes(String(b.minutes)),
        );
        const toAdd = RATE_BRACKETS.filter((b) => !shown.includes(b));
        const menu = menuById.get(treatmentId);

        return (
          <div key={treatmentId} className="rounded-lg border p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {menu?.label ??
                    t("admin:therapists.treatmentRates.unknownTreatment", {
                      defaultValue: "Prestation retirée",
                    })}
                </div>
                {showVenue && menu?.venueId && venueNames[menu.venueId] ? (
                  <div className="text-xs text-muted-foreground truncate">
                    {venueNames[menu.venueId]}
                  </div>
                ) : null}
              </div>
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t("admin:therapists.treatmentRates.removeTreatment", {
                    defaultValue: "Retirer ce soin",
                  })}
                  onClick={() => removeTreatment(treatmentId)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {shown.map((bracket) => {
                const minutes = String(bracket.minutes);
                return (
                  <div key={minutes} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-sm text-muted-foreground">
                      {t(bracket.labelKey, bracket.fallback)}
                    </span>
                    <div className="relative w-32">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="--"
                        value={scale[minutes] ?? ""}
                        disabled={disabled}
                        onChange={(e) => setRate(treatmentId, minutes, e.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        &euro;
                      </span>
                    </div>
                    {!disabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={t("admin:therapists.removeRate", "Retirer ce taux")}
                        onClick={() => removeRow(treatmentId, minutes)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {!disabled && toAdd.length > 0 && (
              <div className="w-48">
                <SelectField
                  value={undefined}
                  onChange={(minutes) => addRow(treatmentId, minutes)}
                  searchable={false}
                  placeholder={t("admin:therapists.addRate", "Ajouter un taux")}
                  aria-label={t("admin:therapists.addRate", "Ajouter un taux")}
                  className="h-8 text-xs"
                  options={toAdd.map((b) => ({
                    value: String(b.minutes),
                    label: t(b.labelKey, b.fallback),
                  }))}
                />
              </div>
            )}
          </div>
        );
      })}

      {!disabled && availableToAdd.length > 0 && (
        <div className="w-64">
          <SelectField
            value={undefined}
            onChange={addTreatment}
            placeholder={t("admin:therapists.treatmentRates.addTreatment", {
              defaultValue: "Ajouter un soin…",
            })}
            aria-label={t("admin:therapists.treatmentRates.addTreatment", {
              defaultValue: "Ajouter un soin…",
            })}
            options={availableToAdd}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t("admin:therapists.treatmentRates.hint", {
          defaultValue:
            "Le barème d'un soin remplace intégralement le barème par défaut pour ce soin. Les autres prestations continuent d'utiliser le barème par défaut.",
        })}
      </p>
    </div>
  );
}
