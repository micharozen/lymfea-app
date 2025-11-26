-- Créer le trigger pour notifier les coiffeurs lors d'une nouvelle réservation
CREATE TRIGGER notify_hairdressers_on_new_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hairdressers_new_booking();

-- Créer le trigger pour notifier le coiffeur lors d'une assignation
CREATE TRIGGER notify_hairdresser_on_booking_assignment
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hairdresser_on_assignment();

-- Créer le trigger pour notifier le coiffeur lors d'une annulation
CREATE TRIGGER notify_hairdresser_on_booking_cancellation
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hairdresser_on_cancellation();

-- Créer le trigger pour notifier les coiffeurs lors d'une réassignation
CREATE TRIGGER notify_hairdressers_on_booking_unassignment
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hairdressers_on_unassignment();

-- Créer le trigger pour notifier les admins lors d'une demande de validation
CREATE TRIGGER notify_admins_on_booking_completion_request
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_completion_request();