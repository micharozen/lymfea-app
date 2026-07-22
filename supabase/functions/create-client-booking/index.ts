import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { isInBlockedSlot } from '../_shared/blocked-slots.ts';
import { computeOutOfHoursSurcharge } from '../_shared/surcharge.ts';
import { createLogger } from '../_shared/logger.ts';
import { resolveVerifiedPmsGuest } from '../_shared/pms-verify.ts';
import { tryMarkCheckoutIntentConverted } from '../_shared/checkoutIntent.ts';
import {
  computeSlotDuration,
  fetchAddonTreatmentIds,
  insertBookingTreatmentLines,
} from '../_shared/bookingTreatmentLines.ts';
import { runInBackground } from '../_shared/backgroundTask.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schemas
const clientDataSchema = z.object({
  firstName: z.string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s\-']+$/, 'First name contains invalid characters'),
  lastName: z.string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be less than 100 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s\-']+$/, 'Last name contains invalid characters'),
  email: z.string()
    .email('Invalid email format')
    .max(255, 'Email must be less than 255 characters')
    .optional()
    .or(z.literal('')),
  // Phone is optional: PMS-verified hotel guests don't enter it (resolved
  // server-side from the PMS). Non-verified flows require it client-side and the
  // value is still validated below.
  phone: z.string()
    .max(20, 'Phone number is too long')
    .regex(/^[\d\s\+\-\(\)]*$/, 'Phone number contains invalid characters')
    .optional()
    .or(z.literal('')),
  roomNumber: z.string()
    .max(20, 'Room number must be less than 20 characters')
    .optional()
    .or(z.literal('')),
  note: z.string()
    .max(500, 'Note must be less than 500 characters')
    .optional()
    .or(z.literal('')),
  // Set by the client flow when the visitor declared they are a hotel guest and
  // passed the PMS verify step. The server RE-verifies before trusting it.
  pmsVerified: z.boolean().optional(),
  pmsGuestCheckIn: z.string().max(40).optional().or(z.literal('')).nullable(),
  pmsGuestCheckOut: z.string().max(40).optional().or(z.literal('')).nullable(),
});

const bookingDataSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD)'),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time format (expected HH:MM)'),
});

const treatmentSchema = z.object({
  treatmentId: z.string().uuid('Invalid treatment ID format'),
  quantity: z.number().int().min(1).max(10, 'Quantity must be between 1 and 10'),
  variantId: z.string().uuid('Invalid variant ID format').optional(),
  /** For an add-on: the treatmentId of the soin it extends (its leg). */
  parentTreatmentId: z.string().uuid('Invalid parent treatment ID format').optional(),
});

const bundleUsageSchema = z.object({
  customerBundleId: z.string().uuid('Invalid customer bundle ID format'),
  treatmentId: z.string().uuid('Invalid treatment ID format'),
});

const multiItemSchema = z.object({
  treatmentId: z.string().uuid('Invalid treatment ID format'),
  variantId: z.string().uuid('Invalid variant ID format').nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time format'),
  duration: z.number().int().min(0).max(1000).optional(),
  quantity: z.number().int().min(1).max(10),
  guestCount: z.number().int().min(1).max(20).optional(),
});

const multiRequestSchema = z.object({
  hotelId: z.string().min(1),
  clientData: clientDataSchema,
  items: z.array(multiItemSchema).min(2, 'Multi-mode requires at least 2 items').max(10),
  bookingIds: z.array(z.string().uuid()).min(2).max(10),
  groupId: z.string().uuid(),
  paymentMethod: z.enum(['room', 'card', 'cash', 'offert', 'gift_amount']).optional().default('room'),
  totalPrice: z.number().min(0).max(100000),
  therapistGender: z.enum(['female', 'male']).optional(),
  checkoutIntentId: z.string().uuid().optional(),
});

const requestSchema = z.object({
  hotelId: z.string().min(1, 'Hotel ID is required'),
  clientData: clientDataSchema,
  bookingData: bookingDataSchema,
  treatments: z.array(treatmentSchema).min(1, 'At least one treatment is required').max(20, 'Maximum 20 treatments allowed'),
  paymentMethod: z.enum(['room', 'card', 'cash', 'offert', 'gift_amount']).optional().default('room'),
  totalPrice: z.number().min(0, 'Total price must be positive').max(100000, 'Total price exceeds maximum'),
  therapistGender: z.enum(['female', 'male']).optional(),
  bundleUsage: bundleUsageSchema.optional(),
  draftBookingId: z.string().uuid('Invalid draft booking ID').optional(),
  guestCount: z.number().int().min(1).max(20).optional().default(1),
  giftAmountUsage: z.object({
    customerBundleId: z.string().uuid('Invalid customer bundle ID format'),
    amountCents: z.number().int().min(1, 'Amount must be positive'),
  }).optional(),
  checkoutIntentId: z.string().uuid().optional(),
  // Placement d'un accès amenity par rapport au soin (panier mixte).
  amenityTiming: z.enum(['before', 'after', 'same']).optional(),
});

// Sanitize string to prevent injection
function sanitizeString(str: string): string {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}

// Mirrors src/lib/phone.ts languageFromCountryCode, but reads the country code
// off the composed international phone string (e.g. "+46 709313996"). +33 → fr,
// everything else → en. No phone (PMS-verified guests) → fr (venue default).
function languageFromPhone(phone: string | null): 'fr' | 'en' {
  const p = (phone ?? '').replace(/\s/g, '');
  if (!p) return 'fr';
  return p.startsWith('+33') ? 'fr' : 'en';
}

