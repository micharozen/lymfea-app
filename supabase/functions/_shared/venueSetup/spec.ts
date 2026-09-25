/**
 * Venue setup wizard — shared field spec (edge function + frontend via @shared).
 *
 * The public wizard (/setup/:token) stores answers as JSON in
 * venue_setup_submissions.data. Keys mirror table/column names so the import
 * RPC (import_venue_setup_submission) can map them 1:1.
 *
 * No runtime dependency on purpose: this file is bundled by Vite and served by
 * Deno. The server uses sanitizeStep() as the whitelist; the frontend adds
 * stricter UX validation (required fields, cross-field rules) on top.
 */

export type FieldSpec =
  | { t: "text"; max?: number }
  | { t: "email" }
  | { t: "color" }
  | { t: "int"; min?: number; max?: number }
  | { t: "num"; min?: number; max?: number }
  | { t: "bool" }
  | { t: "time" }
  | { t: "date" }
  | { t: "enum"; values: readonly string[] }
  | { t: "list"; of: FieldSpec; max: number }
  | { t: "object"; fields: Record<string, FieldSpec> };

type SectionSpec =
  | { kind: "object"; nullable?: boolean; fields: Record<string, FieldSpec> }
  | { kind: "list"; max: number; fields: Record<string, FieldSpec> }
  | { kind: "text"; max: number };

const text = (max = 500): FieldSpec => ({ t: "text", max });
const longText = text(5000);
const int = (min?: number, max?: number): FieldSpec => ({ t: "int", min, max });
const num = (min?: number, max?: number): FieldSpec => ({ t: "num", min, max });
const bool: FieldSpec = { t: "bool" };
const email: FieldSpec = { t: "email" };
const time: FieldSpec = { t: "time" };
const date: FieldSpec = { t: "date" };
const color: FieldSpec = { t: "color" };
const enumOf = (values: readonly string[]): FieldSpec => ({ t: "enum", values });

export const VENUE_TYPES = ["hotel", "spa"] as const;
export const SCHEDULE_TYPES = ["always_open", "specific_days", "one_time"] as const;
export const CLIENT_PAYMENT_MODES = ["pre_authorization", "pay_at_booking"] as const;
export const INVOICE_CLIENTS = ["organization", "venue"] as const;
export const PMS_TYPES = ["opera_cloud", "mews", "other", "none"] as const;
export const PAYMENT_PROVIDERS = ["stripe", "adyen", "none"] as const;
export const AMENITY_TYPES = ["pool", "fitness", "sauna", "hammam", "jacuzzi"] as const;
export const VENUE_ROLES = [
  "direction_hotel",
  "reception",
  "conciergerie",
  "assistance_direction",
] as const;
export const ROOM_CAPABILITY_VALUES = [
  "Massage",
  "Facial",
  "Hammam",
  "Jacuzzi",
  "Sauna",
  "Body Wrap",
  "Multi-purpose",
] as const;

