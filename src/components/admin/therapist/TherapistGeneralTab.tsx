import { UseFormReturn } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneNumberField, CountryOption } from "@/components/PhoneNumberField";
import { User, Loader2 } from "lucide-react";
import type { TherapistFormValues } from "@/pages/admin/TherapistDetail";

const countries: CountryOption[] = [
  { code: "+33", label: "France", flag: "🇫🇷" },
  { code: "+971", label: "EAU", flag: "🇦🇪" },
  { code: "+1", label: "États-Unis", flag: "🇺🇸" },
  { code: "+44", label: "Royaume-Uni", flag: "🇬🇧" },
  { code: "+49", label: "Allemagne", flag: "🇩🇪" },
  { code: "+39", label: "Italie", flag: "🇮🇹" },
  { code: "+34", label: "Espagne", flag: "🇪🇸" },
  { code: "+41", label: "Suisse", flag: "🇨🇭" },
  { code: "+32", label: "Belgique", flag: "🇧🇪" },
  { code: "+377", label: "Monaco", flag: "🇲🇨" },
];

interface TherapistGeneralTabProps {
  form: UseFormReturn<TherapistFormValues>;
  disabled: boolean;
  profileImage: string;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  triggerFileSelect: () => void;
}

export function TherapistGeneralTab({
  form,
  disabled,
  profileImage,
  uploading,
  fileInputRef,
  handleImageUpload,
  triggerFileSelect,
}: TherapistGeneralTabProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-l-gold-400">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-gold-500" />
                {t("admin:therapists.identity", "Identité")}
              </CardTitle>
              <CardDescription>
                {t("admin:therapists.identityDesc", "Photo, nom et contact")}
              </CardDescription>
            </div>
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 text-xs gap-1 px-2 w-auto min-w-[90px]">
                      <SelectValue placeholder="En attente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Actif">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          {t("status.active")}
                        </div>
                      </SelectItem>
                      <SelectItem value="En attente">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                          {t("status.pending")}
                        </div>
                      </SelectItem>
                      <SelectItem value="Inactif">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          {t("status.inactive")}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-[auto_1fr] gap-6">
            {/* Profile photo */}
            <div className="space-y-1.5 text-center">
              <div
                className={`relative h-20 w-20 rounded-full border-2 border-dashed border-muted-foreground/25 bg-muted/30 overflow-hidden transition-colors ${!disabled ? "cursor-pointer hover:border-gold-400/50" : ""}`}
                onClick={!disabled ? triggerFileSelect : undefined}
              >
                {profileImage ? (
                  <img
                    src={profileImage}
                    className="h-full w-full object-cover"
                    alt="Profile"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <User className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-[11px] h-6 px-2"
                  onClick={triggerFileSelect}
                  disabled={uploading}
                >
                  {uploading ? "..." : "Modifier"}
                </Button>
              )}
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin:therapists.firstName", "Prénom")} *</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin:therapists.lastName", "Nom")} *</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" disabled={disabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin:therapists.phone", "Téléphone")} *</FormLabel>
                      <FormControl>
                        <PhoneNumberField
                          value={field.value}
                          onChange={field.onChange}
                          countryCode={form.watch("country_code")}
                          setCountryCode={(val) =>
                            form.setValue("country_code", val)
                          }
                          countries={countries}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
