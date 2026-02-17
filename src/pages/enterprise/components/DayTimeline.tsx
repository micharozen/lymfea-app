import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Coffee, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionBooking, BlockedSlot } from '../hooks/useEnterpriseDashboard';

interface DayTimelineProps {
  openingTime: string;
  closingTime: string;
  slotInterval?: number;
  bookings: SessionBooking[];
  blockedSlots: BlockedSlot[];
}

interface TimeSlot {
  time: string;
  type: 'available' | 'booked' | 'blocked' | 'continuation';
  booking?: SessionBooking;
  blockedLabel?: string;
}

function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function DayTimeline({ openingTime, closingTime, slotInterval = 30, bookings, blockedSlots }: DayTimelineProps) {
  const { t } = useTranslation('client');

  const slots = useMemo(() => {
    const openMin = timeToMinutes(openingTime || '06:00');
    const closeMin = timeToMinutes(closingTime || '23:00');
    const result: TimeSlot[] = [];

    // Track which slot windows are occupied by bookings (considering duration)
    const bookingMap = new Map<number, SessionBooking>();
    const continuationSet = new Set<number>();

    for (const booking of bookings) {
      const startMin = timeToMinutes(booking.booking_time);
      const durationSlots = Math.ceil(booking.duration / slotInterval);
      for (let i = 0; i < durationSlots; i++) {
        const slotMin = startMin + i * slotInterval;
        if (i === 0) {
          bookingMap.set(slotMin, booking);
        } else {
          continuationSet.add(slotMin);
        }
      }
    }

    // Track blocked ranges
    const isBlocked = (slotMin: number): BlockedSlot | undefined => {
      return blockedSlots.find(bs => {
        const bStart = timeToMinutes(bs.start_time);
        const bEnd = timeToMinutes(bs.end_time);
        return slotMin >= bStart && slotMin < bEnd;
      });
    };

    // Generate all slots based on interval
    for (let min = openMin; min < closeMin; min += slotInterval) {
      const timeStr = `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}:00`;

      if (continuationSet.has(min)) {
        result.push({ time: timeStr, type: 'continuation', booking: bookingMap.get(min) });
      } else if (bookingMap.has(min)) {
        result.push({ time: timeStr, type: 'booked', booking: bookingMap.get(min)! });
      } else {
        const blocked = isBlocked(min);
        if (blocked) {
          result.push({ time: timeStr, type: 'blocked', blockedLabel: blocked.label });
        } else {
          result.push({ time: timeStr, type: 'available' });
        }
      }
    }

    return result;
  }, [openingTime, closingTime, slotInterval, bookings, blockedSlots]);

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="font-serif text-lg text-gray-900 mb-4">
          {t('enterpriseDashboard.timeline.title')}
        </h2>

        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-gray-100">
          <div className="space-y-0">
            {slots.map((slot, idx) => {
            if (slot.type === 'continuation') return null;

            const durationSlots = slot.booking
              ? Math.ceil(slot.booking.duration / slotInterval)
              : 1;

            return (
              <div
                key={slot.time}
                className={cn(
                  'flex items-stretch gap-3 sm:gap-4 border-b border-gray-50 last:border-0',
                  slot.type === 'booked' && 'bg-gold-50/50',
                  slot.type === 'blocked' && 'bg-gray-50',
                  slot.type === 'available' && 'bg-white',
                )}
              >
                {/* Time label */}
                <div className="w-14 sm:w-16 flex-shrink-0 py-3 pl-2 text-right">
                  <span className="text-xs sm:text-sm font-light text-gray-400 tabular-nums">
                    {formatTime(slot.time)}
                  </span>
                </div>

                {/* Color bar */}
                <div className={cn(
                  'w-0.5 flex-shrink-0',
                  slot.type === 'booked' && 'bg-gold-400',
                  slot.type === 'blocked' && 'bg-gray-300',
                  slot.type === 'available' && 'bg-gray-100',
                )} />

                {/* Content */}
                <div className={cn(
                  'flex-1 py-3 pr-3',
                  durationSlots > 1 && `min-h-[${durationSlots * 44}px]`
                )}>
                  {slot.type === 'booked' && slot.booking && (
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-gold-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5 text-gold-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {slot.booking.client_first_name} {slot.booking.client_last_name}
                        </p>
                        <p className="text-xs text-gray-500 font-light">
                          {slot.booking.treatments.map(tr => tr.name).join(', ')}
                          {' '}
                          <span className="text-gray-300">•</span>
                          {' '}
                          {slot.booking.duration} min
                        </p>
                      </div>
                    </div>
                  )}

                  {slot.type === 'blocked' && (
                    <div className="flex items-center gap-2 py-0.5">
                      <Coffee className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs italic text-gray-400">
                        {slot.blockedLabel}
                      </span>
                    </div>
                  )}

                  {slot.type === 'available' && (
                    <div className="flex items-center gap-2 py-0.5">
                      <Clock className="w-3.5 h-3.5 text-gray-200" />
                      <span className="text-xs text-gray-300 font-light">
                        {t('enterpriseDashboard.timeline.available')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