export const SECTIONS = {
  organization: {
    kind: "object",
    fields: {
      commercial_name: text(200),
      legal_name: text(200),
      legal_form: text(100),
      legal_capital: text(100),
      siren: text(20),
      siret: text(20),
      rcs: text(200),
      vat_number: text(30),
      legal_address: text(300),
      legal_postal_code: text(20),
      legal_city: text(100),
      legal_country: text(100),
      contact_email: email,
      logo_path: text(300),
    },
  },
  organization_billing_profile: {
    kind: "object",
    fields: {
      billing_address: text(300),
      billing_postal_code: text(20),
      billing_city: text(100),
      billing_country: text(100),
      contact_email: email,
      contact_phone: text(40),
    },
  },
  hotel: {
    kind: "object",
    fields: {
      name: text(200),
      name_en: text(200),
      venue_type: enumOf(VENUE_TYPES),
      landing_subtitle: text(300),
      landing_subtitle_en: text(300),
      description: longText,
      description_en: longText,
      website_url: text(300),
      contact_email: email,
      address: text(300),
      postal_code: text(20),
      city: text(100),
      country: text(100),
      timezone: text(60),
      access_instructions: longText,
      access_instructions_en: longText,
      opening_time: time,
      closing_time: time,
      min_booking_notice_minutes: int(0, 10080),
      auto_validate_bookings: bool,
      client_payment_mode: enumOf(CLIENT_PAYMENT_MODES),
      allow_out_of_hours_booking: bool,
      out_of_hours_surcharge_percent: num(0, 100),
      room_turnover_buffer_minutes: int(0, 120),
      slot_interval: int(5, 120),
      client_cancellation_cutoff_hours: int(0, 168),
      client_reschedule_cutoff_hours: int(0, 168),
      cancellation_tiers: {
        t: "list",
        max: 10,
        of: {
          t: "object",
          fields: {
            max_hours: int(0, 8760),
            min_hours: int(0, 8760),
            refund_percent: int(0, 100),
          },
        },
      },
      cancellation_policy_text_fr: longText,
      cancellation_policy_text_en: longText,
      currency: text(3),
      vat: num(0, 100),
      hotel_commission: num(0, 100),
      therapist_commission: num(0, 100),
      invoice_client: enumOf(INVOICE_CLIENTS),
      pms_type: enumOf(PMS_TYPES),
      pms_auto_charge_room: bool,
      pms_guest_lookup_enabled: bool,
      image_path: text(300),
      cover_image_path: text(300),
    },
  },
  venue_billing_profile: {
    kind: "object",
    nullable: true,
    fields: {
      company_name: text(200),
      siret: text(20),
      tva_number: text(30),
      billing_address: text(300),
      billing_postal_code: text(20),
      billing_city: text(100),
      billing_country: text(100),
      contact_email: email,
    },
  },
  venue_deployment_schedule: {
    kind: "object",
    fields: {
      schedule_type: enumOf(SCHEDULE_TYPES),
      days_of_week: { t: "list", max: 7, of: int(0, 6) },
      recurring_start_date: date,
      recurring_end_date: date,
      specific_dates: { t: "list", max: 366, of: date },
    },
  },
  venue_blocked_slots: {
    kind: "list",
    max: 50,
    fields: {
      label: text(200),
      start_time: time,
      end_time: time,
      days_of_week: { t: "list", max: 7, of: int(0, 6) },
      block_date: date,
    },
  },
  treatment_rooms: {
    kind: "list",
    max: 50,
    fields: {
      name: text(100),
      capabilities: { t: "list", max: 10, of: enumOf(ROOM_CAPABILITY_VALUES) },
      capacity: int(1, 10),
    },
  },
  venue_amenities: {
    kind: "list",
    max: AMENITY_TYPES.length,
    fields: {
      type: enumOf(AMENITY_TYPES),
      capacity_per_slot: int(1, 200),
      slot_duration: int(15, 480),
      is_exclusive: bool,
      prep_time: int(0, 240),
      price_external: num(0, 10000),
      lymfea_access_included: bool,
      lymfea_access_duration: int(0, 480),
      opening_time: time,
      closing_time: time,
    },
  },
  venue_branding: {
    kind: "object",
    fields: {
      button_color: color,
      button_text_color: color,
      welcome_background_color: color,
      font_title_family: text(100),
      font_title_path: text(300),
      font_body_family: text(100),
      font_body_path: text(300),
    },
  },
  concierges: {
    kind: "list",
    max: 30,
    fields: {
      first_name: text(100),
      last_name: text(100),
      email,
      phone: text(40),
      country_code: text(8),
      venue_role: enumOf(VENUE_ROLES),
    },
  },
  payment: {
    kind: "object",
    fields: {
      provider: enumOf(PAYMENT_PROVIDERS),
      has_account: bool,
      account_owner_email: email,
      contact: text(300),
    },
  },
  pms_contact: {
    kind: "object",
    fields: {
      name: text(200),
      email,
      phone: text(40),
    },
  },
  notes: { kind: "text", max: 5000 },
} as const satisfies Record<string, SectionSpec>;

export type SectionName = keyof typeof SECTIONS;

