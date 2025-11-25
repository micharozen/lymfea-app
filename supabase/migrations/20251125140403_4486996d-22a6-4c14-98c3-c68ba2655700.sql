-- Fonction pour notifier les admins quand un booking est en attente de validation
CREATE OR REPLACE FUNCTION public.notify_admins_on_completion_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  -- Vérifier si le statut vient de passer à "En attente de validation"
  IF NEW.status = 'En attente de validation' AND (OLD.status IS NULL OR OLD.status != 'En attente de validation') THEN
    
    -- Créer une notification pour chaque admin actif
    FOR admin_record IN (
      SELECT a.user_id, a.first_name, a.last_name
      FROM public.admins a
      WHERE a.user_id IS NOT NULL
        AND a.status = 'Actif'
    ) LOOP
      
      INSERT INTO public.notifications (
        user_id,
        booking_id,
        type,
        message
      ) VALUES (
        admin_record.user_id,
        NEW.id,
        'completion_request',
        'Demande de validation pour la réservation #' || NEW.booking_id || 
        ' - ' || NEW.client_first_name || ' ' || NEW.client_last_name || 
        ' à ' || COALESCE(NEW.hotel_name, 'l''hôtel') || 
        ' le ' || TO_CHAR(NEW.booking_date, 'DD/MM/YYYY')
      );
      
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Créer le trigger pour la table bookings
DROP TRIGGER IF EXISTS notify_admins_on_completion_request_trigger ON public.bookings;
CREATE TRIGGER notify_admins_on_completion_request_trigger
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_on_completion_request();