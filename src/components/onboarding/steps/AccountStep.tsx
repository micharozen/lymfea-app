import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Controller, type UseFormReturn } from "react-hook-form";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { phoneCountries, toFlagEmoji } from "@/lib/phoneCountries";
import type { OnboardingValues } from "../schemas";

interface AccountStepProps {
  form: UseFormReturn<OnboardingValues>;
  onGoogleSignup: () => void;
  googleLoading?: boolean;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.93 3.4 14.7 2.4 12 2.4 6.96 2.4 2.9 6.46 2.9 11.5s4.06 9.1 9.1 9.1c5.25 0 8.72-3.69 8.72-8.88 0-.6-.07-1.06-.16-1.52H12z"
      />
      <path
        fill="#4285F4"
        d="M21.6 11.72c0-.6-.07-1.06-.16-1.52H12v3.9h5.5c-.11.66-.71 1.65-2.04 2.36l3.13 2.43c1.83-1.69 2.99-4.18 2.99-7.17z"
      />
      <path
        fill="#FBBC05"
        d="M5.5 13.95c-.21-.62-.33-1.27-.33-1.95s.12-1.33.33-1.95L2.35 7.62A9.07 9.07 0 0 0 1.4 12c0 1.58.37 3.07 1.02 4.39L5.5 13.95z"
      />
      <path
        fill="#34A853"
        d="M12 21.6c2.7 0 4.97-.89 6.63-2.41l-3.13-2.43c-.86.6-2.02 1.04-3.5 1.04-2.69 0-4.97-1.81-5.78-4.26L2.97 16.4C4.6 19.51 8.04 21.6 12 21.6z"
      />
    </svg>
  );
}

interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  percent: number;
  barClass: string;
  labelKey: "veryWeak" | "weak" | "fair" | "good" | "strong";
}

function computePasswordStrength(pw: string): PasswordStrength {
  if (!pw) {
    return { score: 0, percent: 0, barClass: "bg-transparent", labelKey: "veryWeak" };
  }
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const bars: Record<0 | 1 | 2 | 3 | 4, { percent: number; barClass: string; labelKey: PasswordStrength["labelKey"] }> = {
    0: { percent: 10, barClass: "bg-red-500", labelKey: "veryWeak" },
    1: { percent: 25, barClass: "bg-red-500", labelKey: "weak" },
    2: { percent: 50, barClass: "bg-orange-500", labelKey: "fair" },
    3: { percent: 75, barClass: "bg-yellow-500", labelKey: "good" },
    4: { percent: 100, barClass: "bg-green-500", labelKey: "strong" },
  };
  return { score: clamped, ...bars[clamped] };
}

