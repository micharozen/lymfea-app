// Public "Add to calendar" endpoint. The confirmation email's calendar button
// links here (GET ?b=<booking uuid>); we return a text/calendar (.ics) file so
// the client can add the appointment to Apple/Google/Outlook calendars. The
// booking uuid is non-guessable, so no auth is required (verify_jwt = false),
// and the file reflects the booking's current time (stays correct after a
// reschedule). The .ics itself is built by the shared `buildBookingIcs` helper,
// which notify-booking-confirmed reuses to attach the same file to the email.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildBookingIcs } from "../_shared/ics.ts";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const bookingId = url.searchParams.get("b");
    if (!bookingId) {
      return new Response("Missing booking id", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: booking, error } = await supabase
      .from("bookings")
      .select(`
        id,
        booking_id,
        booking_date,
        booking_time,
        hotel_name,
        hotels(name, address, postal_code, city, country, timezone),
        booking_treatments(treatment_menus(name, duration))
      `)
      .eq("id", bookingId)
      .single();

    if (error || !booking) {
      return new Response("Booking not found", { status: 404 });
    }

    const venue = (booking as any).hotels as {
      name?: string | null;
      address?: string | null;
      postal_code?: string | null;
      city?: string | null;
      country?: string | null;
      timezone?: string | null;
    } | null;

    const treatments = ((booking as any).booking_treatments ?? [])
      .map((bt: any) => bt.treatment_menus)
      .filter(Boolean);

    const result = buildBookingIcs({
      id: booking.id,
      booking_id: booking.booking_id,
      booking_date: booking.booking_date,
      booking_time: booking.booking_time,
      venue_name: venue?.name || booking.hotel_name,
      timezone: venue?.timezone,
      address: venue?.address,
      postal_code: venue?.postal_code,
      city: venue?.city,
      country: venue?.country,
      treatments,
    });

    if (!result) {
      return new Response("Booking has no valid date/time", { status: 400 });
    }

    return new Response(result.ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[booking-ics] Error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
