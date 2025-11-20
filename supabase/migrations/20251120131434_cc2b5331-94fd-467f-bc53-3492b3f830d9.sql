-- Créer une fonction pour notifier les coiffeurs lors de leur assignation
CREATE OR REPLACE FUNCTION public.notify_hairdresser_on_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  hairdresser_user_id UUID;
BEGIN
  -- Vérifier si un coiffeur a été assigné (nouveau ou changé)
  IF NEW.hairdresser_id IS NOT NULL AND 
     (OLD.hairdresser_id IS NULL OR OLD.hairdresser_id != NEW.hairdresser_id) THEN
    
    -- Récupérer le user_id du coiffeur assigné
    SELECT user_id INTO hairdresser_user_id
    FROM public.hairdressers
    WHERE id = NEW.hairdresser_id;

    -- Si le coiffeur a un user_id, créer une notification
    IF hairdresser_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        hairdresser_user_id,
        NEW.id,
        'booking_assigned',
        'Vous avez été assigné(e) à la réservation #' || NEW.booking_id || 
        ' pour le ' || TO_CHAR(NEW.booking_date, 'DD/MM/YYYY') || 
        ' à ' || TO_CHAR(NEW.booking_time, 'HH24:MI')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Créer le trigger pour notifier lors de l'assignation
DROP TRIGGER IF EXISTS trigger_notify_hairdresser_assignment ON public.bookings;

CREATE TRIGGER trigger_notify_hairdresser_assignment
  AFTER INSERT OR UPDATE OF hairdresser_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hairdresser_on_assignment();