export function AccountStep({ form, onGoogleSignup, googleLoading = false }: AccountStepProps) {
  const { t } = useTranslation("admin");
  const {
    register,
    formState: { errors },
  } = form;

  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const selectedCountryCode = form.watch("countryCode") ?? "+33";
  const selectedCountry = useMemo(
    () => phoneCountries.find((c) => c.code === selectedCountryCode) ?? phoneCountries[0],
    [selectedCountryCode],
  );

  const passwordValue = form.watch("password") ?? "";
  const confirmPasswordValue = form.watch("confirmPassword") ?? "";
  const passwordStrength = useMemo(() => computePasswordStrength(passwordValue), [passwordValue]);
  const passwordsMismatch =
    confirmPasswordValue.length > 0 && confirmPasswordValue !== passwordValue;
  const passwordsMatch =
    confirmPasswordValue.length > 0 && passwordValue.length > 0 && confirmPasswordValue === passwordValue;

  const filteredCountries = useMemo(() => {
    const q = countrySearch.toLowerCase().trim();
    if (!q) return phoneCountries;
    return phoneCountries.filter(
      (c) => c.label.toLowerCase().includes(q) || c.code.includes(q),
    );
  }, [countrySearch]);

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full h-10 gap-2 font-normal"
        onClick={onGoogleSignup}
        disabled={googleLoading}
      >
        <GoogleIcon className="h-4 w-4" />
        {t("onboarding.account.continueWithGoogle")}
      </Button>
      <div className="relative flex items-center">
        <div className="flex-1 border-t" />
        <span className="px-3 text-xs uppercase text-muted-foreground">
          {t("onboarding.account.orDivider")}
        </span>
        <div className="flex-1 border-t" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">{t("onboarding.account.firstName.label")}</Label>
          <Input
            id="firstName"
            autoComplete="given-name"
            placeholder={t("onboarding.account.firstName.placeholder")}
            {...register("firstName")}
          />
          {errors.firstName && (
            <p className="text-xs text-destructive">
              {t("onboarding.account.firstName.error")}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">{t("onboarding.account.lastName.label")}</Label>
          <Input
            id="lastName"
            autoComplete="family-name"
            placeholder={t("onboarding.account.lastName.placeholder")}
            {...register("lastName")}
          />
          {errors.lastName && (
            <p className="text-xs text-destructive">
              {t("onboarding.account.lastName.error")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">{t("onboarding.account.phone.label")}</Label>
        <Controller
          control={form.control}
          name="phone"
          render={({ field }) => (
            <div className="flex h-10 w-full items-center overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <Popover open={countryPopoverOpen} onOpenChange={setCountryPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-full rounded-none border-r border-input px-3 font-normal text-sm gap-1 hover:bg-muted"
                    aria-expanded={countryPopoverOpen}
                  >
                    <span>{toFlagEmoji(selectedCountry?.flag ?? "FR")}</span>
                    <span className="tabular-nums">{selectedCountryCode}</span>
                    <ChevronDown className="ml-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[calc(100vw-2rem)] sm:w-64 p-0 z-50"
                >
                  <div className="p-2 border-b">
                    <Input
                      placeholder="Search..."
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <ScrollArea className="h-48 sm:h-56">
                    {filteredCountries.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => {
                          form.setValue("countryCode", country.code, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          form.setValue("phone", "", { shouldDirty: true });
                          setCountryPopoverOpen(false);
                          setCountrySearch("");
                        }}
                        className={cn(
                          "flex w-full items-center px-3 py-2 text-sm hover:bg-muted",
                          selectedCountryCode === country.code && "bg-accent text-accent-foreground",
                        )}
                      >
                        <span className="w-8 shrink-0 text-base">{toFlagEmoji(country.flag)}</span>
                        <span className="flex-1 text-left">{country.label}</span>
                        <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                          {country.code}
                        </span>
                      </button>
                    ))}
                    {filteredCountries.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={field.value ?? ""}
                onChange={(e) => {
                  let clean = e.target.value.replace(/\s/g, "");
                  if (clean.startsWith(selectedCountryCode)) {
                    clean = clean.slice(selectedCountryCode.length);
                  } else if (clean.startsWith("+")) {
                    clean = clean.replace(/^\+\d{1,3}/, "");
                  }
                  field.onChange(clean);
                }}
                onBlur={field.onBlur}
                placeholder={selectedCountry?.placeholder ?? "6 12 34 56 78"}
                className="h-full flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
              />
            </div>
          )}
        />
        {errors.phone && (
          <p className="text-xs text-destructive">{t("onboarding.account.phone.error")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">{t("onboarding.account.email.label")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder={t("onboarding.account.email.placeholder")}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{t("onboarding.account.email.error")}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("onboarding.account.password.label")}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder={t("onboarding.account.password.placeholder")}
              className="pr-9"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={t(
                showPassword
                  ? "onboarding.account.password.hide"
                  : "onboarding.account.password.show",
              )}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordValue.length > 0 && (
            <div className="space-y-1" aria-live="polite">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full transition-all duration-300 ease-out", passwordStrength.barClass)}
                  style={{ width: `${passwordStrength.percent}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={passwordStrength.percent}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t(`onboarding.account.password.strength.${passwordStrength.labelKey}`)}
              </p>
            </div>
          )}
          {errors.password && (
            <p className="text-xs text-destructive">
              {t("onboarding.account.password.error")}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">
            {t("onboarding.account.confirmPassword.label")}
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder={t("onboarding.account.confirmPassword.placeholder")}
              aria-invalid={passwordsMismatch || undefined}
              className={cn(
                "pr-9",
                passwordsMismatch && "border-destructive focus-visible:ring-destructive/30",
                passwordsMatch && "border-green-500 focus-visible:ring-green-500/30",
              )}
              {...register("confirmPassword")}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              aria-label={t(
                showConfirmPassword
                  ? "onboarding.account.password.hide"
                  : "onboarding.account.password.show",
              )}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {passwordsMismatch ? (
            <p className="text-xs text-destructive" role="alert">
              {t("onboarding.account.confirmPassword.error")}
            </p>
          ) : passwordsMatch ? (
            <p className="text-xs text-green-600">
              {t("onboarding.account.confirmPassword.match")}
            </p>
          ) : errors.confirmPassword ? (
            <p className="text-xs text-destructive">
              {t("onboarding.account.confirmPassword.error")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <Controller
          control={form.control}
          name="termsAccepted"
          render={({ field }) => (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                id="termsAccepted"
                checked={!!field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                className="mt-0.5"
              />
              <span className="text-muted-foreground leading-5">
                <Trans
                  i18nKey="onboarding.account.terms.label"
                  ns="admin"
                  components={{
                    tos: (
                      <Link
                        to="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      />
                    ),
                  }}
                />
              </span>
            </label>
          )}
        />
        {errors.termsAccepted && (
          <p className="text-xs text-destructive">{t("onboarding.account.terms.error")}</p>
        )}

        <Controller
          control={form.control}
          name="privacyAccepted"
          render={({ field }) => (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                id="privacyAccepted"
                checked={!!field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
                className="mt-0.5"
              />
              <span className="text-muted-foreground leading-5">
                <Trans
                  i18nKey="onboarding.account.privacy.label"
                  ns="admin"
                  components={{
                    pp: (
                      <Link
                        to="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-foreground"
                      />
                    ),
                  }}
                />
              </span>
            </label>
          )}
        />
        {errors.privacyAccepted && (
          <p className="text-xs text-destructive">{t("onboarding.account.privacy.error")}</p>
        )}
      </div>
    </div>
  );
}
