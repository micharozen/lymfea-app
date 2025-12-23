import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getBookingStatusConfig,
  getPaymentStatusConfig,
  getEntityStatusConfig,
  type BookingStatus,
  type PaymentStatus,
  type EntityStatus,
} from "@/utils/statusStyles";

interface StatusBadgeProps {
  status: string;
  type?: 'booking' | 'payment' | 'entity';
  variant?: 'badge' | 'card';
  className?: string;
  showLabel?: boolean;
  customLabel?: string;
}

export function StatusBadge({
  status,
  type = 'entity',
  variant = 'badge',
  className,
  showLabel = true,
  customLabel,
}: StatusBadgeProps) {
  const getConfig = () => {
    switch (type) {
      case 'booking':
        return getBookingStatusConfig(status);
      case 'payment':
        return getPaymentStatusConfig(status);
      case 'entity':
      default:
        return getEntityStatusConfig(status);
    }
  };

  const config = getConfig();
  const styleClass = variant === 'card' ? config.cardClass : config.badgeClass;
  const label = customLabel || (showLabel ? config.label : status);

  return (
    <Badge
      className={cn(
        "font-medium border",
        styleClass,
        className
      )}
    >
      {label}
    </Badge>
  );
}

export default StatusBadge;