/** Wizard steps and the sections each one may write. */
export const STEPS = {
  company: ["organization", "organization_billing_profile"],
  venue: ["hotel"],
  hours: ["hotel", "venue_deployment_schedule", "venue_blocked_slots"],
  rooms: ["treatment_rooms"],
  amenities: ["venue_amenities"],
  booking: ["hotel"],
  finance: ["hotel", "venue_billing_profile"],
  payment: ["payment"],
  pms: ["hotel", "pms_contact"],
  team: ["concierges"],
  branding: ["hotel", "venue_branding", "notes"],
} as const satisfies Record<string, readonly SectionName[]>;

export type StepId = keyof typeof STEPS;
export const STEP_IDS = Object.keys(STEPS) as StepId[];

/** Upload kinds accepted by createUploadUrl, with their MIME whitelist. */
// No SVG: files end up in public buckets and SVG can carry scripts.
export const UPLOAD_KINDS = {
  org_logo: ["image/png", "image/jpeg", "image/webp"],
  venue_logo: ["image/png", "image/jpeg", "image/webp"],
  cover: ["image/png", "image/jpeg", "image/webp"],
  font: ["font/woff2", "font/woff", "font/ttf", "font/otf", "application/octet-stream"],
} as const;
export type UploadKind = keyof typeof UPLOAD_KINDS;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const MAX_DATA_BYTES = 200 * 1024;

// ─── Sanitizer ─────────────────────────────────────────────────────────────

