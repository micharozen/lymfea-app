import { useState } from "react";
import { Tag, Sparkles } from "lucide-react";
import { VenueCategoriesStep } from "@/components/admin/steps/VenueCategoriesStep";
import { VenueAmenitiesTab } from "@/components/admin/venue/VenueAmenitiesTab";
import { PillSubTabs, type SubTabDef } from "@/components/admin/venue/VenueSectionNav";

interface VenueCatalogTabProps {
  hotelId: string;
  venueType?: string;
}

const TABS: SubTabDef[] = [
  { id: "categories", label: "Catégories", icon: Tag },
  { id: "amenities", label: "Commodités", icon: Sparkles },
];

export function VenueCatalogTab({ hotelId, venueType }: VenueCatalogTabProps) {
  const [active, setActive] = useState("categories");

  return (
    <div className="w-full">
      <PillSubTabs tabs={TABS} value={active} onValueChange={setActive} />

      {active === "categories" && <VenueCategoriesStep hotelId={hotelId} />}
      {active === "amenities" && (
        <VenueAmenitiesTab hotelId={hotelId} venueType={venueType} />
      )}
    </div>
  );
}
