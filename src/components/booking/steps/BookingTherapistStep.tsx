import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Loader2, Users, DoorOpen, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/formatPrice";
import { useTranslation } from "react-i18next";
import type { CartItem } from "../CreateBookingDialog.schema";
import type { AvailableRoom } from "@/hooks/booking/useAvailableRooms";
import { partitionTherapistsForSlot } from "@/hooks/booking/useAvailableTherapistsForSlot";

interface Therapist {
  id: string;
  first_name: string;
  last_name: string;
  profile_image?: string | null;
  gender?: string | null;
  isAvailableForSlot?: boolean;
  shiftEndsBeforeSlotEnd?: string | null;
  isQualifiedForTreatments?: boolean;
}

interface Treatment {
  id: string;
  name?: string;
  [key: string]: unknown;
}

interface BookingTherapistStepProps {
  therapists: Therapist[] | undefined;
  therapistId: string;
  onTherapistChange: (id: string) => void;
  requiredGuestCount: number;
  /** admin-combo-duo: overrides picker count when N solo sessions booked as duo */
  staffingCount?: number;
  additionalTherapistIds: string[];
  onAdditionalTherapistIdsChange: (ids: string[]) => void;
  duoMode: "assign" | "broadcast";
  onDuoModeChange: (mode: "assign" | "broadcast") => void;
  isConcierge?: boolean;
  isPending: boolean;
  onBack: () => void;
  cart: CartItem[];
  cartDetails: Array<CartItem & { treatment: Treatment | undefined }>;
  finalPriceWithSurcharge: number;
  currency: string;
  rooms: AvailableRoom[];
  occupiedRoomIds: Set<string>;
  roomOccupancy: Map<string, number>;
  roomId: string;
  onRoomChange: (id: string) => void;
  secondaryRoomId: string;
  onSecondaryRoomChange: (id: string) => void;
  secondaryRoomEnabled: boolean;
  onSecondaryRoomEnabledChange: (enabled: boolean) => void;
}

const AUTO_ROOM_VALUE = "__auto__";

interface RoomSelectProps {
  rooms: AvailableRoom[];
  occupiedRoomIds: Set<string>;
  roomOccupancy: Map<string, number>;
  value: string;
  onChange: (id: string) => void;
  /** Salle à masquer des options (ex. la salle principale pour la salle secondaire). */
  excludeRoomId?: string;
}

function RoomSelect({
  rooms,
  occupiedRoomIds,
  roomOccupancy,
  value,
  onChange,
  excludeRoomId,
}: RoomSelectProps) {
  return (
    <Select
      value={value || AUTO_ROOM_VALUE}
      onValueChange={(v) => onChange(v === AUTO_ROOM_VALUE ? "" : v)}
    >
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Automatique" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO_ROOM_VALUE}>Automatique</SelectItem>
        {rooms
          .filter((room) => room.id !== excludeRoomId)
          .map((room) => {
            const occupied = occupiedRoomIds.has(room.id) && room.id !== value;
            const used = roomOccupancy.get(room.id) ?? 0;
            return (
              <SelectItem key={room.id} value={room.id} disabled={occupied}>
                <span className="flex items-center gap-1.5">
                  {room.name}
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      occupied ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {used}/{room.capacity}
                  </span>
                  {occupied && <span className="text-xs text-destructive">— Complète</span>}
                </span>
              </SelectItem>
            );
          })}
      </SelectContent>
    </Select>
  );
}

function getInitials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function genderLabel(gender: string | null | undefined) {
  if (gender === "female") return "F";
  if (gender === "male") return "H";
  return null;
}

interface BroadcastCardProps {
  broadcast: boolean;
  onToggle: () => void;
  violet?: boolean;
}

