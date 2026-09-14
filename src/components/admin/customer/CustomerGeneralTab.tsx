import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User } from "lucide-react";
import { PhoneNumberField } from "@/components/PhoneNumberField";
import { countries, splitPhoneNumber } from "@/lib/phone";
import type { CustomerFormValues } from "@/pages/admin/CustomerDetail";

// Astérisque rouge marquant un champ obligatoire.
function Req() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

interface CustomerGeneralTabProps {
  form: UseFormReturn<CustomerFormValues>;
  disabled: boolean;
}

export function CustomerGeneralTab({ form, disabled }: CustomerGeneralTabProps) {
  const { t } = useTranslation(["admin", "common"]);
  // Indicatif retenu quand le champ est vide : le numéro stocké ne peut alors
  // pas le porter.
  const [pickedCountryCode, setPickedCountryCode] = useState("+33");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <User className="h-4 w-4 text-gold-600" />
            {t("customers.identity")}
          </CardTitle>
          <CardDescription>
            {t("customers.identityDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("customers.firstName")}
                    <Req />
                  </FormLabel>
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
                  <FormLabel>{t("customers.lastName")}</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={disabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => {
                const raw = field.value ?? "";
                const { countryCode: parsedCode, phone: localPhone } = splitPhoneNumber(raw);
                // Le numéro stocké porte son indicatif dès qu'il commence par « + » ;
                // tant qu'il est vide, on garde le dernier indicatif choisi.
                const countryCode = raw.trim().startsWith("+")
                  ? parsedCode
                  : pickedCountryCode;

                return (
                  <FormItem>
                    <FormLabel>
                      {t("customers.phone")}
                      <Req />
                    </FormLabel>
                    <FormControl>
                      <PhoneNumberField
                        value={localPhone}
                        onChange={(value) =>
                          field.onChange(value ? `${countryCode} ${value}` : "")
                        }
                        countryCode={countryCode}
                        setCountryCode={(code) => {
                          setPickedCountryCode(code);
                          field.onChange(localPhone ? `${code} ${localPhone}` : "");
                        }}
                        countries={countries}
                        disabled={disabled}
                        placeholder="6 12 34 56 78"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.email")}</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={disabled} type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="civility"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("booking.civility.label")}</FormLabel>
                  <Select
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                    disabled={disabled}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("customers.selectPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="madame">{t("booking.civility.madame")}</SelectItem>
                      <SelectItem value="monsieur">{t("booking.civility.monsieur")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.languageLabel")}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={disabled}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="fr">
                        <span className="flex items-center gap-2">
                          <span className="text-base leading-none">🇫🇷</span>
                          {t("common:language.fr")}
                        </span>
                      </SelectItem>
                      <SelectItem value="en">
                        <span className="flex items-center gap-2">
                          <span className="text-base leading-none">🇬🇧</span>
                          {t("common:language.en")}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
