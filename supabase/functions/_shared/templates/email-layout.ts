// Shared design system for the "sable / clay" booking emails (Newsreader + DM
// Sans + IBM Plex Mono). Extracted from booking-confirmed.ts so the confirmed
// and pending templates render with the exact same layout primitives — framed
// "key info" card, hosted-PNG icon tiles, rounded cards, status pill, split
// button row, arrival note and footer.
//
// Email-safe where it matters (presentation tables, inline styles, 600px card)
// but intentionally keeps border-radius/box-shadow from the mockup — Outlook
// only partially honours the rounding, which is accepted.
import { EMAIL_ICON_BASE } from "../brand.ts";

export const FONT_SERIF = "'Newsreader',Georgia,'Times New Roman',serif";
export const FONT_SANS = "'DM Sans',-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
export const FONT_MONO = "'IBM Plex Mono',ui-monospace,monospace";

// Mockup palette
export const SAND_50 = "#FBF6EC"; // card / icon tile background
export const SAND_100 = "#F4EDE0"; // framed boxes
export const INK = "#2A2419";
export const INK_SOFT = "#6B5E4B";
export const INK_MUTE = "#8F8472";
export const CLAY = "#B05A35"; // accent / H1 <em>
export const CLAY_TINT = "#F6E3D7"; // total block
export const MOSS = "#5E6B43"; // "confirmed" status pill text + dot
export const MOSS_TINT = "#E6EBD8"; // "confirmed" status pill background
export const AMBER = "#9A6B2F"; // "pending / awaiting" status pill text + dot
export const AMBER_TINT = "#F6E9D5"; // "pending / awaiting" status pill background
export const LINE = "rgba(42,36,25,0.14)";
export const LINE_SOFT = "rgba(42,36,25,0.07)";

/** Copy fields consumed by the shared layout primitives. Template files extend
 * this with their own button / section copy. */
export interface EmailCopy {
  lang: "fr" | "en";
  preheader: string;
  /** Status pill text (e.g. "Soin confirmé" / "Demande reçue"). */
  pill: string;
  /** Pill text + dot colour (defaults set per template: MOSS / AMBER). */
  pillColor: string;
  /** Pill background colour (MOSS_TINT / AMBER_TINT). */
  pillTint: string;
  /** Whether the hero shows the separate greeting line (client emails only). */
  showGreeting: boolean;
  greetPrefix: string;
  /** Hero heading — short serif line, may contain a clay <em>. */
  heading: string;
  intro: string;
  labelWhen: string;
  labelWhere: string;
  totalLabel: string;
  arriveNote: string;
  footerContactLabel: string;
}

// ---------------------------------------------------------------------------
// Icons: hosted PNGs (Gmail strips inline SVG). Source files in
// docs/email-icons/, served from the "assets" bucket under email-icons/.
// ---------------------------------------------------------------------------

function iconImg(name: string): string {
  return `<img src="${EMAIL_ICON_BASE}/icon-${name}.png" width="18" height="18" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none"/>`;
}
export const ICON_CALENDAR = iconImg("calendar");
export const ICON_PIN = iconImg("pin");
export const ICON_INFO = iconImg("info");
export const ICON_PERSON = iconImg("person");
export const ICON_ROOM = iconImg("room");
export const ICON_PHONE = iconImg("phone");