type Result = { ok: true; value: unknown } | { ok: false; error: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeField(spec: FieldSpec, raw: unknown, path: string): Result {
  // Empty values are always accepted: the wizard saves partial answers and
  // required fields are enforced at import time.
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };

  switch (spec.t) {
    case "text": {
      if (typeof raw !== "string") return { ok: false, error: `${path}: expected text` };
      const v = raw.trim();
      if (spec.max && v.length > spec.max) return { ok: false, error: `${path}: too long` };
      return { ok: true, value: v || null };
    }
    case "email": {
      if (typeof raw !== "string" || !EMAIL_RE.test(raw.trim())) {
        return { ok: false, error: `${path}: invalid email` };
      }
      return { ok: true, value: raw.trim().toLowerCase() };
    }
    case "color": {
      if (typeof raw !== "string" || !COLOR_RE.test(raw)) return { ok: false, error: `${path}: invalid color` };
      return { ok: true, value: raw.toUpperCase() };
    }
    case "time": {
      if (typeof raw !== "string" || !TIME_RE.test(raw)) return { ok: false, error: `${path}: invalid time` };
      return { ok: true, value: raw.slice(0, 5) };
    }
    case "date": {
      // Regex + round-trip: rejects calendar-invalid dates (2026-02-30) that
      // would only fail at import time in the RPC cast.
      if (typeof raw !== "string" || !DATE_RE.test(raw)) return { ok: false, error: `${path}: invalid date` };
      const d = new Date(`${raw}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
        return { ok: false, error: `${path}: invalid date` };
      }
      return { ok: true, value: raw };
    }
    case "bool": {
      if (typeof raw !== "boolean") return { ok: false, error: `${path}: expected boolean` };
      return { ok: true, value: raw };
    }
    case "int":
    case "num": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: `${path}: expected number` };
      if (spec.t === "int" && !Number.isInteger(n)) return { ok: false, error: `${path}: expected integer` };
      if (spec.min !== undefined && n < spec.min) return { ok: false, error: `${path}: below ${spec.min}` };
      if (spec.max !== undefined && n > spec.max) return { ok: false, error: `${path}: above ${spec.max}` };
      return { ok: true, value: n };
    }
    case "enum": {
      if (typeof raw !== "string" || !spec.values.includes(raw)) {
        return { ok: false, error: `${path}: invalid value` };
      }
      return { ok: true, value: raw };
    }
    case "list": {
      if (!Array.isArray(raw)) return { ok: false, error: `${path}: expected list` };
      if (raw.length > spec.max) return { ok: false, error: `${path}: too many items` };
      const out: unknown[] = [];
      for (let i = 0; i < raw.length; i++) {
        const r = sanitizeField(spec.of, raw[i], `${path}[${i}]`);
        if (!r.ok) return r;
        if (r.value !== null) out.push(r.value);
      }
      return { ok: true, value: out };
    }
    case "object":
      return sanitizeObject(spec.fields, raw, path);
  }
}

function sanitizeObject(fields: Record<string, FieldSpec>, raw: unknown, path: string): Result {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: `${path}: expected object` };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const spec = fields[key];
    if (!spec) return { ok: false, error: `${path}.${key}: unknown field` };
    const r = sanitizeField(spec, value, `${path}.${key}`);
    if (!r.ok) return r;
    out[key] = r.value;
  }
  return { ok: true, value: out };
}

function sanitizeSection(name: SectionName, raw: unknown): Result {
  const spec: SectionSpec = SECTIONS[name];
  if (spec.kind === "text") return sanitizeField({ t: "text", max: spec.max }, raw, name);
  if (spec.kind === "list") {
    if (!Array.isArray(raw)) return { ok: false, error: `${name}: expected list` };
    if (raw.length > spec.max) return { ok: false, error: `${name}: too many items` };
    const out: unknown[] = [];
    for (let i = 0; i < raw.length; i++) {
      const r = sanitizeObject(spec.fields, raw[i], `${name}[${i}]`);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return { ok: true, value: out };
  }
  if (raw === null && spec.nullable) return { ok: true, value: null };
  return sanitizeObject(spec.fields, raw, name);
}

export type SetupData = Partial<Record<SectionName, unknown>> & {
  _completed_steps?: StepId[];
};

/**
 * Validates a step payload against the whitelist and merges it into the
 * current data. Object sections are merged shallowly (several steps write
 * different keys of `hotel`); list and text sections are replaced.
 */
export function applyStep(
  current: SetupData,
  step: string,
  sections: unknown,
): { ok: true; data: SetupData } | { ok: false; error: string } {
  if (!(step in STEPS)) return { ok: false, error: "unknown step" };
  const allowed = STEPS[step as StepId] as readonly SectionName[];
  if (typeof sections !== "object" || sections === null || Array.isArray(sections)) {
    return { ok: false, error: "sections: expected object" };
  }

  const next: SetupData = { ...current };
  for (const [name, raw] of Object.entries(sections as Record<string, unknown>)) {
    if (!allowed.includes(name as SectionName)) {
      return { ok: false, error: `${name}: not allowed for step ${step}` };
    }
    const r = sanitizeSection(name as SectionName, raw);
    if (r.ok === false) return { ok: false, error: r.error };
    const spec: SectionSpec = SECTIONS[name as SectionName];
    const prev = current[name as SectionName];
    next[name as SectionName] =
      spec.kind === "object" && r.value !== null && prev && typeof prev === "object"
        ? { ...(prev as Record<string, unknown>), ...(r.value as Record<string, unknown>) }
        : r.value;
  }

  const done = new Set(current._completed_steps ?? []);
  done.add(step as StepId);
  next._completed_steps = STEP_IDS.filter((s) => done.has(s));
  return { ok: true, data: next };
}

/** Uploaded file paths referenced by the answers (logos, cover, fonts). */
export function collectFilePaths(data: SetupData): string[] {
  const pick = (section: unknown, keys: string[]) =>
    keys
      .map((k) => (section as Record<string, unknown> | null | undefined)?.[k])
      .filter((p): p is string => typeof p === "string" && p.length > 0);
  return [
    ...pick(data.organization, ["logo_path"]),
    ...pick(data.hotel, ["image_path", "cover_image_path"]),
    ...pick(data.venue_branding, ["font_title_path", "font_body_path"]),
  ];
}

/** A path is only valid inside its own submission folder (`<submission_id>/…`). */
export function isOwnFilePath(path: string, submissionId: string): boolean {
  return path.startsWith(`${submissionId}/`) && !path.includes("..") && path.split("/").length === 2;
}
