import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export type CountryOption = { code: string; label: string; flag: string };

type PhoneNumberFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  countryCode: string;
  setCountryCode: (value: string) => void;
  countries: CountryOption[];
  placeholder?: string;
};

export function PhoneNumberField({
  id,
  value,
  onChange,
  countryCode,
  setCountryCode,
  countries,
  placeholder,
}: PhoneNumberFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCountries = countries.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.code.includes(search)
  );

  return (
    <div
      className={cn(
        "flex h-9 w-full items-center overflow-hidden rounded-md border border-input bg-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-full rounded-none border-r border-input px-2 font-normal text-sm",
              "hover:bg-muted hover:text-foreground",
            )}
            aria-expanded={open}
          >
            <span className="tabular-nums">{countryCode}</span>
            <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-56 p-0 border shadow-lg z-50 bg-popover pointer-events-auto"
          onWheelCapture={(e) => e.stopPropagation()}
          onTouchMoveCapture={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b">
            <Input
              placeholder="Rechercher"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <ScrollArea className="h-40 touch-pan-y">
            <div className="pointer-events-auto">
              {filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => {
                    setCountryCode(country.code);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-sm",
                    countryCode === country.code && "bg-muted"
                  )}
                >
                  <span className="w-6 shrink-0 text-xs text-muted-foreground uppercase">
                    {country.flag}
                  </span>
                  <span className="flex-1 text-left">{country.label}</span>
                  <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                    {country.code}
                  </span>
                </button>
              ))}
              {filteredCountries.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Aucun résultat
                </div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
      />
    </div>
  );
}
