import { Control, FieldPath, FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useOrganizationsList } from "@/hooks/useOrganizationsList";
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
import { Loader2, Network } from "lucide-react";

interface OrganizationSelectFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  disabled?: boolean;
}

export function OrganizationSelectField<T extends FieldValues>({
  control,
  name,
  disabled = false,
}: OrganizationSelectFieldProps<T>) {
  const { t } = useTranslation("admin");
  const { data: orgs = [], isLoading: loading } = useOrganizationsList();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center gap-1.5">
            <Network className="h-3.5 w-3.5 text-muted-foreground" />
            {t("venue.organization.label")}
          </FormLabel>
          <Select
            value={field.value || ""}
            onValueChange={field.onChange}
            disabled={disabled || loading}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loading
                      ? t("venue.organization.loading", "Chargement…")
                      : t("venue.organization.placeholder")
                  }
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {loading && (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("venue.organization.loading", "Chargement…")}
                </div>
              )}
              {!loading && orgs.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground px-2">
                  {t("venue.organization.empty", "Aucune organisation disponible")}
                </div>
              )}
              {orgs.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