/** Rounded square tile wrapping an 18px icon (used by every key-info row). */
export function iconTile(svg: string): string {
  return `<td width="52" style="width:52px;vertical-align:top;padding:0 14px 0 0"><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tbody><tr><td width="38" height="38" align="center" valign="middle" style="width:38px;height:38px;background-color:${SAND_50};border:1px solid ${LINE_SOFT};border-radius:10px;text-align:center;vertical-align:middle;line-height:38px;font-size:0">${svg}</td></tr></tbody></table></td>`;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/** Full-width dark (ink) primary button. */
export function primaryButton(href: string, label: string): string {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow" style="display:block;text-align:center;text-decoration:none;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:500;padding:15px 20px;border-radius:10px;background-color:${INK};color:#FFFFFF;border:1px solid ${INK}">${label}</a>`;
}

/** Ghost (outlined) button used in the split row. */
export function ghostButton(href: string, label: string): string {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow" style="display:block;text-align:center;text-decoration:none;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:500;padding:14px 16px;border-radius:10px;background-color:#FFFFFF;color:${INK};border:1px solid ${LINE}">${label}</a>`;
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

export function shell(copy: EmailCopy, body: string): string {
  return `<!DOCTYPE html><html lang="${copy.lang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/><meta name="x-apple-disable-message-reformatting"/><meta name="color-scheme" content="light"/><link href="https://fonts.googleapis.com/css2?family=Newsreader:ital@0;1&family=DM+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/></head><body style="margin:0;padding:0;background-color:${SAND_50}"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${copy.preheader}</div><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${SAND_50}"><tbody><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background-color:${SAND_50};border:1px solid ${LINE};border-radius:16px;overflow:hidden"><tbody>${body}</tbody></table></td></tr></tbody></table></body></html>`;
}

/** Header: logo + venue name + mono sub-line + status pill with dot. */
export function header(copy: EmailCopy): string {
  const dot = `<span style="display:inline-block;width:7px;height:7px;border-radius:100px;background-color:${copy.pillColor};margin-right:7px;vertical-align:middle"></span>`;
  return `<tr><td align="center" style="padding:40px 48px 0"><img src="{{{logo_url}}}" alt="{{{venue_name}}}" height="40" style="display:block;height:40px;max-height:40px;margin:0 auto"/><p style="margin:20px 0 0;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:${INK}">{{{venue_name}}}</p><p style="margin:16px 0 0"><span style="display:inline-block;background-color:${copy.pillTint};color:${copy.pillColor};font-family:${FONT_SANS};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:500;padding:7px 16px;border-radius:100px">${dot}${copy.pill}</span></p></td></tr>`;
}

/** Hero: separate greeting line (client only) + short serif heading + intro. */
export function hero(copy: EmailCopy): string {
  const greet = copy.showGreeting
    ? `<p style="margin:0 0 8px;font-family:${FONT_SANS};font-size:14px;color:${INK_SOFT}">${copy.greetPrefix} {{{client_name}}},</p>`
    : "";
  return `<tr><td align="center" style="padding:28px 48px 0">${greet}<h1 style="margin:0;font-family:${FONT_SERIF};font-size:28px;font-weight:400;line-height:1.25;color:${INK}">${copy.heading}</h1><p style="margin:14px auto 0;max-width:400px;font-family:${FONT_SANS};font-size:14px;line-height:1.7;color:${INK_SOFT}">${copy.intro}</p></td></tr>`;
}

/** A single key-info row (icon tile + label/value/subline). Reused by fragments. */
export function keyRow(
  svg: string,
  label: string,
  value: string,
  sub: string,
  ref: string,
): string {
  const subHtml = sub
    ? `<p style="margin:4px 0 0;font-family:${FONT_SANS};font-size:12px;line-height:1.5;color:${INK_MUTE}">${sub}</p>`
    : "";
  const refHtml = ref
    ? `<td align="right" style="vertical-align:top;padding-left:10px"><span style="font-family:${FONT_MONO};font-size:11px;color:${INK_MUTE};white-space:nowrap">${ref}</span></td>`
    : "";
  return `<tr>${iconTile(svg)}<td style="vertical-align:top"><p style="margin:0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${INK_MUTE}">${label}</p><p style="margin:4px 0 0;font-family:${FONT_SERIF};font-size:17px;line-height:1.3;color:${INK}">${value}</p>${subHtml}</td>${refHtml}</tr>`;
}

/** Spacer row between key-info rows inside the framed box. */
export function keyGap(): string {
  return `<tr><td colspan="3" style="height:18px;line-height:18px;font-size:0">&nbsp;</td></tr>`;
}

/** Framed "key info" card: When / Where / therapist row. */
export function detailsBox(copy: EmailCopy, therapistRow: string): string {
  const whenRow = keyRow(
    ICON_CALENDAR,
    copy.labelWhen,
    "{{{booking_date}}}",
    "{{{booking_time}}}{{{total_duration_sep}}}",
    "#{{{booking_number}}}",
  );
  const whereRow = keyRow(
    ICON_PIN,
    copy.labelWhere,
    "{{{venue_name}}}",
    "{{{venue_address}}}",
    "",
  );
  return `<tr><td style="padding:28px 48px 0"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${SAND_100};border:1px solid ${LINE_SOFT};border-radius:14px"><tbody><tr><td style="padding:22px 22px"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tbody>${whenRow}${keyGap()}${whereRow}${therapistRow}</tbody></table></td></tr></tbody></table></td></tr>`;
}

/** Treatments section (line per treatment) + clay-tint total block. */
export function treatmentsSection(copy: EmailCopy): string {
  return `<tr><td style="padding:28px 48px 0"><p style="margin:0 0 10px;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${INK_MUTE}">{{{section_title}}}</p><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tbody>{{{treatments_html}}}</tbody></table><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-top:16px;background-color:${CLAY_TINT};border-radius:12px"><tbody><tr><td style="padding:16px 20px;font-family:${FONT_MONO};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${CLAY}">${copy.totalLabel}</td><td align="right" style="padding:16px 20px;font-family:${FONT_SERIF};font-size:24px;color:${INK}">{{{total_price}}}</td></tr></tbody></table></td></tr>`;
}

/** Arrival note: framed sand-100 encart with a gold info icon. */
export function arrivalNote(copy: EmailCopy): string {
  return `<tr><td style="padding:24px 48px 0"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:${SAND_100};border:1px solid ${LINE_SOFT};border-radius:12px"><tbody><tr><td width="40" style="width:40px;vertical-align:top;padding:16px 0 16px 18px">${ICON_INFO}</td><td style="padding:16px 18px 16px 12px;font-family:${FONT_SANS};font-size:13px;line-height:1.6;color:${INK_SOFT}">${copy.arriveNote}</td></tr></tbody></table></td></tr>`;
}

/** Footer (centered): top border, mono address, contact line, website. */
export function footer(copy: EmailCopy): string {
  return `<tr><td align="center" style="padding:32px 48px 40px;text-align:center"><div style="border-top:1px solid ${LINE};padding-top:24px"><p style="margin:0 0 6px;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:${INK}">{{{venue_name}}}</p><p style="margin:0;font-family:${FONT_MONO};font-size:10px;letter-spacing:0.14em;line-height:1.8;text-transform:uppercase;color:${INK_MUTE}">{{{venue_address}}}</p><p style="margin:14px 0 0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${INK_MUTE}">${copy.footerContactLabel} <a href="mailto:{{{contact_email}}}" style="color:${CLAY};text-decoration:underline">{{{contact_email}}}</a></p>{{{footer_website_html}}}</div></td></tr>`;
}
