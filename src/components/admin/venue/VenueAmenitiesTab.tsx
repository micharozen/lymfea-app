import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVenueAmenities, type VenueAmenityUpdate } from "@/hooks/useVenueAmenities";
import {
  AMENITY_TYPES,
  getAmenityType,
  getAmenityLabel,
  getAmenityDefaultColor,
} from "@/lib/amenityTypes";

interface VenueAmenitiesTabProps {
  hotelId: string;
  venueType?: string;
}

const TIME_OPTIONS = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 22 && m > 0) break;
      const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      opts.push({ value: val, label: val });
    }
  }
  return opts;
})();

const SLOT_DURATIONS = [
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1h" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2h" },
];

export function VenueAmenitiesTab({ hotelId, venueType }: VenueAmenitiesTabProps) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const {
    amenities,
    enabledTypes,
    isLoading,
    createAsync,
    update,
    toggle,
    remove,
    isCreating,
  } = useVenueAmenities(hotelId);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);

  const availableTypes = AMENITY_TYPES.filter(
    (t) => !enabledTypes.includes(t.key)
  );

  const handleAdd = async (typeKey: string) => {
    const typeDef = getAmenityType(typeKey);
    if (!typeDef) return;
    setAddPopoverOpen(false);
    try {
      const newId = await createAsync({
        hotel_id: hotelId,
        type: typeKey,
        color: typeDef.defaultColor,
      });
      setExpandedId(newId);
    } catch {
      // error toast handled by mutation
    }
  };

  const handleUpdate = (id: string, updates: VenueAmenityUpdate) => {
    update({ id, updates });
  };

  const handleDelete = (id: string) => {
    remove(id);
    if (expandedId === id) setExpandedId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Amenities list */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Commodités ({amenities.length})
        </h3>

        {amenities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Aucune commodité configurée
          </p>
        ) : (
          <div className="space-y-2">
            {amenities.map((amenity) => {
              const typeDef = getAmenityType(amenity.type);
              const Icon = typeDef?.icon;
              const isExpanded = expandedId === amenity.id;

              return (
                <div
                  key={amenity.id}
                  className="rounded-lg border bg-card overflow-hidden"
                >
                  {/* Header row */}
                  <div className="flex items-center gap-3 p-3">
                    {/* Color dot + icon */}
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: amenity.color + "20" }}
                    >
                      {Icon && (
                        <Icon
                          className="h-4 w-4"
                          style={{ color: amenity.color }}
                        />
                      )}
                    </div>

                    {/* Name + capacity */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {amenity.name || getAmenityLabel(amenity.type, locale)}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{amenity.capacity_per_slot} pers.</span>
                        <span>·</span>
                        <span>{amenity.slot_duration} min</span>
                        {amenity.prep_time > 0 && (
                          <>
                            <span>·</span>
                            <span>+{amenity.prep_time} min prep</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Switch + expand + delete */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={amenity.is_enabled}
                        onCheckedChange={(checked) =>
                          toggle({ id: amenity.id, is_enabled: checked })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : amenity.id)
                        }
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(amenity.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded config */}
                  {isExpanded && (
                    <AmenityConfig
                      amenity={amenity}
                      venueType={venueType}
                      locale={locale}
                      onUpdate={handleUpdate}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add amenity button */}
      {availableTypes.length > 0 && (
        <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={isCreating}>
              {isCreating && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Ajouter une commodité
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start" sideOffset={5}>
            {availableTypes.map((typeDef) => {
              const Icon = typeDef.icon;
              return (
                <button
                  key={typeDef.key}
                  type="button"
                  onClick={() => handleAdd(typeDef.key)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-sm",
                    "px-3 py-2 text-sm text-popover-foreground transition-colors",
                    "hover:bg-foreground/5"
                  )}
                >
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center"
                    style={{
                      backgroundColor: typeDef.defaultColor + "20",
                    }}
                  >
                    <Icon
                      className="h-3.5 w-3.5"
                      style={{ color: typeDef.defaultColor }}
                    />
                  </div>
                  <span>
                    {locale === "fr" ? typeDef.labelFr : typeDef.labelEn}
                  </span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// Expanded config panel for a single amenity
// ──────────────────────────────────────────

interface AmenityConfigProps {
  amenity: {
    id: string;
    type: string;
    name: string | null;
    color: string;
    capacity_per_slot: number;
    slot_duration: number;
    prep_time: number;
    price_external: number;
    price_lymfea: number;
    lymfea_access_included: boolean;
    lymfea_access_duration: number | null;
    currency: string;
    opening_time: string | null;
    closing_time: string | null;
  };
  venueType?: string;
  locale: string;
  onUpdate: (id: string, updates: VenueAmenityUpdate) => void;
}

function AmenityConfig({ amenity, venueType, locale, onUpdate }: AmenityConfigProps) {
  const id = amenity.id;

  const [name, setName] = useState(amenity.name || "");
  const [color, setColor] = useState(amenity.color);
  const [capacityPerSlot, setCapacityPerSlot] = useState(String(amenity.capacity_per_slot));
  const [slotDuration, setSlotDuration] = useState(String(amenity.slot_duration));
  const [prepTime, setPrepTime] = useState(String(amenity.prep_time));
  const [openingTime, setOpeningTime] = useState(amenity.opening_time || "");
  const [closingTime, setClosingTime] = useState(amenity.closing_time || "");
  const [priceExternal, setPriceExternal] = useState(String(amenity.price_external));
  const [priceLymfea, setPriceLymfea] = useState(String(amenity.price_lymfea));
  const [lymfeaAccessIncluded, setLymfeaAccessIncluded] = useState(amenity.lymfea_access_included);
  const [lymfeaAccessDuration, setLymfeaAccessDuration] = useState(String(amenity.lymfea_access_duration || 60));

  const isDirty =
    (name.trim() || null) !== amenity.name ||
    color !== amenity.color ||
    (parseInt(capacityPerSlot) || 1) !== amenity.capacity_per_slot ||
    parseInt(slotDuration) !== amenity.slot_duration ||
    (parseInt(prepTime) || 0) !== amenity.prep_time ||
    (openingTime || null) !== amenity.opening_time ||
    (closingTime || null) !== amenity.closing_time ||
    (parseFloat(priceExternal) || 0) !== amenity.price_external ||
    (parseFloat(priceLymfea) || 0) !== amenity.price_lymfea ||
    lymfeaAccessIncluded !== amenity.lymfea_access_included ||
    parseInt(lymfeaAccessDuration) !== (amenity.lymfea_access_duration || 60);

  const handleSave = () => {
    const updates: VenueAmenityUpdate = {};
    const trimmedName = name.trim() || null;
    if (trimmedName !== amenity.name) updates.name = trimmedName;
    if (color !== amenity.color) updates.color = color;
    const cap = parseInt(capacityPerSlot) || 1;
    if (cap !== amenity.capacity_per_slot) updates.capacity_per_slot = cap;
    const dur = parseInt(slotDuration);
    if (dur !== amenity.slot_duration) updates.slot_duration = dur;
    const prep = parseInt(prepTime) || 0;
    if (prep !== amenity.prep_time) updates.prep_time = prep;
    const open = openingTime || null;
    if (open !== amenity.opening_time) updates.opening_time = open;
    const close = closingTime || null;
    if (close !== amenity.closing_time) updates.closing_time = close;
    const pExt = parseFloat(priceExternal) || 0;
    if (pExt !== amenity.price_external) updates.price_external = pExt;
    const pLym = parseFloat(priceLymfea) || 0;
    if (pLym !== amenity.price_lymfea) updates.price_lymfea = pLym;
    if (lymfeaAccessIncluded !== amenity.lymfea_access_included) updates.lymfea_access_included = lymfeaAccessIncluded;
    const lymDur = parseInt(lymfeaAccessDuration);
    if (lymDur !== (amenity.lymfea_access_duration || 60)) updates.lymfea_access_duration = lymDur;

    if (Object.keys(updates).length > 0) {
      onUpdate(id, updates);
    }
  };

  return (
    <div className="border-t px-4 py-4 space-y-4 bg-muted/30">
      {/* Row 1: Name + Color */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Nom personnalisé</Label>
          <Input
            placeholder={getAmenityLabel(amenity.type, locale)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Couleur calendrier</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-9 h-9 rounded border cursor-pointer"
            />
            <span className="text-xs text-muted-foreground">{color}</span>
          </div>
        </div>
      </div>

      {/* Row 2: Capacity + Duration + Prep time */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Capacité / créneau</Label>
          <Input
            type="number"
            min={1}
            value={capacityPerSlot}
            onChange={(e) => setCapacityPerSlot(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Durée créneau</Label>
          <Select
            value={slotDuration}
            onValueChange={setSlotDuration}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLOT_DURATIONS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Temps préparation</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              step={5}
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              className="h-9"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">min</span>
          </div>
        </div>
      </div>

      {/* Row 3: Horaires spécifiques */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Ouverture (optionnel)</Label>
          <Select
            value={openingTime || "_none"}
            onValueChange={(val) => setOpeningTime(val === "_none" ? "" : val)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Fermeture (optionnel)</Label>
          <Select
            value={closingTime || "_none"}
            onValueChange={(val) => setClosingTime(val === "_none" ? "" : val)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 4: Pricing section */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tarification
        </Label>

        {/* External */}
        <div className="flex items-center justify-between">
          <span className="text-sm">Externe</span>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              step={0.5}
              value={priceExternal}
              onChange={(e) => setPriceExternal(e.target.value)}
              className="h-8 w-24 text-right"
            />
            <span className="text-xs text-muted-foreground">{amenity.currency}</span>
          </div>
        </div>

        {/* Internal — hotel only */}
        {venueType === "hotel" && (
          <div className="flex items-center justify-between">
            <span className="text-sm">Interne (hôtel)</span>
            <Badge variant="secondary" className="text-xs">
              Gratuit
            </Badge>
          </div>
        )}

        {/* Lymfea */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Lymfea (client soin)</span>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Inclus</Label>
              <Switch
                checked={lymfeaAccessIncluded}
                onCheckedChange={setLymfeaAccessIncluded}
              />
            </div>
          </div>

          {lymfeaAccessIncluded ? (
            <div className="flex items-center gap-3 pl-2">
              <Label className="text-xs text-muted-foreground">Durée accès offert</Label>
              <Select
                value={lymfeaAccessDuration}
                onValueChange={setLymfeaAccessDuration}
              >
                <SelectTrigger className="h-8 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-center gap-1 pl-2">
              <Input
                type="number"
                min={0}
                step={0.5}
                value={priceLymfea}
                onChange={(e) => setPriceLymfea(e.target.value)}
                className="h-8 w-24 text-right"
              />
              <span className="text-xs text-muted-foreground">{amenity.currency}</span>
            </div>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <Button
          size="sm"
          disabled={!isDirty}
          onClick={handleSave}
        >
          Modifier
        </Button>
      </div>
    </div>
  );
}