function BroadcastCard({ broadcast, onToggle, violet = false }: BroadcastCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        broadcast
          ? violet
            ? "border-violet-500 bg-violet-50 dark:bg-violet-950/20"
            : "border-primary bg-primary/5"
          : violet
          ? "border-violet-200 hover:bg-violet-50/50 dark:hover:bg-violet-950/10"
          : "hover:bg-muted border-border",
      )}
    >
      <div
        className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
          violet ? "bg-violet-100 dark:bg-violet-900/30" : "bg-muted",
        )}
      >
        <Users
          className={cn("h-5 w-5", violet ? "text-violet-600" : "text-muted-foreground")}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "font-medium text-sm truncate",
            violet && "text-violet-900 dark:text-violet-200",
          )}
        >
          Diffuser à tous les praticiens
        </p>
        <p
          className={cn(
            "text-xs truncate",
            violet
              ? "text-violet-700 dark:text-violet-400"
              : "text-muted-foreground",
          )}
        >
          Laisse l'équipe s'organiser et accepter
        </p>
      </div>
      {broadcast && (
        <Check className={cn("h-4 w-4 shrink-0", violet ? "text-violet-600" : "text-primary")} />
      )}
    </button>
  );
}

interface TherapistSearchProps {
  value: string;
  onChange: (value: string) => void;
}

function TherapistSearch({ value, onChange }: TherapistSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher un thérapeute…"
        className="h-9 pl-9"
      />
    </div>
  );
}

interface TherapistCardProps {
  therapist: Therapist;
  selected: boolean;
  onClick: () => void;
}

function TherapistCard({ therapist: th, selected, onClick }: TherapistCardProps) {
  const { t } = useTranslation("admin");
  const g = genderLabel(th.gender);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted border-border",
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          {th.profile_image && (
            <AvatarImage src={th.profile_image} alt={`${th.first_name} ${th.last_name}`} />
          )}
          <AvatarFallback>{getInitials(th.first_name, th.last_name)}</AvatarFallback>
        </Avatar>
        {th.isAvailableForSlot && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm flex items-center gap-1.5">
          <span className="truncate">{th.first_name} {th.last_name}</span>
          {g && (
            <span className="shrink-0 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              {g}
            </span>
          )}
        </p>
        {th.isQualifiedForTreatments === false && (
          <p className="text-[10px] font-medium text-amber-600 dark:text-amber-500 truncate">
            {t("booking.therapistSections.unqualifiedHint")}
          </p>
        )}
        {th.shiftEndsBeforeSlotEnd && (
          <p className="text-[10px] font-medium text-amber-600 dark:text-amber-500 truncate">
            {t("booking.therapistSections.shiftEnds", { time: th.shiftEndsBeforeSlotEnd })}
          </p>
        )}
      </div>
      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
    </button>
  );
}

interface SectionedTherapistCardsProps {
  therapists: Therapist[] | undefined;
  selectedId: string;
  broadcast: boolean;
  exclude?: string[];
  onPick: (id: string) => void;
}

/** Cartes thérapeutes groupées « Disponibles » / « Autres thérapeutes du lieu ».
 * Sans flag de disponibilité (liste plate legacy), rend une liste unique sans en-têtes. */
function SectionedTherapistCards({
  therapists,
  selectedId,
  broadcast,
  exclude = [],
  onPick,
}: SectionedTherapistCardsProps) {
  const { t } = useTranslation("admin");
  const visible = (therapists || []).filter(
    (th) => !exclude.includes(th.id) || th.id === selectedId,
  );

  if (visible.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Aucun thérapeute disponible
      </div>
    );
  }

  const hasFlags = visible.some((th) => th.isAvailableForSlot !== undefined);
  const { available, others, unqualified } = partitionTherapistsForSlot(visible);

  const renderCards = (list: Therapist[]) =>
    list.map((th) => (
      <TherapistCard
        key={th.id}
        therapist={th}
        selected={selectedId === th.id && !broadcast}
        onClick={() => onPick(th.id)}
      />
    ));

  if (!hasFlags) return <>{renderCards(visible)}</>;

  return (
    <>
      {available.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-500 px-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("booking.therapistSections.available")}
          </p>
          {renderCards(available)}
        </>
      )}
      {others.length > 0 && (
        <>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-1">
            {t("booking.therapistSections.others")}
          </p>
          {renderCards(others)}
        </>
      )}
      {unqualified.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-500 px-1">
            <AlertTriangle className="h-3 w-3" />
            {t("booking.therapistSections.unqualified")}
          </p>
          {renderCards(unqualified)}
        </>
      )}
    </>
  );
}

