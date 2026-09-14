import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { phoneCountries, toFlagEmoji } from '@/lib/phoneCountries';
import { cn } from '@/lib/utils';

interface ClientPhoneFieldProps {
  /** Indicatif international sélectionné, ex. "+33". */
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  /** Numéro local, sans indicatif. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Champ téléphone du parcours client : indicatif recherchable avec drapeau,
 * même présentation que l'étape « vos coordonnées ».
 */
export function ClientPhoneField({
  countryCode,
  onCountryCodeChange,
  value,
  onChange,
  className,
}: ClientPhoneFieldProps) {
  const { t } = useTranslation('client');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedCountry = phoneCountries.find((c) => c.code === countryCode);
  const filteredCountries = phoneCountries.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.code.includes(search),
  );

  return (
    <div
      className={cn(
        'flex h-12 w-full items-center overflow-hidden rounded-xl border border-gray-200 bg-white',
        'focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-400/20',
        className,
      )}
    >
      {/* `modal` : le panneau est portalisé hors de tout focus-trap parent,
          sans quoi la recherche perdrait le focus à chaque frappe. */}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-full rounded-none border-r border-gray-200 px-3 font-normal text-sm text-gray-900 hover:bg-gray-100 hover:text-gray-900 gap-1"
            aria-expanded={open}
          >
            <span>{toFlagEmoji(selectedCountry?.flag ?? 'FR')}</span>
            <span className="tabular-nums">{countryCode}</span>
            <ChevronDown className="ml-0.5 h-3 w-3 shrink-0 text-gray-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[calc(100vw-2rem)] sm:w-64 p-0 border border-gray-200 shadow-lg z-50 bg-white"
        >
          <div className="p-2 border-b border-gray-200">
            <Input
              placeholder={t('portal.claimCountrySearch')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
            />
          </div>
          <ScrollArea className="h-48 sm:h-40">
            {filteredCountries.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => {
                  onCountryCodeChange(country.code);
                  onChange('');
                  setOpen(false);
                  setSearch('');
                }}
                className={cn(
                  'flex w-full items-center px-3 py-2 text-sm text-gray-900 hover:bg-gray-100',
                  countryCode === country.code && 'bg-gray-100 font-medium',
                )}
              >
                <span className="w-8 shrink-0 text-base">{toFlagEmoji(country.flag)}</span>
                <span className="flex-1 text-left">{country.label}</span>
                <span className="ml-2 shrink-0 tabular-nums text-gray-400">{country.code}</span>
              </button>
            ))}
            {filteredCountries.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">
                {t('portal.claimCountryNoResult')}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Input
        type="tel"
        autoComplete="tel"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, ''))}
        placeholder={selectedCountry?.placeholder ?? '6 12 34 56 78'}
        className="h-full flex-1 border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
      />
    </div>
  );
}
