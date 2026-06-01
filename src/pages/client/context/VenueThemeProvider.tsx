import { useEffect } from 'react';
import type { PublicHotel } from './ClientVenueContext';

interface VenueThemeProviderProps {
  venue: Pick<
    PublicHotel,
    | 'id'
    | 'welcome_background_color'
    | 'button_color'
    | 'button_text_color'
    | 'custom_font_url'
    | 'custom_font_family'
  >;
  children: React.ReactNode;
}

function inferFontFormat(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.woff2')) return 'woff2';
  if (lower.endsWith('.woff')) return 'woff';
  if (lower.endsWith('.ttf')) return 'truetype';
  if (lower.endsWith('.otf')) return 'opentype';
  return 'woff2';
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildVenueThemeCss(
  venue: VenueThemeProviderProps['venue'],
): string {
  const rules: string[] = [];
  const vars: string[] = [];

  if (venue.custom_font_url && venue.custom_font_family) {
    const family = escapeCssString(venue.custom_font_family);
    const url = escapeCssString(venue.custom_font_url);
    const format = inferFontFormat(venue.custom_font_url);
    rules.push(
      `@font-face { font-family: "${family}"; src: url("${url}") format("${format}"); font-display: swap; font-weight: 100 900; font-style: normal; }`,
    );
    vars.push(`--venue-font: "${family}", 'Founders Grotesk', sans-serif`);
  }

  if (venue.welcome_background_color) {
    vars.push(`--venue-bg: ${venue.welcome_background_color}`);
  }
  if (venue.button_color) {
    vars.push(`--venue-button-bg: ${venue.button_color}`);
  }
  if (venue.button_text_color) {
    vars.push(`--venue-button-text: ${venue.button_text_color}`);
  }

  if (vars.length > 0) {
    rules.push(`.lymfea-client { ${vars.join('; ')}; }`);
  }

  return rules.join('\n');
}

export function VenueThemeProvider({ venue, children }: VenueThemeProviderProps) {
  useEffect(() => {
    const css = buildVenueThemeCss(venue);
    if (!css) return;

    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-venue-theme', venue.id);
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    return () => {
      styleEl.remove();
    };
  }, [
    venue.id,
    venue.welcome_background_color,
    venue.button_color,
    venue.button_text_color,
    venue.custom_font_url,
    venue.custom_font_family,
  ]);

  return <>{children}</>;
}