interface TherapistListProps {
  therapists: Therapist[] | undefined;
  selectedId: string;
  slotIndex: number;
  broadcast: boolean;
  exclude?: string[];
  onPick: (id: string, slotIndex: number) => void;
}

function TherapistList({
  therapists,
  selectedId,
  slotIndex,
  broadcast,
  exclude = [],
  onPick,
}: TherapistListProps) {
  return (
    <ScrollArea className="h-[200px] pr-2">
      <div className="space-y-2">
        <SectionedTherapistCards
          therapists={therapists}
          selectedId={selectedId}
          broadcast={broadcast}
          exclude={exclude}
          onPick={(id) => onPick(id, slotIndex)}
        />
      </div>
    </ScrollArea>
  );
}

export function BookingTherapistStep({
  therapists,
  therapistId,
  onTherapistChange,
  requiredGuestCount,
  staffingCount: staffingCountProp,
  additionalTherapistIds,
  onAdditionalTherapistIdsChange,
  duoMode,
  onDuoModeChange,
  isConcierge = false,
  isPending,
  onBack,
  cart,
  cartDetails,
  finalPriceWithSurcharge,
  currency,
  rooms,
  occupiedRoomIds,
  roomOccupancy,
  roomId,
  onRoomChange,
  secondaryRoomId,
  onSecondaryRoomChange,
  secondaryRoomEnabled,
  onSecondaryRoomEnabledChange,
}: BookingTherapistStepProps) {
  const { t } = useTranslation("admin");
  const [search, setSearch] = useState("");
  const broadcast = duoMode === "broadcast";
  const effectiveStaffing = staffingCountProp ?? requiredGuestCount;
  const isDuo = effectiveStaffing > 1;

  // Filtre par nom ou spécialité ; garde les praticiens déjà sélectionnés visibles.
  const selectedIds = useMemo(
    () => new Set([therapistId, ...additionalTherapistIds].filter(Boolean)),
    [therapistId, additionalTherapistIds],
  );
  const filteredTherapists = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return therapists;
    return (therapists ?? []).filter((th) => {
      if (selectedIds.has(th.id)) return true;
      const name = `${th.first_name} ${th.last_name}`.toLowerCase();
      return name.includes(query);
    });
  }, [therapists, search, selectedIds]);

  // Il faut soit diffuser à tous, soit avoir affecté tous les praticiens requis.
  const assignedCount = [therapistId, ...additionalTherapistIds].filter(Boolean).length;
  const selectionComplete = broadcast || assignedCount >= effectiveStaffing;

  const handleToggleBroadcast = () => {
    if (broadcast) {
      onDuoModeChange("assign");
    } else {
      onDuoModeChange("broadcast");
      onTherapistChange("");
      onAdditionalTherapistIdsChange([]);
    }
  };

  const handlePickTherapist = (id: string, slotIndex: number) => {
    const currentId = slotIndex === 0 ? therapistId : (additionalTherapistIds[slotIndex - 1] ?? "");
    const isAlreadySelected = currentId === id && !broadcast;

    if (isAlreadySelected) {
      if (slotIndex === 0) {
        onTherapistChange("");
      } else {
        const next = [...additionalTherapistIds];
        next[slotIndex - 1] = "";
        onAdditionalTherapistIdsChange(next);
      }
    } else {
      onDuoModeChange("assign");
      if (slotIndex === 0) {
        onTherapistChange(id);
      } else {
        const next = [...additionalTherapistIds];
        next[slotIndex - 1] = id;
        onAdditionalTherapistIdsChange(next);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex flex-col min-h-0 px-6 pt-4 pb-2">
        {/* Salle de soin — pré-sélection auto, modifiable selon la dispo. */}
        <div className="shrink-0 space-y-1.5 mb-4">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <DoorOpen className="h-3.5 w-3.5" />
            Salle de soin
            {isDuo && secondaryRoomEnabled && (
              <span className="text-muted-foreground font-normal">(praticien 1)</span>
            )}
          </Label>
          <RoomSelect
            rooms={rooms}
            occupiedRoomIds={occupiedRoomIds}
            roomOccupancy={roomOccupancy}
            value={roomId}
            onChange={onRoomChange}
          />

          {isDuo && (
            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={secondaryRoomEnabled}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true;
                    onSecondaryRoomEnabledChange(enabled);
                    if (!enabled) onSecondaryRoomChange("");
                  }}
                />
                <span className="text-xs font-medium">
                  Salle différente pour le 2e praticien
                </span>
              </label>
              {secondaryRoomEnabled && (
                <RoomSelect
                  rooms={rooms}
                  occupiedRoomIds={occupiedRoomIds}
                  roomOccupancy={roomOccupancy}
                  value={secondaryRoomId}
                  onChange={onSecondaryRoomChange}
                  excludeRoomId={roomId}
                />
              )}
            </div>
          )}
        </div>

        {isDuo ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="shrink-0 space-y-3 mb-3">
              <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 p-3 text-xs text-violet-800 dark:text-violet-300">
                Soin à plusieurs — {effectiveStaffing} praticiens requis. Vous pouvez diffuser la demande à toute l'équipe, ou assigner manuellement.
              </div>

              <BroadcastCard violet broadcast={broadcast} onToggle={handleToggleBroadcast} />

              {!broadcast && <TherapistSearch value={search} onChange={setSearch} />}
            </div>

            {!broadcast && (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
                {Array.from({ length: effectiveStaffing }).map((_, idx) => {
                  const currentId =
                    idx === 0 ? therapistId : (additionalTherapistIds[idx - 1] ?? "");
                  const otherIds = Array.from({ length: effectiveStaffing }, (_, i) =>
                    i === 0 ? therapistId : (additionalTherapistIds[i - 1] ?? "")
                  ).filter((id, i) => i !== idx && id !== "");
                  return (
                    <div key={idx} className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        {t("booking.comboDuo.practitionerLabel", { index: idx + 1, defaultValue: `Praticien ${idx + 1}` })}
                      </Label>
                      <TherapistList
                        therapists={filteredTherapists}
                        selectedId={currentId}
                        slotIndex={idx}
                        broadcast={broadcast}
                        exclude={otherIds}
                        onPick={handlePickTherapist}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <Label className="shrink-0 text-xs font-medium block mb-2">
              Thérapeute / Prestataire
            </Label>
            <div className="shrink-0 mb-2">
              <TherapistSearch value={search} onChange={setSearch} />
            </div>
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="space-y-2">
                <BroadcastCard broadcast={broadcast} onToggle={handleToggleBroadcast} />
                <SectionedTherapistCards
                  therapists={filteredTherapists}
                  selectedId={therapistId}
                  broadcast={broadcast}
                  onPick={(id) => handlePickTherapist(id, 0)}
                />
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border bg-background px-6 pt-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-7 text-xs px-2 shrink-0"
          >
            ← Retour
          </Button>

          <div className="flex-1 min-w-0 flex justify-center">
            {cart.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto">
                {cartDetails.slice(0, 3).map(({ treatmentId, quantity, treatment }) => (
                  <div
                    key={treatmentId}
                    className="flex items-center gap-1.5 bg-muted rounded-full px-2.5 py-1 shrink-0"
                  >
                    <span className="text-xs font-medium truncate max-w-[100px]">
                      {treatment?.name}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">×{quantity}</span>
                  </div>
                ))}
                {cartDetails.length > 3 && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    +{cartDetails.length - 3}
                  </span>
                )}
                <span className="font-bold text-sm shrink-0 ml-1">
                  {formatPrice(finalPriceWithSurcharge, currency)}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground">Aucun service</span>
            )}
          </div>

          <Button
            type="submit"
            disabled={isPending || cart.length === 0 || !selectionComplete}
            size="sm"
            className="h-7 text-xs px-3 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isPending ? "Création..." : isConcierge && broadcast ? "Envoyer la demande" : isConcierge ? "Confirmer" : "Créer"}
            {isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
