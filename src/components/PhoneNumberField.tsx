import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";

export type CountryOption = { code: string; label: string; flag: string };

type PhoneNumberFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  countryCode: string;
  setCountryCode: (value: string) => void;
  countries: CountryOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
};

export function PhoneNumberField({
  id,
  value,
  onChange,
  countryCode,
  setCountryCode,
  countries,
  open,
  onOpenChange,
  placeholder,
}: PhoneNumberFieldProps) {
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center overflow-hidden rounded-md border border-input bg-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
      )}
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 rounded-none border-r border-input px-3 font-normal",
              "hover:bg-accent hover:text-accent-foreground",
            )}
            aria-expanded={open}
          >
            <span className="flex items-center gap-2">
              <span className="shrink-0">{countries.find((c) => c.code === countryCode)?.flag}</span>
              <span className="tabular-nums">{countryCode}</span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] p-0 border shadow-lg z-50 bg-popover"
        >
          <Command>
            <CommandInput placeholder="Search" />
            <CommandList className="max-h-[240px]">
              <CommandEmpty>Pays non trouvé</CommandEmpty>
              <CommandGroup>
                {countries.map((country) => (
                  <CommandItem
                    key={country.code}
                    value={`${country.label} ${country.code}`}
                    onSelect={() => {
                      setCountryCode(country.code);
                      onOpenChange(false);
                    }}
                    className="flex items-center"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        countryCode === country.code ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="mr-2 shrink-0">{country.flag}</span>
                    <span className="min-w-0 flex-1 truncate">{country.label}</span>
                    <span className="ml-3 shrink-0 tabular-nums text-muted-foreground">{country.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
