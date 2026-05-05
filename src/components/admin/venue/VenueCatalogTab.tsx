import { VenueCategoriesStep } from "@/components/admin/steps/VenueCategoriesStep";

interface VenueCatalogTabProps {
  hotelId: string;
  venueType?: string;
}

export function VenueCatalogTab({ hotelId }: VenueCatalogTabProps) {
  return <VenueCategoriesStep hotelId={hotelId} />;
}
