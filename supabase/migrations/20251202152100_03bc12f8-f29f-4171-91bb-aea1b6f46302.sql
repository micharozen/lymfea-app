-- Drop duplicate triggers that insert into notifications table (causing double notifications)
DROP TRIGGER IF EXISTS notify_hairdressers_on_new_booking ON bookings;
DROP TRIGGER IF EXISTS notify_hairdresser_on_booking_assignment ON bookings;
DROP TRIGGER IF EXISTS trigger_notify_hairdresser_assignment ON bookings;
DROP TRIGGER IF EXISTS notify_admins_on_booking_completion_request ON bookings;
DROP TRIGGER IF EXISTS notify_admins_on_completion_request_trigger ON bookings;
DROP TRIGGER IF EXISTS notify_hairdresser_on_booking_cancellation ON bookings;
DROP TRIGGER IF EXISTS trigger_notify_cancellation ON bookings;
DROP TRIGGER IF EXISTS notify_hairdressers_on_booking_unassignment ON bookings;
DROP TRIGGER IF EXISTS trigger_notify_hairdressers_unassignment ON bookings;