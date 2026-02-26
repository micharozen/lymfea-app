import { useEffect, useState } from "react";
import { UseFormReturn, useWatch, Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ImageIcon,
  Loader2,
  MapPin,
  Wallet,
  Building2,
  Globe,
  Banknote,
  Percent,
  Settings,
  Info,
  Type,
  Users,
  Plug,
  ChevronsUpDown,
  Check,
  Palette,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimezoneSelectField } from "@/components/TimezoneSelector";
import { getCountryDefaults, COUNTRY_OPTIONS } from "@/lib/timezones";
import { PmsConfigDialog } from "@/components/admin/PmsConfigDialog";
import { VenueWizardFormValues } from "../VenueWizardDialog";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

// Component to display calculated Lymfea commission
function LymfeaCommissionDisplay({ control }: { control: Control<VenueWizardFormValues> }) {
  const hotelCommission = useWatch({ control, name: "hotel_commission" });
  const therapistCommission = useWatch({ control, name: "therapist_commission" });

  const hotelComm = parseFloat(hotelCommission) || 0;
  const therapistComm = parseFloat(therapistCommission) || 0;
  const lymfeaCommission = Math.max(0, 100 - hotelComm - therapistComm);
  const isInvalid = hotelComm + therapistComm > 100;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium flex items-center gap-1.5">
        <Percent className="h-3.5 w-3.5 text-muted-foreground" />
        {`Commission ${brand.name}`}
      </label>
      <div className={`relative flex items-center h-10 px-3 border rounded-md bg-muted/50 ${isInvalid ? 'border-destructive' : ''}`}>
        <span className={`text-sm font-medium ${isInvalid ? 'text-destructive' : 'text-foreground'}`}>
          {isInvalid ? 'Erreur' : `${lymfeaCommission.toFixed(2)}%`}
        </span>
      </div>
      {isInvalid && (
        <p className="text-xs text-destructive">Total &gt; 100%</p>
      )}
    </div>
  );
}

