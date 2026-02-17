import { useEffect } from "react";
import { UseFormReturn, useWatch, Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import {
  ImageIcon,
  Check,
  Loader2,
  MapPin,
  Wallet,
  Building2,
  Globe,
  Banknote,
  Percent,
  Package,
  Clock,
  Settings,
  Info,
  Type,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimezoneSelectField } from "@/components/TimezoneSelector";
import { getCountryDefaults } from "@/lib/timezones";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VenueWizardFormValues } from "../VenueWizardDialog";

interface Trunk {
  id: string;
  name: string;
  trunk_id: string;
  image: string | null;
  hotel_id: string | null;
}

// Section header component
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b mb-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

// Component to display calculated OOM commission
function OomCommissionDisplay({ control }: { control: Control<VenueWizardFormValues> }) {
  const hotelCommission = useWatch({ control, name: "hotel_commission" });
  const hairdresserCommission = useWatch({ control, name: "hairdresser_commission" });

  const hotelComm = parseFloat(hotelCommission) || 0;
  const hairdresserComm = parseFloat(hairdresserCommission) || 0;
  const oomCommission = Math.max(0, 100 - hotelComm - hairdresserComm);
  const isInvalid = hotelComm + hairdresserComm > 100;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium flex items-center gap-1.5">
        <Percent className="h-3.5 w-3.5 text-muted-foreground" />
        Commission OOM
      </label>
      <div className={`relative flex items-center h-10 px-3 border rounded-md bg-muted/50 ${isInvalid ? 'border-destructive' : ''}`}>
        <span className={`text-sm font-medium ${isInvalid ? 'text-destructive' : 'text-foreground'}`}>
          {isInvalid ? 'Erreur' : `${oomCommission.toFixed(2)}%`}
        </span>
      </div>
      {isInvalid && (
        <p className="text-xs text-destructive">Total &gt; 100%</p>
      )}
    </div>
  );
}

interface VenueGeneralInfoStepProps {
  form: UseFormReturn<VenueWizardFormValues>;
  mode: 'add' | 'edit';
  trunks: Trunk[];
  selectedTrunkIds: string[];
  setSelectedTrunkIds: (ids: string[]) => void;
  hotelImage: string;
  coverImage: string;
  uploadingHotel: boolean;
  uploadingCover: boolean;
  hotelImageRef: React.RefObject<HTMLInputElement>;
  coverImageRef: React.RefObject<HTMLInputElement>;
  handleHotelImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCoverImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  triggerHotelImageSelect: () => void;
  triggerCoverImageSelect: () => void;
}

