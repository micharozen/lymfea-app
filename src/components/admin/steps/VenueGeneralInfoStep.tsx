import { useEffect, useRef, useState } from "react";
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
import { OrganizationSelectField } from "../OrganizationSelectField";
import { useUser } from "@/contexts/UserContext";
import { brand } from "@/config/brand";
import { slugify } from "@/lib/slugify";

interface TreatmentRoom {
  id: string;
  name: string;
  room_number: string;
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

// Component to display calculated Eïa commission
function LymfeaCommissionDisplay({ control }: { control: Control<VenueWizardFormValues> }) {
  const { t } = useTranslation(['admin', 'common']);
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
        {t('venue.general.brandCommission', { brand: brand.name })}
      </label>
      <div className={`relative flex items-center h-10 px-3 border rounded-md bg-muted/50 ${isInvalid ? 'border-destructive' : ''}`}>
        <span className={`text-sm font-medium ${isInvalid ? 'text-destructive' : 'text-foreground'}`}>
          {isInvalid ? t('venue.general.error') : `${lymfeaCommission.toFixed(2)}%`}
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
  rooms: TreatmentRoom[];
  selectedRoomIds: string[];
  setSelectedRoomIds: (ids: string[]) => void;
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
  rooms,
  selectedRoomIds,
  setSelectedRoomIds,
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
  const { t } = useTranslation(['admin', 'common']);
  const { isSuperAdmin } = useUser();
  const uploading = uploadingHotel || uploadingCover;

  // Watch venue_type for label changes
  const venueTypeValue = useWatch({ control: form.control, name: "venue_type" });

  // Watch country field and auto-suggest timezone, currency, VAT (only for add mode)
  const countryValue = useWatch({ control: form.control, name: "country" });

  // Auto-prepopulate slug from name until the user manually edits the slug field.
  const nameValue = useWatch({ control: form.control, name: "name" });
  const slugValue = useWatch({ control: form.control, name: "slug" });
  const slugTouchedRef = useRef(false);
  useEffect(() => {
    if (mode !== 'add') return;
    if (slugTouchedRef.current) return;
    form.setValue("slug", slugify(nameValue), { shouldValidate: false });
  }, [nameValue, mode, form]);

  // Watch global therapist commission toggle
  const globalTherapistCommission = useWatch({ control: form.control, name: "global_therapist_commission" });

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
      {isSuperAdmin && mode === "add" && (
        <div className="mb-6 border-b border-border/60 pb-6">
          <OrganizationSelectField
            control={form.control}
            name="organization_id"
          />
        </div>
      )}

      {/* Images + Basic Info */}
      <div className="grid grid-cols-[1fr_2fr] gap-6">
        {/* Images Column */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {t('venue.general.photo')}
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
                {uploadingHotel ? t('venue.general.uploading') : t('venue.general.choose')}
                {uploadingHotel && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {t('venue.general.cover')}
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
                {uploadingCover ? t('venue.general.uploading') : t('venue.general.choose')}
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
                    {t('venue.general.venueType')}
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={mode === 'edit'}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hotel">Hotel</SelectItem>
                      <SelectItem value="coworking">Coworking</SelectItem>
                      <SelectItem value="enterprise">{t('venue.general.typeEnterprise')}</SelectItem>
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
                  <FormLabel>{t('venue.general.status')}</FormLabel>
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
                  {venueTypeValue === 'coworking'
                    ? t('venue.general.nameCoworking')
                    : venueTypeValue === 'enterprise'
                    ? t('venue.general.nameEnterprise')
                    : t('venue.general.nameHotel')}
                </FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('venue.general.publicLink')}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('venue.general.publicLinkPlaceholder')}
                    {...field}
                    onChange={(e) => {
                      slugTouchedRef.current = true;
                      field.onChange(e.target.value);
                    }}
                  />
                </FormControl>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('venue.general.publicLinkHelpBefore')}{' '}
                  <code className="text-[10px]">{`${brand.appDomain}/client/${slugify(slugValue || nameValue) || 'le-ritz-paris'}`}</code>
                  {t('venue.general.publicLinkHelpAfter')}
                </p>
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
                    {t('venue.general.landingSubtitle')}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px]">
                        <p className="text-xs">{t('venue.general.landingSubtitleHelp')}</p>
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

          {/* Treatment Room Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              {t('venue.general.treatmentRooms')}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal h-9 text-xs hover:bg-background hover:text-foreground"
                >
                  <span className="truncate">
                    {selectedRoomIds.length === 0
                      ? t('venue.general.selectRooms')
                      : rooms
                          .filter((r) => selectedRoomIds.includes(r.id))
                          .map((r) => r.name)
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
                    {rooms.map((room) => {
                      const isSelected = selectedRoomIds.includes(room.id);
                      return (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedRoomIds(selectedRoomIds.filter((id) => id !== room.id));
                            } else {
                              setSelectedRoomIds([...selectedRoomIds, room.id]);
                            }
                          }}
                          className="w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-popover-foreground transition-colors hover:bg-foreground/5"
                        >
                          <span className="min-w-0 truncate text-left">{room.name}</span>
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
        <SectionHeader icon={MapPin} title={t('venue.general.locationTitle')} />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem className="mb-4">
              <FormLabel className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {t('venue.general.address')}
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
                <FormLabel>{t('venue.general.postalCode')}</FormLabel>
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
                <FormLabel>{t('venue.general.city')}</FormLabel>
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
                label={t('venue.general.timezone')}
              />
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Section: Finance */}
      <div>
        <SectionHeader icon={Wallet} title={t('venue.general.financeTitle')} />

        <div className="grid grid-cols-2 gap-4 mb-4">
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('venue.general.currency')}
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

        <FormField
          control={form.control}
          name="hotel_commission"
          render={({ field }) => (
            <FormItem className="mb-4">
              <FormLabel className="flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                {t('venue.general.venueCommission')}
              </FormLabel>
              <FormControl>
                <div className="relative w-40">
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
          name="global_therapist_commission"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3 mb-4">
              <div className="space-y-0.5 pr-4">
                <FormLabel className="text-sm font-medium">
                  {t('venue.general.globalTherapistCommission')}
                </FormLabel>
                <p className="text-xs text-muted-foreground">
                  {t('venue.general.globalTherapistCommissionDesc')}
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

        {globalTherapistCommission ? (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="therapist_commission"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                    {t('venue.general.therapistCommission')}
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

            <LymfeaCommissionDisplay control={form.control} />
          </div>
        ) : (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">
              {t('venue.general.perTherapistCommissionNote', { brand: brand.name })}
            </p>
          </div>
        )}
      </div>

      {/* Section: Paramètres */}
      <div>
        <SectionHeader icon={Settings} title={t('venue.general.bookingSettingsTitle')} />

        <FormField
          control={form.control}
          name="auto_validate_bookings"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">{t('venue.general.autoValidate')}</FormLabel>
                <p className="text-sm text-muted-foreground">
                  {t('venue.general.autoValidateDesc')}
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