interface VenueGeneralTabProps {
  form: UseFormReturn<VenueWizardFormValues>;
  mode: 'add' | 'edit';
  disabled?: boolean;
  hotelId?: string;
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

export function VenueGeneralTab({
  form,
  mode,
  disabled = false,
  hotelId,
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
}: VenueGeneralTabProps) {
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

  // Country picker state
  const [countryOpen, setCountryOpen] = useState(false);

  // PMS dialog state
  const [pmsDialogOpen, setPmsDialogOpen] = useState(false);

  // Fetch concierges (hotel type only)
  const { data: concierges = [] } = useQuery({
    queryKey: ["venue-concierges", hotelId],
    queryFn: async () => {
      const { data: mappings, error: mapError } = await supabase
        .from("concierge_hotels")
        .select("concierge_id")
        .eq("hotel_id", hotelId!);
      if (mapError) throw mapError;
      if (!mappings || mappings.length === 0) return [];

      const ids = mappings.map((m) => m.concierge_id);
      const { data, error } = await supabase
        .from("concierges")
        .select("id, first_name, last_name, profile_image")
        .in("id", ids);
      if (error) throw error;
      return data || [];
    },
    enabled: !!hotelId && venueTypeValue === "hotel",
  });


  return (
    <div className="space-y-6">
      {/* Card A: Identity */}
      <Card className="border-l-4 border-l-gold-400">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gold-500" />
                Identité du lieu
              </CardTitle>
              <CardDescription>Photo, nom et type de lieu</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <FormField
                control={form.control}
                name="venue_type"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <Select value={field.value} onValueChange={field.onChange} disabled={mode === 'edit' || disabled}>
                      <SelectTrigger className="h-7 text-xs gap-1 px-2 w-auto min-w-[90px]">
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
                  <FormItem className="space-y-0">
                    <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                      <SelectTrigger className="h-7 text-xs gap-1 px-2 w-auto min-w-[90px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                            {t('status.active')}
                          </div>
                        </SelectItem>
                        <SelectItem value="pending">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[auto_1fr] gap-6">
            {/* Compact images */}
            <div className="flex gap-3">
              {/* Venue photo */}
              <div className="space-y-1.5 text-center">
                <div
                  className={`relative h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 overflow-hidden transition-colors ${!disabled ? 'cursor-pointer hover:border-gold-400/50' : ''}`}
                  onClick={!disabled ? triggerHotelImageSelect : undefined}
                >
                  {hotelImage ? (
                    <img src={hotelImage} className="h-full w-full object-cover" alt="Venue" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                  )}
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
                  className={`relative h-20 w-32 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 overflow-hidden transition-colors ${!disabled ? 'cursor-pointer hover:border-gold-400/50' : ''}`}
                  onClick={!disabled ? triggerCoverImageSelect : undefined}
                >
                  {coverImage ? (
                    <img src={coverImage} className="h-full w-full object-cover" alt="Cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                  )}
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

            {/* Basic Info */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {venueTypeValue === 'coworking' ? 'Nom du coworking' : venueTypeValue === 'enterprise' ? "Nom de l'entreprise" : "Nom de l'hôtel"}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} disabled={disabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        <Input placeholder="Beauty Services" {...field} disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>

          {/* Calendar Color Picker */}
          <FormField
            control={form.control}
            name="calendar_color"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel className="flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                  Couleur du planning
                </FormLabel>
                <div className="flex flex-wrap gap-2">
                  {[
                    '#3b82f6', '#06b6d4', '#10b981', '#84cc16',
                    '#f59e0b', '#f97316', '#ef4444', '#ec4899',
                    '#8b5cf6', '#6366f1', '#78716c', '#475569',
                  ].map((color) => (
                    <button
                      key={color}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        "w-7 h-7 rounded-full border-2 transition-all",
                        field.value === color
                          ? "border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/20"
                          : "border-transparent hover:scale-105",
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => field.onChange(color)}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Card B: Localisation */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            Localisation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Adresse
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="postal_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code postal</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={disabled} />
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
                    <Input {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="country"
              render={({ field }) => {
                const selectedCountry = COUNTRY_OPTIONS.find(
                  (c) => c.value === field.value?.toLowerCase()
                );
                return (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      Pays
                    </FormLabel>
                    <Popover open={disabled ? false : countryOpen} onOpenChange={disabled ? undefined : setCountryOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            disabled={disabled}
                            className={cn(
                              "w-full justify-between font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {selectedCountry?.label || field.value || "Sélectionner un pays"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[220px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Rechercher un pays..." />
                          <CommandList className="max-h-[200px]">
                            <CommandEmpty>Aucun pays trouvé.</CommandEmpty>
                            <CommandGroup>
                              {COUNTRY_OPTIONS.map((country) => (
                                <CommandItem
                                  key={country.value}
                                  value={country.label}
                                  onSelect={() => {
                                    field.onChange(country.value);
                                    setCountryOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value?.toLowerCase() === country.value
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  {country.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                );
              }}
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
                  disabled={disabled}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Card C: Finance */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-500" />
            Finance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Devise & Fiscalité
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                      Devise
                    </FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
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
                        <Input type="number" step="0.01" {...field} disabled={disabled} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Répartition des commissions
            </p>
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
                        <Input type="number" step="0.01" min="0" max="100" {...field} disabled={disabled} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="therapist_commission"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                      Commission thérapeute
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type="number" step="0.01" min="0" max="100" {...field} disabled={disabled} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <LymfeaCommissionDisplay control={form.control} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card D: Booking Settings */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4 text-orange-500" />
            Paramètres de réservation
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <FormField
            control={form.control}
            name="auto_validate_bookings"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between py-4 first:pt-0">
                <div className="space-y-0.5 pr-4">
                  <FormLabel className="text-sm font-medium">Auto-validation des réservations</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Si activé et qu'un seul thérapeute est assigné au lieu, les réservations seront automatiquement confirmées sans validation manuelle.
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="offert"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between py-4">
                <div className="space-y-0.5 pr-4">
                  <FormLabel className="text-sm font-medium">Journée offerte (Démo)</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Si activé, tous les soins seront affichés comme gratuits pour les clients. Idéal pour une journée de démonstration.
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="company_offered"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between py-4 last:pb-0">
                <div className="space-y-0.5 pr-4">
                  <FormLabel className="text-sm font-medium">Offert par l'entreprise</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Si activé, les prix sont masqués pour les clients. Les réservations sont créées comme offertes.
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Card E: Concierges (hotel type only, when venue is saved) */}
      {hotelId && venueTypeValue === 'hotel' && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-500" />
                Concierges
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {concierges.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {concierges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {concierges.map((concierge: any) => (
                  <div
                    key={concierge.id}
                    className="flex items-center gap-2 bg-muted/50 rounded-full pl-1 pr-3 py-1"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={concierge.profile_image || undefined} />
                      <AvatarFallback className="text-xs">
                        {concierge.first_name?.[0] || ""}
                        {concierge.last_name?.[0] || ""}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">
                      {concierge.first_name} {concierge.last_name}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun concierge assigné</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Card F: PMS Integration (hotel type only, when venue is saved) */}
      {hotelId && venueTypeValue === 'hotel' && (
        <>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Plug className="h-4 w-4 text-cyan-500" />
                  Intégration PMS
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPmsDialogOpen(true)}
                >
                  <Plug className="h-4 w-4 mr-2" />
                  Configurer
                </Button>
              </div>
              <CardDescription>
                Configuration PMS du lieu
              </CardDescription>
            </CardHeader>
          </Card>

          <PmsConfigDialog
            open={pmsDialogOpen}
            onOpenChange={setPmsDialogOpen}
            hotelId={hotelId}
            hotelName={form.getValues('name')}
          />
        </>
      )}
    </div>
  );
}