export function VenueGeneralInfoStep({
  form,
  mode,
  trunks,
  selectedTrunkIds,
  setSelectedTrunkIds,
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
}: VenueGeneralInfoStepProps) {
  const { t } = useTranslation('common');
  const uploading = uploadingHotel || uploadingCover;

  // Watch venue_type for label changes
  const venueTypeValue = useWatch({ control: form.control, name: "venue_type" });

  // Watch country field and auto-suggest timezone, currency, VAT (only for add mode)
  const countryValue = useWatch({ control: form.control, name: "country" });

  useEffect(() => {
    if (mode === 'add' && countryValue) {
      const defaults = getCountryDefaults(countryValue);
      if (defaults) {
        const current = form.getValues();
        // Only auto-suggest if values are still at defaults
        if (current.timezone === "Europe/Paris" || !current.timezone) {
          form.setValue("timezone", defaults.timezone);
        }
        if (current.currency === "EUR") {
          form.setValue("currency", defaults.currency);
        }
        if (current.vat === "20") {
          form.setValue("vat", defaults.vat.toString());
        }
      }
    }
  }, [countryValue, form, mode]);

  return (
    <div className="space-y-6">
      {/* Images + Basic Info */}
      <div className="grid grid-cols-[1fr_2fr] gap-6">
        {/* Images Column */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Photo du lieu
            </label>
            <div className="flex flex-col items-center gap-3 p-4 border rounded-md bg-muted/20">
              <Avatar className="h-16 w-16 rounded-md">
                <AvatarImage src={hotelImage} />
                <AvatarFallback className="bg-muted rounded-md">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <input
                ref={hotelImageRef}
                type="file"
                accept="image/*"
                onChange={handleHotelImageUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={triggerHotelImageSelect}
                disabled={uploading}
              >
                {uploadingHotel ? "Upload..." : "Choisir"}
                {uploadingHotel && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              Couverture
            </label>
            <div className="flex flex-col items-center gap-3 p-4 border rounded-md bg-muted/20">
              <Avatar className="h-16 w-16 rounded-md">
                <AvatarImage src={coverImage} />
                <AvatarFallback className="bg-muted rounded-md">
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <input
                ref={coverImageRef}
                type="file"
                accept="image/*"
                onChange={handleCoverImageUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={triggerCoverImageSelect}
                disabled={uploading}
              >
                {uploadingCover ? "Upload..." : "Choisir"}
                {uploadingCover && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Basic Info Column */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="venue_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Type de lieu
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={mode === 'edit'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hotel">Hotel</SelectItem>
                      <SelectItem value="coworking">Coworking</SelectItem>
                      <SelectItem value="enterprise">Entreprise</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Statut</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                          {t('status.active')}
                        </div>
                      </SelectItem>
                      <SelectItem value="pending">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-orange-500" />
                          {t('status.pending')}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {venueTypeValue === 'coworking' ? 'Nom du coworking' : 'Nom de l\'hôtel'}
                </FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Landing Subtitle (hotel only) */}
          {venueTypeValue === 'hotel' && (
            <FormField
              control={form.control}
              name="landing_subtitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5 text-muted-foreground" />
                    Sous-titre landing page
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px]">
                        <p className="text-xs">Texte affiche sous le nom du lieu sur la page d'accueil client. Par defaut : "Beauty Services".</p>
                      </TooltipContent>
                    </Tooltip>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Beauty Services" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Trunk Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              Trunks (Malles)
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground"
                >
                  <span className="truncate">
                    {selectedTrunkIds.length === 0
                      ? "Sélectionner des trunks"
                      : trunks
                          .filter((t) => selectedTrunkIds.includes(t.id))
                          .map((t) => t.name)
                          .join(", ")}
                  </span>
                  <svg className="h-3 w-3 opacity-50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 p-0"
                align="start"
                onWheelCapture={(e) => e.stopPropagation()}
                onTouchMoveCapture={(e) => e.stopPropagation()}
              >
                <ScrollArea className="h-40 touch-pan-y">
                  <div className="p-1">
                    {trunks.map((trunk) => {
                      const isSelected = selectedTrunkIds.includes(trunk.id);
                      return (
                        <button
                          key={trunk.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTrunkIds(selectedTrunkIds.filter((id) => id !== trunk.id));
                            } else {
                              setSelectedTrunkIds([...selectedTrunkIds, trunk.id]);
                            }
                          }}
                          className="w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-foreground/5"
                        >
                          <span className="min-w-0 truncate text-left">{trunk.name}</span>
                          {isSelected ? (
                            <span className="h-4 w-4 grid place-items-center rounded-sm bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                          ) : (
                            <span className="h-4 w-4" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Section: Localisation */}
      <div>
        <SectionHeader icon={MapPin} title="Localisation" />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem className="mb-4">
              <FormLabel className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Adresse
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-4 mb-4">
          <FormField
            control={form.control}
            name="postal_code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Code postal</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ville</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  Pays
                </FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <FormItem>
              <TimezoneSelectField
                value={field.value}
                onChange={field.onChange}
                label="Fuseau horaire"
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Section: Finance */}
      <div>
        <SectionHeader icon={Wallet} title="Finance" />

        <div className="grid grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                  Devise
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="CHF">CHF</SelectItem>
                    <SelectItem value="AED">AED (د.إ)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="vat"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                  TVA
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type="number" step="0.01" {...field} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="hotel_commission"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                  Commission lieu
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type="number" step="0.01" min="0" max="100" {...field} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hairdresser_commission"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                  Commission coiffeur
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type="number" step="0.01" min="0" max="100" {...field} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <OomCommissionDisplay control={form.control} />
        </div>
      </div>

      {/* Section: Paramètres */}
      <div>
        <SectionHeader icon={Settings} title="Paramètres de réservation" />

        <FormField
          control={form.control}
          name="auto_validate_bookings"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Auto-validation des réservations</FormLabel>
                <p className="text-sm text-muted-foreground">
                  Si activé et qu'un seul coiffeur est assigné au lieu, les réservations seront automatiquement confirmées sans validation manuelle.
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="offert"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4 mt-3">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Journée offerte (Démo)</FormLabel>
                <p className="text-sm text-muted-foreground">
                  Si activé, tous les soins seront affichés comme gratuits pour les clients. Idéal pour une journée de démonstration.
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
