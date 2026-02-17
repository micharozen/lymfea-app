import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useBasket } from '../context/CartContext';
import { useClientFlow, type BookingDateTime, type ClientInfo } from '../context/FlowContext';

export function useCreateOffertBooking(hotelId: string | undefined) {
  const navigate = useNavigate();
  const { t } = useTranslation('client');
  const { items, clearBasket } = useBasket();
  const { clearFlow } = useClientFlow();
  const [isCreating, setIsCreating] = useState(false);

  const createOffertBooking = useCallback(async (
    clientInfo: ClientInfo,
    bookingDateTime: BookingDateTime,
  ) => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-client-booking', {
        body: {
          hotelId,
          clientData: {
            firstName: clientInfo.firstName,
            lastName: clientInfo.lastName,
            phone: `${clientInfo.countryCode}${clientInfo.phone}`,
            email: clientInfo.email,
            roomNumber: clientInfo.roomNumber,
            note: clientInfo.note || '',
          },
          bookingData: {
            date: bookingDateTime.date,
            time: bookingDateTime.time,
          },
          treatments: items.map(item => ({
            treatmentId: item.id,
            quantity: item.quantity,
            note: item.note,
          })),
          paymentMethod: 'offert',
          totalPrice: 0,
        },
      });

      if (error) throw error;

      clearBasket();
      clearFlow();
      navigate(`/client/${hotelId}/confirmation/${data.bookingId}`);
    } catch (error) {
      console.error('Offert booking error:', error);
      const errorMessage = error instanceof Error ? error.message : t('common:errors.generic');
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
    }
  }, [hotelId, items, navigate, clearBasket, clearFlow, t]);

  return { createOffertBooking, isCreating };
}
