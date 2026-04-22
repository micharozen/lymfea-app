import { useState } from "react";
import { Users, DoorOpen } from "lucide-react";
import { VenueTreatmentRoomsTab } from "@/components/admin/venue/VenueTreatmentRoomsTab";
import { VenueTherapistsTab } from "@/components/admin/venue/VenueTherapistsTab";
import { PillSubTabs, type SubTabDef } from "@/components/admin/venue/VenueSectionNav";

interface VenueResourcesTabProps {
  hotelId: string;
  hotelName: string;
}

const TABS: SubTabDef[] = [
  { id: "therapists", label: "Thérapeutes", icon: Users },
  { id: "rooms", label: "Salles", icon: DoorOpen },
];

export function VenueResourcesTab({ hotelId, hotelName }: VenueResourcesTabProps) {
  const [active, setActive] = useState("therapists");

  return (
    <div className="w-full">
      <PillSubTabs tabs={TABS} value={active} onValueChange={setActive} />

      {active === "therapists" && <VenueTherapistsTab hotelId={hotelId} />}
      {active === "rooms" && (
        <VenueTreatmentRoomsTab hotelId={hotelId} hotelName={hotelName} />
      )}
    </div>
  );
}
