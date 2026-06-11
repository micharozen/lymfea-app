import type { EmailInquiry } from "@/hooks/inbox/useEmailInquiries";
import type { BookingModalInitialValues } from "@/components/booking/BookingModal";

export interface AutoConvertHotel {
  id: string;
  name: string | null;
  slot_interval: number | null;
  opening_time: string | null;
  closing_time: string | null;
}

export interface AutoConvertTreatment {
  id: string;
  name: string | null;
  duration: number | null;
  price: number | null;
  price_on_request: boolean | null;
}

export interface AutoConvertVariant {
  id: string;
  duration: number | null;
  price: number | null;
  guest_count: number | null;
}

export function canAutoConvert(inquiry: EmailInquiry): boolean {
  const p = inquiry.parsed_data;
  if (!inquiry.hotel_id || !p) return false;
  return Boolean(
    p.treatment_match?.id &&
    p.variant_match?.id &&
    p.requested_date &&
    p.requested_time &&
    (p.intent_confidence ?? 0) >= 0.8,
  );
}

// Parse "+33 6 12 34 56 78" or "06 12 34 56 78" into { countryCode, phone }.
export function splitPhone(raw: string | null | undefined, defaultCountry = "+33"): { countryCode: string; phone: string } {
  if (!raw) return { countryCode: defaultCountry, phone: "" };
  const trimmed = raw.trim();
  const m = trimmed.match(/^\+(\d{1,3})\s*(.*)$/);
  if (m) return { countryCode: `+${m[1]}`, phone: m[2].trim() };
  return { countryCode: defaultCountry, phone: trimmed };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function bodyAsClientNote(inquiry: EmailInquiry): string {
  if (inquiry.raw_body_text?.trim()) return inquiry.raw_body_text.trim();
  if (inquiry.raw_body_html) return stripHtml(inquiry.raw_body_html);
  return inquiry.parsed_data?.notes ?? "";
}

export function isOutOfHours(time: string, hotel: AutoConvertHotel | null): boolean {
  if (!hotel?.opening_time || !hotel?.closing_time) return false;
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const t = toMin(time);
  return t < toMin(hotel.opening_time) || t >= toMin(hotel.closing_time);
}

// Build the BookingModal initialValues for the "review and convert" path.
export function buildInitialValues(inquiry: EmailInquiry): BookingModalInitialValues {
  const p = inquiry.parsed_data ?? {};
  const { countryCode, phone } = splitPhone(p.phone);
  const date = p.requested_date ? new Date(p.requested_date) : undefined;
  return {
    hotelId: inquiry.hotel_id ?? undefined,
    treatmentId: p.treatment_match?.id ?? undefined,
    variantId: p.variant_match?.id ?? undefined,
    clientFirstName: p.client_first_name ?? undefined,
    clientLastName: p.client_last_name ?? undefined,
    clientEmail: p.email ?? inquiry.from_address ?? undefined,
    phone,
    countryCode,
    date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    time: p.requested_time ?? undefined,
    guestCount: p.guest_count ?? undefined,
    clientNote: bodyAsClientNote(inquiry),
  };
}
