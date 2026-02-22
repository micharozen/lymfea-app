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
import {
  ImageIcon,
  Loader2,
  MapPin,
  Wallet,
  Building2,
  Globe,
  Banknote,
  Percent,
  Clock,
  Settings,
  Info,
  Type,
  Users,
  Euro,
  Plug,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimezoneSelectField } from "@/components/TimezoneSelector";
import { getCountryDefaults } from "@/lib/timezones";
import { formatPrice } from "@/lib/formatPrice";
import { PmsConfigDialog } from "@/components/admin/PmsConfigDialog";
import { VenueWizardFormValues } from "../VenueWizardDialog";
import { brand } from "@/config/brand";

// Section header component
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b mb-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

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

  // Fetch booking stats
  const { data: stats } = useQuery({
    queryKey: ["venue-stats", hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("total_price, status")
        .eq("hotel_id", hotelId!);
      if (error) throw error;

      let totalSales = 0;
      let bookingsCount = 0;
      (data || []).forEach((b) => {
        bookingsCount++;
        if (b.status === "completed" && b.total_price) {
          totalSales += Number(b.total_price);
        }
      });
      return { totalSales, bookingsCount };
    },
    enabled: !!hotelId,
  });

  // Get currency for formatting
  const currencyValue = useWatch({ control: form.control, name: "currency" });

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
              {!disabled && (
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
              )}
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
              {!disabled && (
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
              )}
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
                  <Select value={field.value} onValueChange={field.onChange} disabled={mode === 'edit' || disabled}>
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
                  <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
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
                  {venueTypeValue === 'coworking' ? 'Nom du coworking' : venueTypeValue === 'enterprise' ? "Nom de l'entreprise" : "Nom de l'hôtel"}
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
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
                    <Input placeholder="Beauty Services" {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
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
                <Input {...field} disabled={disabled} />
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
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  Pays
                </FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
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
                disabled={disabled}
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
            <FormItem className="flex items-center justify-between rounded-lg border p-4 mt-3">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Offert par l'entreprise</FormLabel>
                <p className="text-sm text-muted-foreground">
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
      </div>

      {/* Concierges (hotel type only, when venue is saved) */}
      {hotelId && venueTypeValue === 'hotel' && (
        <>
          <Separator />
          <div>
            <SectionHeader icon={Users} title={`Concierges (${concierges.length})`} />
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
          </div>
        </>
      )}

      {/* Statistics (when venue is saved) */}
      {hotelId && stats && (
        <>
          <Separator />
          <div>
            <SectionHeader icon={Euro} title="Statistiques" />
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Ventes totales</p>
                <p className="text-xl font-semibold">
                  {formatPrice(stats.totalSales || 0, currencyValue || "EUR")}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Réservations</p>
                <p className="text-xl font-semibold">{stats.bookingsCount || 0}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* PMS Integration (hotel type only, when venue is saved) */}
      {hotelId && venueTypeValue === 'hotel' && (
        <>
          <Separator />
          <div>
            <SectionHeader icon={Plug} title="Intégration PMS" />
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Configuration PMS du lieu
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPmsDialogOpen(true)}
                >
                  <Plug className="h-4 w-4 mr-2" />
                  Configurer
                </Button>
              </div>
            </div>
          </div>

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