async function handleMultiBookingConfirm(
  supabase: any,
  data: z.infer<typeof multiRequestSchema>,
  log: ReturnType<typeof createLogger>,
): Promise<Response> {
  const { hotelId, clientData, items, bookingIds, groupId, paymentMethod, therapistGender } = data;
  log.bind({ hotelId, groupId, bookingCount: bookingIds.length, mode: 'multi' });

  if (items.length !== bookingIds.length) {
    return new Response(
      JSON.stringify({ success: false, error: 'items and bookingIds length mismatch' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }

  const sanitizedClientData = {
    firstName: sanitizeString(clientData.firstName),
    lastName: sanitizeString(clientData.lastName),
    email: clientData.email ? sanitizeString(clientData.email) : null,
    phone: clientData.phone ? sanitizeString(clientData.phone) : null,
    roomNumber: clientData.roomNumber ? sanitizeString(clientData.roomNumber) : null,
    note: clientData.note ? sanitizeString(clientData.note) : null,
  };
  const clientLanguage = languageFromPhone(sanitizedClientData.phone);

  // Hotel info for surcharge + email
  const { data: hotel, error: hotelError } = await supabase
    .from('hotels')
    .select('name, venue_type, auto_validate_bookings, currency, offert, company_offered, pms_guest_lookup_enabled, opening_time, closing_time, timezone, allow_out_of_hours_booking, out_of_hours_surcharge_percent')
    .eq('id', hotelId)
    .single();

  if (hotelError || !hotel) {
    return new Response(
      JSON.stringify({ success: false, error: 'Hotel not found' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
    );
  }

  // PMS-verified hotel guest: re-verify server-side and use PMS contact details
  // (same security model as single-mode — never trust the client's flag).
  if (clientData.pmsVerified && (hotel as any).pms_guest_lookup_enabled) {
    const guest = await resolveVerifiedPmsGuest(
      supabase,
      hotelId,
      sanitizedClientData.roomNumber ?? '',
      sanitizedClientData.lastName,
    );
    if (!guest) {
      log.warn('booking.pms_verification_failed', { hotelId, mode: 'multi' });
      return new Response(
        JSON.stringify({ success: false, error: 'PMS_VERIFICATION_FAILED' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    sanitizedClientData.firstName = sanitizeString(guest.firstName) || sanitizedClientData.firstName;
    sanitizedClientData.lastName = sanitizeString(guest.lastName) || sanitizedClientData.lastName;
    sanitizedClientData.email = guest.email ? sanitizeString(guest.email) : sanitizedClientData.email;
    sanitizedClientData.phone = guest.phone ? sanitizeString(guest.phone) : sanitizedClientData.phone;
  }

  if (paymentMethod === 'room' && hotel.venue_type === 'coworking') {
    return new Response(
      JSON.stringify({ success: false, error: 'Room payment is not available for coworking spaces' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }

  // Verify every draft exists, belongs to this hotel, is still awaiting payment,
  // and carries the expected booking_group_id (prevents a client from supplying
  // someone else's groupId to trigger an unintended rollback).
  const { data: drafts, error: draftsErr } = await supabase
    .from('bookings')
    .select('id, status, hotel_id, booking_group_id')
    .in('id', bookingIds);

  if (draftsErr || !drafts || drafts.length !== bookingIds.length ||
      drafts.some((b: any) =>
        b.hotel_id !== hotelId ||
        b.status !== 'awaiting_payment' ||
        b.booking_group_id !== groupId
      )) {
    // Rollback only drafts we own (scoped by both bookingIds and groupId).
    await supabase.from('bookings').delete()
      .in('id', bookingIds).eq('status', 'awaiting_payment');
    log.warn('rpc.reserve.no_slot', { path: 'multi_drafts_invalid' });
    return new Response(
      JSON.stringify({ success: false, error: 'SLOT_TAKEN' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
    );
  }

  // Pre-fetch treatments referenced by all items, for price/duration recomputation.
  const treatmentIds = Array.from(new Set(items.map(i => i.treatmentId)));
  const variantIds = items.map(i => i.variantId).filter(Boolean) as string[];

  const [menusRes, variantsRes] = await Promise.all([
    supabase.from('treatment_menus').select('id, name, price, duration, lead_time, is_bundle, price_on_request').in('id', treatmentIds),
    variantIds.length
      ? supabase.from('treatment_variants').select('id, price, duration').in('id', variantIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const menuMap = new Map((menusRes.data ?? []).map((m: any) => [m.id, m]));
  const variantMap = new Map((variantsRes.data ?? []).map((v: any) => [v.id, v]));

  // Reject bundle/quote treatments in multi mode (V2 territory).
  if (Array.from(menuMap.values()).some((m: any) => m.is_bundle || m.price_on_request)) {
    await supabase.from('bookings').delete()
      .eq('booking_group_id', groupId).eq('status', 'awaiting_payment');
    return new Response(
      JSON.stringify({ success: false, error: 'Bundles and price-on-request are not supported in multi-time mode.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }

  // Find/create customer once.
  const { data: customerId } = await supabase.rpc('find_or_create_customer', {
    _phone: sanitizedClientData.phone,
    _first_name: sanitizedClientData.firstName,
    _last_name: sanitizedClientData.lastName,
    _email: sanitizedClientData.email,
    _language: clientLanguage,
  });

  const isOffert = !!hotel.offert || !!hotel.company_offered;
  // Solo and duo both start 'pending'; a duo stays pending (guest_count > 1)
  // until all practitioners have accepted, then accept_booking sets 'confirmed'.
  const bookingStatus = 'pending';
  const effectivePaymentMethod = isOffert ? 'offert' : (paymentMethod === 'gift_amount' ? 'gift_amount' : paymentMethod);
  const effectivePaymentStatus = isOffert ? 'offert' : (paymentMethod === 'room' ? 'charged_to_room' : 'pending');
  // Paiement chambre = résident hôtel. Règle à sens unique : un paiement carte
  // n'implique pas 'external' (un résident peut payer par carte), mais dans le
  // flow client public il n'y a pas d'autre signal — on garde le défaut.
  const effectiveClientType = paymentMethod === 'room' ? 'hotel' : 'external';

  // Update each draft with real client data + per-item recomputed totals.
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const bookingId = bookingIds[i];
    const variant: any = item.variantId ? variantMap.get(item.variantId) : null;
    const menu: any = menuMap.get(item.treatmentId);
    const unitPrice = (variant?.price ?? menu?.price ?? 0);
    const itemBasePrice = isOffert ? 0 : unitPrice * item.quantity;
    const surcharge = computeOutOfHoursSurcharge(item.time, itemBasePrice, hotel);
    const itemTotal = itemBasePrice + surcharge.surchargeAmount;

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        client_first_name: sanitizedClientData.firstName,
        client_last_name: sanitizedClientData.lastName,
        client_email: sanitizedClientData.email,
        phone: sanitizedClientData.phone,
        room_number: sanitizedClientData.roomNumber,
        client_note: sanitizedClientData.note,
        language: clientLanguage,
        status: bookingStatus,
        source: 'client',
        client_type: effectiveClientType,
        payment_method: effectivePaymentMethod,
        payment_status: effectivePaymentStatus,
        total_price: itemTotal,
        customer_id: customerId || null,
        guest_count: Math.max(1, item.guestCount ?? 1),
        booking_group_id: groupId,
        is_out_of_hours: surcharge.isOutOfHours,
        surcharge_amount: surcharge.surchargeAmount,
      })
      .eq('id', bookingId);
    if (updateError) {
      console.error(`Failed to update draft ${bookingId}:`, updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update booking' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Re-insert booking_treatments for this item only.
    const { error: btDelErr } = await supabase.from('booking_treatments').delete().eq('booking_id', bookingId);
    if (btDelErr) {
      console.error(`booking_treatments delete error for ${bookingId}:`, btDelErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update booking treatments' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    const treatmentRows = Array.from({ length: item.quantity }, () => ({
      booking_id: bookingId,
      treatment_id: item.treatmentId,
      variant_id: item.variantId || null,
    }));
    const { error: btErr } = await supabase.from('booking_treatments').insert(treatmentRows);
    if (btErr) {
      console.error(`booking_treatments insert error for ${bookingId}:`, btErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update booking treatments' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
  }

  // Fetch sequential booking numbers for response.
  const { data: numbered } = await supabase
    .from('bookings')
    .select('id, booking_id')
    .in('id', bookingIds);
  const idToNumber = new Map<string, number | null>(
    (numbered ?? []).map((b: any) => [b.id, b.booking_id ?? null])
  );
  const bookingNumbers = bookingIds.map(id => idToNumber.get(id) ?? null);

  // Notifications run AFTER responding (same reason as single-mode): a synchronous
  // admin email + one dispatch per booking kept the response open long enough for
  // slow networks to drop the fetch, even though every draft was already promoted.
  const runMultiNotifications = async () => {
    // Notifications: pass groupId — emails handlers detect and aggregate.
    // Single admin email for the whole group.
    try {
      await supabase.functions.invoke('notify-admin-new-booking', {
        body: { bookingId: bookingIds[0], groupId },
      });
    } catch (err) {
      console.error('notify-admin-new-booking error:', err);
    }

    // Smart dispatch: send 1 dispatch per booking (each may need a different therapist).
    for (const bookingId of bookingIds) {
      try {
        await supabase.functions.invoke('dispatch-booking-therapist', { body: { bookingId } });
      } catch (err) {
        console.error('dispatch-booking-therapist error:', err);
      }
    }

    // Single client confirmation email when applicable (here: pending state ⇒ no
    // confirmation yet — same rule as single-mode; quote_pending is not allowed
    // in multi). We skip sending here; therapist acceptance triggers
    // notify-booking-confirmed which will aggregate the group.

    await tryMarkCheckoutIntentConverted(supabase, data.checkoutIntentId, bookingIds[0], '[create-client-booking]');
  };

  await runInBackground(runMultiNotifications(), 'Background multi-booking notifications');

  return new Response(
    JSON.stringify({ success: true, groupId, bookingIds, bookingNumbers }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  );
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const log = createLogger({ function: 'create-client-booking', req });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse and validate request body
    let rawBody;
try {
  const textBody = await req.text();
  if (!textBody) throw new Error("Body vide");
  rawBody = JSON.parse(textBody);
} catch (err) {
  console.error('Erreur de parsing JSON:', err);
  return new Response(
    JSON.stringify({ success: false, error: 'Requête invalide ou vide envoyée par le site.' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
  );
}

    // -------- Multi-mode short-circuit --------
    // When groupId + bookingIds + items are present, batch-confirm N drafts
    // sharing a booking_group_id. Bundles & gift_amount are not supported in
    // multi mode (V2). Falls through to legacy single-mode otherwise.
    if (rawBody && Array.isArray(rawBody.items) && Array.isArray(rawBody.bookingIds) && rawBody.groupId) {
      if (rawBody.bundleUsage || rawBody.giftAmountUsage) {
        return new Response(
          JSON.stringify({ success: false, error: 'Bundles and gift amounts are not supported for multi-time bookings yet.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      const multi = multiRequestSchema.safeParse(rawBody);
      if (!multi.success) {
        console.error('Multi validation error:', multi.error.issues);
        return new Response(
          JSON.stringify({ success: false, error: 'Validation failed', details: multi.error.issues.map(i => i.message) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      return await handleMultiBookingConfirm(supabase, multi.data, log);
    }

    const validationResult = requestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error.issues);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Validation failed',
          details: validationResult.error.issues.map(i => i.message)
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const {
      hotelId,
      clientData,
      bookingData,
      treatments,
      paymentMethod,
      totalPrice,
      therapistGender,
      bundleUsage,
      draftBookingId,
      guestCount,
      giftAmountUsage,
      checkoutIntentId,
      amenityTiming,
    } = validationResult.data;

    const effectiveGuestCount = Math.max(1, guestCount ?? 1);
    // A soin and its amenity access are never at the same time — the client always
    // picks 'before' or 'after'. Fall back to 'after' (never 'same') so a missing
    // choice can't overlap the amenity block on top of the soin block.
    const effectiveAmenityTiming = amenityTiming ?? 'after';
    const isDuoBooking = effectiveGuestCount > 1;

    log.bind({ hotelId, paymentMethod, isDuoBooking, draftBookingId });
    console.log('Creating booking for hotel:', hotelId);

    // Sanitize user-provided strings
    const sanitizedClientData = {
      firstName: sanitizeString(clientData.firstName),
      lastName: sanitizeString(clientData.lastName),
      email: clientData.email ? sanitizeString(clientData.email) : null,
      phone: clientData.phone ? sanitizeString(clientData.phone) : null,
      roomNumber: clientData.roomNumber ? sanitizeString(clientData.roomNumber) : null,
      note: clientData.note ? sanitizeString(clientData.note) : null,
      pmsGuestCheckIn: clientData.pmsGuestCheckIn || null,
      pmsGuestCheckOut: clientData.pmsGuestCheckOut || null,
    };
    const clientLanguage = languageFromPhone(sanitizedClientData.phone);

    // Get hotel info
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('name, venue_type, auto_validate_bookings, currency, offert, company_offered, pms_type, pms_auto_charge_room, pms_guest_lookup_enabled, opening_time, closing_time, timezone, min_booking_notice_minutes, allow_out_of_hours_booking, out_of_hours_surcharge_percent')
      .eq('id', hotelId)
      .single();

    if (hotelError || !hotel) {
      console.error('Hotel lookup error:', hotelError);
      return new Response(
        JSON.stringify({ success: false, error: 'Hotel not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // PMS-verified hotel guest: re-verify room + last name server-side (never trust
    // the client's `pmsVerified` flag) and pull the contact details from the PMS so
    // the customer + booking are stored with verified data — without the visitor
    // ever exposing or fabricating someone else's email/phone.
    if (clientData.pmsVerified && (hotel as any).pms_guest_lookup_enabled) {
      const guest = await resolveVerifiedPmsGuest(
        supabase,
        hotelId,
        sanitizedClientData.roomNumber ?? '',
        sanitizedClientData.lastName,
      );
      if (!guest) {
        log.warn('booking.pms_verification_failed', { hotelId });
        return new Response(
          JSON.stringify({ success: false, error: 'PMS_VERIFICATION_FAILED' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
      sanitizedClientData.firstName = sanitizeString(guest.firstName) || sanitizedClientData.firstName;
      sanitizedClientData.lastName = sanitizeString(guest.lastName) || sanitizedClientData.lastName;
      sanitizedClientData.email = guest.email ? sanitizeString(guest.email) : sanitizedClientData.email;
      sanitizedClientData.phone = guest.phone ? sanitizeString(guest.phone) : sanitizedClientData.phone;
      sanitizedClientData.pmsGuestCheckIn = guest.checkIn || sanitizedClientData.pmsGuestCheckIn;
      sanitizedClientData.pmsGuestCheckOut = guest.checkOut || sanitizedClientData.pmsGuestCheckOut;
    }

    // Coworking spaces don't support room payment
    if (paymentMethod === 'room' && hotel.venue_type === 'coworking') {
      console.error('Room payment not available for coworking');
      return new Response(
        JSON.stringify({ success: false, error: 'Room payment is not available for coworking spaces' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Validate that all treatment IDs exist and check for price_on_request, duration, lead_time
    const treatmentIds = treatments.map(t => t.treatmentId);
    // Les variantes portent leurs propres jours autorisés (formules Semaine /
    // Week-end) : la RPC les contrôle comme ceux du soin.
    const selectedVariantIds = treatments
      .map(t => t.variantId)
      .filter((v): v is string => !!v);
    const { data: validTreatments, error: treatmentValidationError } = await supabase
      .from('treatment_menus')
      .select('id, price_on_request, duration, lead_time, is_bundle, bundle_id, is_addon, category, amenity_id')
      .in('id', treatmentIds);

    if (treatmentValidationError) {
      console.error('Treatment validation error:', treatmentValidationError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to validate treatments' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    const validTreatmentIds = new Set(validTreatments?.map(t => t.id) || []);
    const invalidTreatments = treatmentIds.filter(id => !validTreatmentIds.has(id));

    if (invalidTreatments.length > 0) {
      console.error('Invalid treatment IDs:', invalidTreatments);
      return new Response(
        JSON.stringify({ success: false, error: 'One or more treatments are invalid' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Which lines are add-ons? Never trust the client — recompute server-side.
    const addonTreatmentIds = await fetchAddonTreatmentIds(supabase, hotelId, validTreatments || []);
    const isAddonLine = (treatmentId: string) => addonTreatmentIds.has(treatmentId);
    // Amenity lines occupy their own block — exclude them from the soin duration.
    const amenityLineIds = new Set(
      (validTreatments || []).filter(t => t.amenity_id != null).map(t => t.id),
    );
    const isAmenityLine = (treatmentId: string) => amenityLineIds.has(treatmentId);
    const durationOfLine = (line: { treatmentId: string }) =>
      validTreatments?.find(t => t.id === line.treatmentId)?.duration || 0;

    const totalDuration = computeSlotDuration(treatments, isDuoBooking, durationOfLine, isAddonLine, isAmenityLine);
    console.log('Total booking duration:', totalDuration, 'minutes');

    const insertBookingTreatments = (targetBookingId: string) =>
      insertBookingTreatmentLines(supabase, targetBookingId, treatments, isAddonLine);

    // TOCTOU: Check blocked slots server-side
    if (await isInBlockedSlot(supabase, hotelId, bookingData.date, bookingData.time, totalDuration || 30)) {
      console.log('Rejected: overlaps with blocked slot', bookingData.time);
      log.warn('booking.blocked_slot', {
        date: bookingData.date,
        time: bookingData.time,
      });
      return new Response(
        JSON.stringify({ success: false, error: 'BLOCKED_SLOT' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // TOCTOU: Check lead time server-side.
    // Effective lead time = max(venue min booking notice, max treatment lead_time).
    // Applies across days, not only today (venue policies like "48h ahead").
    const maxTreatmentLeadTime = Math.max(...(validTreatments?.map(t => t.lead_time || 0) || [0]));
    const venueMinNotice = (hotel as any).min_booking_notice_minutes ?? 0;
    const maxLeadTime = Math.max(maxTreatmentLeadTime, venueMinNotice);
    if (maxLeadTime > 0) {
      const now = new Date();
      // Compute booking datetime in the venue timezone, then convert to UTC for comparison.
      const venueTz = (hotel as any).timezone || 'UTC';
      const [bYear, bMonth, bDay] = bookingData.date.split('-').map(Number);
      const [bHour, bMinute] = bookingData.time.split(':').map(Number);
      // Trick: format "now" in venue TZ to measure the TZ offset, then apply it.
      const tzOffsetMs = (() => {
        const localAsUtc = Date.UTC(bYear, bMonth - 1, bDay, bHour, bMinute, 0);
        // Determine venue UTC offset at that instant using Intl.
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: venueTz,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).formatToParts(new Date(localAsUtc)).reduce<Record<string, string>>((acc, p) => {
          if (p.type !== 'literal') acc[p.type] = p.value;
          return acc;
        }, {});
        const asIfLocal = Date.UTC(
          parseInt(parts.year, 10), parseInt(parts.month, 10) - 1, parseInt(parts.day, 10),
          parseInt(parts.hour, 10), parseInt(parts.minute, 10), parseInt(parts.second, 10)
        );
        return asIfLocal - localAsUtc;
      })();
      const bookingDateTimeMs = Date.UTC(bYear, bMonth - 1, bDay, bHour, bMinute, 0) - tzOffsetMs;
      const minutesUntilBooking = Math.floor((bookingDateTimeMs - now.getTime()) / 60000);

      if (minutesUntilBooking < maxLeadTime) {
        console.log('Rejected: lead time violation', { minutesUntilBooking, maxLeadTime, venueMinNotice, maxTreatmentLeadTime });
        log.warn('booking.lead_time_violation', {
          minutesUntilBooking,
          maxLeadTime,
          venueMinNotice,
          maxTreatmentLeadTime,
        });
        return new Response(
          JSON.stringify({ success: false, error: 'LEAD_TIME_VIOLATION', minLeadTimeMinutes: maxLeadTime }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // Check if any treatment is price_on_request
    const hasPriceOnRequest = validTreatments?.some(t => t.price_on_request) || false;
    const isOffert = !!hotel.offert || !!hotel.company_offered;
    // An amenity-only booking (every line is an amenity access, e.g. pool) needs
    // no therapist assignment, so there is nothing to wait for — it is confirmed
    // right away (the amenity_bookings rows are auto-confirmed too). A mixed or
    // soin-only cart stays 'pending' until every practitioner has accepted via
    // the broadcast-accept flow (accept_booking RPC), which flips it to
    // 'confirmed'. Duo bookings also start 'pending', like solo.
    const isAmenityOnly = treatments.length > 0
      && treatments.every(t => amenityLineIds.has(t.treatmentId));
    const bookingStatus = (!isOffert && hasPriceOnRequest)
      ? 'quote_pending'
      : isAmenityOnly
        ? 'confirmed'
        : 'pending';
    // Recalcul serveur de la majoration hors horaires (source de vérité — ignore le totalPrice client)
    const basePrice = isOffert ? 0 : (hasPriceOnRequest ? 0 : totalPrice);
    const surcharge = computeOutOfHoursSurcharge(bookingData.time, basePrice, hotel);
    const effectiveTotalPrice = basePrice + surcharge.surchargeAmount;
    const effectivePaymentMethod = isOffert ? 'offert' : (paymentMethod === 'gift_amount' ? 'gift_amount' : paymentMethod);
    const effectivePaymentStatus = isOffert
      ? 'offert'
      : paymentMethod === 'room'
        ? 'charged_to_room'
        : paymentMethod === 'gift_amount'
          ? 'paid'
          : 'pending';
    // Paiement chambre = résident hôtel (règle à sens unique, cf. mode multi).
    const effectiveClientType = paymentMethod === 'room' ? 'hotel' : 'external';
    console.log('Booking status:', bookingStatus, '| Has price on request:', hasPriceOnRequest, '| Is offert:', isOffert);

    // Find or create customer by phone
    const { data: customerId, error: customerError } = await supabase.rpc('find_or_create_customer', {
      _phone: sanitizedClientData.phone,
      _first_name: sanitizedClientData.firstName,
      _last_name: sanitizedClientData.lastName,
      _email: sanitizedClientData.email,
      _language: clientLanguage,
    });

    if (customerError) {
      console.error('Error finding/creating customer:', customerError);
      // Non-blocking: continue booking creation without customer link
    } else {
      console.log('Customer linked:', customerId);
    }

    // -------------------------------------------------------------------------
    // Slot reservation: UPDATE draft booking if hold exists, otherwise INSERT
    // -------------------------------------------------------------------------
    let bookingId: string;

    if (draftBookingId) {
      // The slot is already held — verify the draft belongs to this hotel and is still pending
      const { data: draftBooking, error: draftFetchError } = await supabase
        .from('bookings')
        .select('id')
        .eq('id', draftBookingId)
        .eq('hotel_id', hotelId)
        .eq('status', 'awaiting_payment')
        .single();

      if (draftFetchError || !draftBooking) {
        console.warn('Draft booking not found or expired, falling back to atomic reserve');
        // Supprimer le draft expiré pour éviter qu'il reste en base indéfiniment
        await supabase.from('bookings').delete().eq('id', draftBookingId).eq('status', 'awaiting_payment');
        // Draft expired — fall through to the atomic reserve below
        const { data: fallbackId, error: fallbackError } = await supabase.rpc('reserve_trunk_atomically', {
          _hotel_id: hotelId,
          _booking_date: bookingData.date,
          _booking_time: bookingData.time,
          _duration: totalDuration > 0 ? totalDuration : null,
          _hotel_name: hotel.name,
          _client_first_name: sanitizedClientData.firstName,
          _client_last_name: sanitizedClientData.lastName,
          _client_email: sanitizedClientData.email,
          _phone: sanitizedClientData.phone,
          _room_number: sanitizedClientData.roomNumber,
          _client_note: sanitizedClientData.note,
          _status: bookingStatus,
          _payment_method: effectivePaymentMethod,
          _payment_status: effectivePaymentStatus,
          _total_price: effectiveTotalPrice,
          _language: clientLanguage,
          _treatment_ids: treatmentIds,
          _variant_ids: selectedVariantIds,
          _customer_id: customerId || null,
          _therapist_gender: therapistGender || null,
          _guest_count: effectiveGuestCount,
          _amenity_timing: effectiveAmenityTiming,
        });
        if (fallbackError) {
          if (fallbackError.message?.includes('NO_ROOM_AVAILABLE')) {
            log.warn('rpc.reserve.no_slot', {
              path: 'draft_expired_fallback',
              date: bookingData.date,
              time: bookingData.time,
            });
            return new Response(JSON.stringify({ success: false, error: 'SLOT_TAKEN' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 });
          }
          log.error('rpc.reserve.failed', fallbackError, {
            path: 'draft_expired_fallback',
            date: bookingData.date,
            time: bookingData.time,
          });
          return new Response(JSON.stringify({ success: false, error: 'Failed to create booking' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }
        bookingId = fallbackId;
      } else {
        // Update the draft with real client data
        const { error: updateError } = await supabase
          .from('bookings')
          .update({
            client_first_name: sanitizedClientData.firstName,
            client_last_name: sanitizedClientData.lastName,
            client_email: sanitizedClientData.email,
            phone: sanitizedClientData.phone,
            room_number: sanitizedClientData.roomNumber,
            client_note: sanitizedClientData.note,
            language: clientLanguage,
            status: bookingStatus,
            payment_method: effectivePaymentMethod,
            payment_status: effectivePaymentStatus,
            total_price: effectiveTotalPrice,
            customer_id: customerId || null,
            guest_count: effectiveGuestCount,
          })
          .eq('id', draftBookingId);

        if (updateError) {
          console.error('Failed to update draft booking:', updateError);
          return new Response(JSON.stringify({ success: false, error: 'Failed to update booking' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }

        bookingId = draftBookingId;
        console.log('Draft booking updated with real client data:', bookingId);
      }

      // Re-insert booking_treatments with proper quantity support
      await supabase.from('booking_treatments').delete().eq('booking_id', bookingId);
      const treatmentsError = await insertBookingTreatments(bookingId);
      if (treatmentsError) console.error('Treatments re-insert error:', treatmentsError);

    } else {
      // No hold — TOCTOU fix: atomically reserve treatment room + create booking
      const { data: newBookingId, error: rpcError } = await supabase.rpc('reserve_trunk_atomically', {
        _hotel_id: hotelId,
        _booking_date: bookingData.date,
        _booking_time: bookingData.time,
        _duration: totalDuration > 0 ? totalDuration : null,
        _hotel_name: hotel.name,
        _client_first_name: sanitizedClientData.firstName,
        _client_last_name: sanitizedClientData.lastName,
        _client_email: sanitizedClientData.email,
        _phone: sanitizedClientData.phone,
        _room_number: sanitizedClientData.roomNumber,
        _client_note: sanitizedClientData.note,
        _status: bookingStatus,
        _payment_method: effectivePaymentMethod,
        _payment_status: effectivePaymentStatus,
        _total_price: effectiveTotalPrice,
        _language: clientLanguage,
        _treatment_ids: treatmentIds,
        _variant_ids: selectedVariantIds,
        _customer_id: customerId || null,
        _therapist_gender: therapistGender || null,
        _guest_count: effectiveGuestCount,
        _amenity_timing: effectiveAmenityTiming,
      });

      if (rpcError) {
        if (rpcError.message?.includes('NO_ROOM_AVAILABLE')) {
          console.log('Slot taken (atomic check)');
          log.warn('rpc.reserve.no_slot', {
            path: 'atomic',
            date: bookingData.date,
            time: bookingData.time,
          });
          return new Response(JSON.stringify({ success: false, error: 'SLOT_TAKEN' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 });
        }
        console.error('RPC error:', rpcError);
        log.error('rpc.reserve.failed', rpcError, {
          path: 'atomic',
          date: bookingData.date,
          time: bookingData.time,
        });
        return new Response(JSON.stringify({ success: false, error: 'Failed to create booking' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
      }

      bookingId = newBookingId;
      console.log('Booking created atomically:', bookingId);

      // Create booking treatments
      const treatmentsError = await insertBookingTreatments(bookingId);
      if (treatmentsError) console.error('Treatments creation error:', treatmentsError);
    }

    console.log('Booking treatments ready');

    // Tag the booking as originating from the client booking flow. bookings.source
    // defaults to 'admin', and this function (the only caller) never overrode it —
    // so online client bookings were previously indistinguishable from staff entries.
    // client_type follows the same route: the column defaults to 'external', so a
    // hotel guest paying by room charge was wrongly tagged external.
    // Covers all single-mode sub-paths (draft update, expired-draft fallback, atomic reserve).
    const { error: sourceErr } = await supabase
      .from('bookings')
      .update({ source: 'client', client_type: effectiveClientType })
      .eq('id', bookingId);
    if (sourceErr) console.error('Failed to tag booking source=client (non-blocking):', sourceErr);

    // Persister les flags de majoration hors horaires sur la réservation
    if (!isOffert && !hasPriceOnRequest && (surcharge.isOutOfHours || surcharge.surchargeAmount > 0)) {
      const { error: surchargeErr } = await supabase
        .from('bookings')
        .update({
          is_out_of_hours: surcharge.isOutOfHours,
          surcharge_amount: surcharge.surchargeAmount,
        })
        .eq('id', bookingId);
      if (surchargeErr) console.error('Surcharge flags update failed (non-blocking):', surchargeErr);
    }

    // Room billing: ensure booking_payment_infos exists for cancellation lifecycle tracking.
    if (paymentMethod === 'room' && !isOffert) {
      const { error: roomPaymentInfoError } = await supabase
        .from('booking_payment_infos')
        .insert({
          booking_id: bookingId,
          customer_id: customerId || null,
          estimated_price: effectiveTotalPrice,
          payment_status: 'charged',
        });
      if (roomPaymentInfoError) {
        console.error('Failed to insert booking_payment_infos for room payment:', roomPaymentInfoError);
      }
    }

    // --- Bundle handling ---
    let bundleWarning: string | null = null;

    // Scenario 1: Client USES an existing bundle session
    if (bundleUsage) {
      try {
        console.log('Using bundle session:', bundleUsage.customerBundleId, 'for treatment:', bundleUsage.treatmentId);
        const { data: usageId, error: usageError } = await supabase.rpc('use_bundle_session', {
          _customer_bundle_id: bundleUsage.customerBundleId,
          _booking_id: bookingId,
          _treatment_id: bundleUsage.treatmentId,
        });

        if (usageError) {
          console.error('Bundle session usage failed (non-blocking):', usageError.message);
          bundleWarning = `Bundle session could not be applied: ${usageError.message}. Normal payment flow applies.`;
        } else {
          console.log('Bundle session used successfully, usage ID:', usageId);
          // Mark booking as paid via bundle
          const { error: updateError } = await supabase
            .from('bookings')
            .update({ payment_method: 'bundle', payment_status: 'paid' })
            .eq('id', bookingId);

          if (updateError) {
            console.error('Failed to update booking payment to bundle:', updateError);
            bundleWarning = 'Bundle session applied but payment status update failed.';
          }
        }
      } catch (bundleError) {
        console.error('Unexpected error during bundle session usage:', bundleError);
        bundleWarning = 'Bundle session could not be applied due to an unexpected error. Normal payment flow applies.';
      }
    }

    // Scenario 1b: Client USES a gift amount card
    if (giftAmountUsage) {
      try {
        console.log('Using gift amount:', giftAmountUsage.customerBundleId, 'amount:', giftAmountUsage.amountCents);
        const { data: usageId, error: usageError } = await supabase.rpc('use_gift_amount', {
          _customer_bundle_id: giftAmountUsage.customerBundleId,
          _booking_id: bookingId,
          _amount_cents: giftAmountUsage.amountCents,
        });

        if (usageError) {
          console.error('Gift amount usage failed (non-blocking):', usageError.message);
          bundleWarning = `Gift amount could not be applied: ${usageError.message}. Normal payment flow applies.`;
        } else {
          console.log('Gift amount used successfully, usage ID:', usageId);
          // Mark booking as paid via gift amount
          const { error: updateError } = await supabase
            .from('bookings')
            .update({ payment_method: 'gift_amount', payment_status: 'paid' })
            .eq('id', bookingId);

          if (updateError) {
            console.error('Failed to update booking payment to gift_amount:', updateError);
            bundleWarning = 'Gift amount applied but payment status update failed.';
          }

          // Maintain the 1:1 invariant with booking_payment_infos — other
          // payment flows (card, setup intent) create a row, voucher must too.
          const { error: paymentInfoError } = await supabase
            .from('booking_payment_infos')
            .insert({
              booking_id: bookingId,
              customer_id: customerId,
              estimated_price: totalPrice,
              payment_status: 'charged',
              payment_at: new Date().toISOString(),
            });
          if (paymentInfoError) {
            console.error('Failed to insert booking_payment_infos for gift amount:', paymentInfoError);
          }
        }
      } catch (giftError) {
        console.error('Unexpected error during gift amount usage:', giftError);
        bundleWarning = 'Gift amount could not be applied due to an unexpected error. Normal payment flow applies.';
      }
    }

    // Scenario 2: Client BUYS a bundle (is_bundle treatment in cart)
    const bundleTreatments = validTreatments?.filter(t => t.is_bundle && t.bundle_id) || [];
    if (bundleTreatments.length > 0 && customerId) {
      for (const bt of bundleTreatments) {
        try {
          console.log('Creating customer bundle for bundle_id:', bt.bundle_id, 'customer:', customerId);
          const { data: customerBundleId, error: createBundleError } = await supabase.rpc('create_customer_bundle', {
            _customer_id: customerId,
            _bundle_id: bt.bundle_id,
            _hotel_id: hotelId,
            _booking_id: bookingId,
          });

          if (createBundleError) {
            console.error('Failed to create customer bundle (non-blocking):', createBundleError.message);
          } else {
            console.log('Customer bundle created:', customerBundleId);
          }
        } catch (createError) {
          console.error('Unexpected error creating customer bundle:', createError);
        }
      }
    }

    // Auto-validation logic: if hotel has auto_validate_bookings enabled and booking is pending (not quote_pending)
    let wasAutoValidated = false;
    let autoAssignedTherapist: { id: string; first_name: string; last_name: string } | null = null;

    if (hotel.auto_validate_bookings && bookingStatus === 'pending' && !isDuoBooking) {
      console.log('Auto-validation enabled for hotel, checking for single therapist...');

      // Get active therapists assigned to this hotel (filtered by gender if preference set)
      let autoValidateQuery = supabase
        .from('therapist_venues')
        .select(`
          therapist_id,
          therapists:therapist_id (
            id,
            first_name,
            last_name,
            status,
            gender
          )
        `)
        .eq('hotel_id', hotelId);

      if (therapistGender) {
        autoValidateQuery = autoValidateQuery.eq('therapists.gender', therapistGender);
      }

      const { data: therapistVenues, error: therapistError } = await autoValidateQuery;

      if (!therapistError && therapistVenues) {
        // Filter to get only active therapists
        const activeTherapists = therapistVenues
          .filter((tv: any) => {
            const t = tv.therapists;
            return t && (t.status?.toLowerCase() === 'active' || t.status?.toLowerCase() === 'actif');
          })
          .map((tv: any) => tv.therapists);

        console.log('Active therapists found:', activeTherapists.length);

        // If exactly one active therapist, auto-assign and confirm
        if (activeTherapists.length === 1) {
          const therapist = activeTherapists[0];
          const therapistName = `${therapist.first_name} ${therapist.last_name}`;

          console.log('Auto-assigning therapist:', therapistName);

          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              status: 'confirmed',
              therapist_id: therapist.id,
              therapist_name: therapistName,
              assigned_at: new Date().toISOString(),
            })
            .eq('id', bookingId);

          if (!updateError) {
            wasAutoValidated = true;
            autoAssignedTherapist = therapist;
            console.log('Booking auto-validated and assigned to:', therapistName);
          } else {
            console.error('Failed to auto-validate booking:', updateError);
          }
        } else {
          console.log('Auto-validation skipped: found', activeTherapists.length, 'active therapists (need exactly 1)');
        }
      } else {
        console.error('Error fetching therapists for auto-validation:', therapistError);
      }
    }

    // Fetch the created/updated booking to get booking_id (numéro séquentiel)
    const { data: booking } = await supabase
      .from('bookings')
      .select('booking_id')
      .eq('id', bookingId)
      .single();

    // Get treatment names, prices and price_on_request status for email
    const { data: treatmentDetails } = await supabase
      .from('treatment_menus')
      .select('id, name, price, price_on_request')
      .in('id', treatmentIds);

    // Format treatments with proper structure for email
    const treatmentsForEmail = treatmentDetails?.map(t => ({
      name: t.name,
      price: t.price,
      isPriceOnRequest: t.price_on_request || false,
    })) || [];

    // Send the quote-requested email only for quote_pending bookings (no other
    // email path covers them). Auto-validated bookings are confirmed below via
    // notify-booking-confirmed (template e2a8e114), so sending the legacy
    // send-booking-confirmation here too would duplicate the client email.
    const shouldSendConfirmationEmail = bookingStatus === 'quote_pending';

    // Fire the notification fan-out AFTER responding: the browser only needs the
    // booking id. Broadcasting to every therapist + admin/concierge emails
    // synchronously kept the response open ~4-5s (some venues have ~30 active
    // therapists), so slow/mobile networks saw the fetch drop ("Failed to send a
    // request to the Edge Function") even though the booking had committed — and a
    // retry could produce a double booking. EdgeRuntime.waitUntil keeps the worker
    // alive to finish this work in the background.
    const runBookingNotifications = async () => {
    if (sanitizedClientData.email && shouldSendConfirmationEmail) {
      try {
        const emailResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-confirmation`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({
              email: sanitizedClientData.email,
              bookingId: bookingId,
              bookingNumber: booking?.booking_id?.toString() ?? '',
              clientName: `${sanitizedClientData.firstName} ${sanitizedClientData.lastName}`,
              hotelName: hotel.name,
              roomNumber: sanitizedClientData.roomNumber,
              bookingDate: bookingData.date,
              bookingTime: bookingData.time,
              treatments: treatmentsForEmail,
              totalPrice: hasPriceOnRequest ? totalPrice : totalPrice,
              currency: hotel.currency || 'EUR',
              isQuotePending: hasPriceOnRequest,
            }),
          }
        );

        if (!emailResponse.ok) {
          console.error('Failed to send confirmation email:', await emailResponse.text());
        } else {
          console.log('Confirmation email sent successfully');
        }
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
        // Continue even if email fails
      }
    }

    // For quote_pending bookings, only notify admin (not therapists)
    if (bookingStatus === 'quote_pending') {
      try {
        console.log('Sending quote pending notification to admin for booking:', bookingId);
        const quoteNotifResponse = await supabase.functions.invoke('notify-admin-quote-pending', {
          body: { bookingId: bookingId }
        });

        if (quoteNotifResponse.error) {
          console.error('Failed to send quote pending notification:', quoteNotifResponse.error);
        } else {
          console.log('Quote pending notification sent:', quoteNotifResponse.data);
        }
      } catch (quoteNotifError) {
        console.error('Error sending quote pending notification:', quoteNotifError);
      }
    } else if (isDuoBooking) {
      // Duo booking: broadcast to ALL therapists — N must accept to confirm
      try {
        console.log(`Duo booking (guest_count=${effectiveGuestCount}): broadcasting to all therapists for booking:`, bookingId);
        const duoNotifResponse = await supabase.functions.invoke('trigger-new-booking-notifications', {
          body: { bookingId: bookingId, notifyAll: true },
          headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        });
        if (duoNotifResponse.error) {
          console.error('Failed to broadcast duo notifications:', duoNotifResponse.error);
        } else {
          console.log('Duo broadcast sent:', duoNotifResponse.data);
        }
      } catch (duoNotifError) {
        console.error('Error sending duo notifications:', duoNotifError);
      }

      try {
        const adminEmailResponse = await supabase.functions.invoke('notify-admin-new-booking', {
          body: { bookingId: bookingId }
        });
        if (adminEmailResponse.error) {
          console.error('Failed to send admin email notification (duo):', adminEmailResponse.error);
        }
      } catch (adminEmailError) {
        console.error('Error sending admin email notification (duo):', adminEmailError);
      }
    } else if (wasAutoValidated) {
      // Auto-validated booking: send confirmation notifications (not new booking notifications)
      try {
        console.log('Sending booking confirmed notifications for auto-validated booking:', bookingId);
        const confirmResponse = await supabase.functions.invoke('notify-booking-confirmed', {
          body: { bookingId: bookingId }
        });

        if (confirmResponse.error) {
          console.error('Failed to send booking confirmed notifications:', confirmResponse.error);
        } else {
          console.log('Booking confirmed notifications sent:', confirmResponse.data);
        }
      } catch (confirmError) {
        console.error('Error sending booking confirmed notifications:', confirmError);
      }

      try {
        const adminEmailResponse = await supabase.functions.invoke('notify-admin-new-booking', {
          body: { bookingId: bookingId }
        });
        if (adminEmailResponse.error) {
          console.error('Failed to send admin email notification (auto-validated):', adminEmailResponse.error);
        }
      } catch (adminEmailError) {
        console.error('Error sending admin email notification (auto-validated):', adminEmailError);
      }
    } else {
      // Broadcast to therapists with gender-preference filtering
      try {
        console.log('Broadcasting booking notifications (gender-aware):', bookingId);
        const notifResponse = await supabase.functions.invoke('trigger-new-booking-notifications', {
          body: { bookingId: bookingId, notifyAll: true },
          headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        });

        if (notifResponse.error) {
          console.error('Failed to broadcast notifications:', notifResponse.error);
        } else {
          console.log('Broadcast result:', notifResponse.data);
        }
      } catch (notifError) {
        console.error('Error broadcasting notifications:', notifError);
      }

      // Trigger email notification to admins
      try {
        console.log('Sending admin email notification for booking:', bookingId);
        const adminEmailResponse = await supabase.functions.invoke('notify-admin-new-booking', {
          body: { bookingId: bookingId }
        });

        if (adminEmailResponse.error) {
          console.error('Failed to send admin email notification:', adminEmailResponse.error);
        } else {
          console.log('Admin email notification sent:', adminEmailResponse.data);
        }
      } catch (adminEmailError) {
        console.error('Error sending admin email notification:', adminEmailError);
        // Continue even if admin email fails
      }
    }

    // If payment method is room, notify concierge to charge the room
    if (paymentMethod === 'room') {
      try {
        console.log('Sending concierge room payment notification for booking:', bookingId);
        const conciergeEmailResponse = await supabase.functions.invoke('notify-concierge-room-payment', {
          body: { bookingId: bookingId }
        });

        if (conciergeEmailResponse.error) {
          console.error('Failed to send concierge room payment notification:', conciergeEmailResponse.error);
        } else {
          console.log('Concierge room payment notification sent:', conciergeEmailResponse.data);
        }
      } catch (conciergeEmailError) {
        console.error('Error sending concierge room payment notification:', conciergeEmailError);
        // Continue even if concierge email fails
      }

      // Attempt PMS auto-charge (non-blocking, concierge already notified as fallback)
      if (hotel.pms_auto_charge_room && hotel.pms_type) {
        try {
          console.log('Attempting PMS auto-charge for booking:', bookingId, 'pms_type:', hotel.pms_type);
          const pmsResponse = await supabase.functions.invoke('pms-post-charge', {
            body: { bookingId: bookingId }
          });

          if (pmsResponse.error || pmsResponse.data?.fallbackToManual) {
            console.log('PMS auto-charge failed, manual process required:', pmsResponse.error || pmsResponse.data?.error);
          } else {
            console.log('PMS charge posted successfully:', pmsResponse.data?.chargeId);
          }
        } catch (pmsError) {
          console.error('Error during PMS auto-charge:', pmsError);
          // Silent fail — concierge notification already sent
        }
      }
    }

    await tryMarkCheckoutIntentConverted(supabase, checkoutIntentId, bookingId, '[create-client-booking]');
    };

    // Respond as soon as the booking exists; run notifications in the background.
    await runInBackground(runBookingNotifications(), 'Background booking notifications');

    return new Response(
      JSON.stringify({
        success: true,
        bookingId: bookingId,
        bookingNumber: booking?.booking_id ?? null,
        ...(bundleWarning ? { bundleWarning } : {}),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in create-client-booking:', error);
    log.error('booking.creation_failed', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'An unexpected error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  } finally {
    await log.flush();
  }
});
