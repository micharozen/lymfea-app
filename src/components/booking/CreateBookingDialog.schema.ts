import * as z from "zod";
import { TFunction } from "i18next";

export const createFormSchema = (t: TFunction) => z.object({
  hotelId: z.string().min(1, t('errors.validation.hotelRequired')),
  therapistId: z.string().default(""),
  date: z.date({ required_error: t('errors.validation.dateRequired') }),
  time: z.string().min(1, t('errors.validation.timeRequired')),
  // Alternative slots (concierge only)
  slot2Date: z.date().optional(),
  slot2Time: z.string().optional(),
  slot3Date: z.date().optional(),
  slot3Time: z.string().optional(),
  clientType: z.enum(['hotel', 'staycation', 'classpass', 'external']).default('external'),
  clientFirstName: z.string().min(1, t('errors.validation.firstNameRequired')),
  clientLastName: z.string().min(1, t('errors.validation.lastNameRequired')),
  clientEmail: z.string().email(t('errors.validation.emailInvalid')).optional().or(z.literal('')), 
  phone: z.string().min(1, t('errors.validation.phoneRequired')),
  countryCode: z.string().default("+33"),
  roomNumber: z.string().default(""),
  roomNumberLater: z.boolean().default(false),
  clientNote: z.string().default(""),
  payByVoucher: z.boolean().default(false),
  voucherReference: z.string().default(""),
}).refine(data => {
  // If slot 2 is partially filled, both date and time are required
  if ((data.slot2Date && !data.slot2Time) || (!data.slot2Date && data.slot2Time)) return false;
  if ((data.slot3Date && !data.slot3Time) || (!data.slot3Date && data.slot3Time)) return false;
  return true;
}, { message: "Veuillez remplir la date et l'heure pour chaque créneau", path: ["slot2Date"] })
.refine(data => {
  // Room number required when clientType === 'hotel' (unless deferred)
  if (data.clientType === 'hotel' && !data.roomNumberLater && !data.roomNumber.trim()) return false;
  return true;
}, { message: "Le numéro de chambre est requis pour un client hôtel", path: ["roomNumber"] });

export type BookingFormValues = z.infer<ReturnType<typeof createFormSchema>>;

export interface CartItem {
  treatmentId: string;
  quantity: number;
}

export interface CreateBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
  selectedTime?: string;
  presetHotelId?: string;
}
