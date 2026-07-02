// Minimal mustache-style renderer for the ported email templates.
//
// The templates were authored in Resend and use `{{{key}}}` (and occasionally
// `{{key}}`) placeholders. We keep the HTML verbatim and fill it here with the
// variable objects already produced by `booking-email-vars.ts`
// (`buildConfirmedVars` / `buildPendingVars`), then strip any placeholder left
// unresolved so no raw `{{...}}` ever leaks into a delivered email.

export function renderTemplate(html: string, vars: Record<string, string>): string {
  let out = html;

  for (const [key, value] of Object.entries(vars)) {
    const safe = value ?? "";
    out = out.replaceAll(`{{{${key}}}}`, safe); // triple-brace (raw) — Resend default
    out = out.replaceAll(`{{${key}}}`, safe);   // double-brace fallback
  }

  // Remove any placeholder whose key was not provided in `vars`.
  out = out.replace(/\{\{\{[^{}]+\}\}\}/g, ""); // leftover triple-brace
  out = out.replace(/\{\{[^{}]+\}\}/g, "");     // leftover double-brace

  return out;
}
