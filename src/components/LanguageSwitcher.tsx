import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';

interface LanguageSwitcherProps {
  variant?: 'default' | 'minimal' | 'flag' | 'pill' | 'client' | 'list';
  className?: string;
  onSelect?: () => void;
  persistToProfile?: boolean;
}

const languages = [
  { code: 'fr', label: 'Français', shortLabel: 'FR', flag: '🇫🇷' },
  { code: 'en', label: 'English', shortLabel: 'EN', flag: '🇬🇧' },
];

export const LanguageSwitcher = ({ variant = 'default', className = '', onSelect, persistToProfile = false }: LanguageSwitcherProps) => {
  const { i18n } = useTranslation();
  const { saveLanguage } = useLanguagePreference();

  const currentLang = languages.find(l => l.code === i18n.language) || languages[0];

  const changeLanguage = (langCode: string) => {
    if (persistToProfile) {
      saveLanguage(langCode);
    } else {
      i18n.changeLanguage(langCode);
    }
    onSelect?.();
  };

  // List style for dialogs - shows all languages as buttons
  if (variant === 'list') {
    return (
      <div className={`space-y-2 ${className}`}>
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
              i18n.language === lang.code
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border hover:bg-muted'
            }`}
          >
            <Globe className="h-5 w-5" />
            <span className="font-medium">{lang.label}</span>
            {i18n.language === lang.code && (
              <span className="ml-auto text-primary">✓</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  // Mobile-friendly pill style (dark background)
  if (variant === 'pill') {
    return (
      <div className={`flex items-center gap-0.5 bg-white/20 backdrop-blur-sm rounded-full p-1 ${className}`}>
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
              i18n.language === lang.code
                ? 'bg-white text-black shadow-sm'
                : 'text-white/90 hover:text-white hover:bg-white/10'
            }`}
          >
            {lang.shortLabel}
          </button>
        ))}
      </div>
    );
  }

  // Luxury minimalist text style for client pages
  if (variant === 'client') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {languages.map((lang, index) => (
          <div key={lang.code} className="flex items-center">
            <button
              onClick={() => changeLanguage(lang.code)}
              className={`text-xs tracking-[0.2em] transition-all duration-300 ${
                i18n.language === lang.code
                  ? 'text-gold-400 font-medium scale-105'
                  : 'text-white/40 hover:text-white/80 font-light'
              }`}
            >
              {lang.shortLabel}
            </button>
            {index < languages.length - 1 && (
              <span className="text-white/20 text-[10px] ml-3 font-light select-none">|</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'flag') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={`text-lg px-2 ${className}`}>
            {currentLang.flag}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-background border shadow-lg z-50">
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => changeLanguage(lang.code)}
              className={i18n.language === lang.code ? 'bg-accent' : ''}
            >
              <span className="mr-2">{lang.flag}</span>
              {lang.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (variant === 'minimal') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {languages.map((lang, index) => (
          <span key={lang.code} className="flex items-center">
            <button
              onClick={() => changeLanguage(lang.code)}
              className={`text-sm px-1 py-0.5 rounded transition-colors ${
                i18n.language === lang.code
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {lang.code.toUpperCase()}
            </button>
            {index < languages.length - 1 && (
              <span className="text-muted-foreground mx-1">|</span>
            )}
          </span>
        ))}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Globe className="h-4 w-4 mr-2" />
          {currentLang.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-background border shadow-lg z-50">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className={i18n.language === lang.code ? 'bg-accent' : ''}
          >
            <span className="mr-2">{lang.flag}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
