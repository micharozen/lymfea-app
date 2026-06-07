import { useEffect } from 'react';
import type { PublicHotel } from './ClientVenueContext';

interface VenueThemeProviderProps {
  venue: Pick<
    PublicHotel,
    | 'id'
    | 'welcome_background_color'
    | 'button_color'
    | 'button_text_color'
    | 'font_title_url'
    | 'font_title_family'
    | 'font_body_url'
    | 'font_body_family'
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

function fontFaceRule(family: string, url: string): string {
  const f = escapeCssString(family);
  const u = escapeCssString(url);
  const format = inferFontFormat(url);
  return `@font-face { font-family: "${f}"; src: url("${u}") format("${format}"); font-display: swap; font-weight: 100 900; font-style: normal; }`;
}

export function buildVenueThemeCss(
  venue: VenueThemeProviderProps['venue'],
): string {
  const rules: string[] = [];
  const vars: string[] = [];

  if (venue.font_title_url && venue.font_title_family) {
    rules.push(fontFaceRule(venue.font_title_family, venue.font_title_url));
    vars.push(
      `--venue-font-title: "${escapeCssString(venue.font_title_family)}", 'Kormelink', serif`,
    );
  }
  if (venue.font_body_url && venue.font_body_family) {
    rules.push(fontFaceRule(venue.font_body_family, venue.font_body_url));
    vars.push(
      `--venue-font-body: "${escapeCssString(venue.font_body_family)}", 'Founders Grotesk', sans-serif`,
    );
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
    venue.font_title_url,
    venue.font_title_family,
    venue.font_body_url,
    venue.font_body_family,
  ]);

  return <>{children}</>;
}
