import hotelLogo from "@/assets/client-types/hotel.svg";
import staycationLogo from "@/assets/client-types/staycation.svg";
import classpassLogo from "@/assets/client-types/classpass.svg";
import externalLogo from "@/assets/client-types/external.svg";

export type BookingClientType = "hotel" | "staycation" | "classpass" | "external";

export const BOOKING_CLIENT_TYPES: BookingClientType[] = [
  "hotel",
  "staycation",
  "classpass",
  "external",
];

export interface ClientTypeMeta {
  logo: string;
  labelKey: string;
  colorClass: string;
  iconIsBrand: boolean;
}

export const CLIENT_TYPE_META: Record<BookingClientType, ClientTypeMeta> = {
  hotel: {
    logo: hotelLogo,
    labelKey: "bookings.clientType.hotel",
    colorClass: "bg-primary/10 text-primary border-primary/20",
    iconIsBrand: false,
  },
  staycation: {
    logo: staycationLogo,
    labelKey: "bookings.clientType.staycation",
    colorClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800",
    iconIsBrand: true,
  },
  classpass: {
    logo: classpassLogo,
    labelKey: "bookings.clientType.classpass",
    colorClass: "bg-neutral-100 text-neutral-900 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:border-neutral-700",
    iconIsBrand: true,
  },
  external: {
    logo: externalLogo,
    labelKey: "bookings.clientType.external",
    colorClass: "bg-muted text-muted-foreground border-border",
    iconIsBrand: false,
  },
};
