import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, DoorOpen } from "lucide-react";
import { VenueTreatmentRoomsTab } from "@/components/admin/venue/VenueTreatmentRoomsTab";
import { VenueTherapistsTab } from "@/components/admin/venue/VenueTherapistsTab";
import { PillSubTabs, type SubTabDef } from "@/components/admin/venue/VenueSectionNav";

interface VenueResourcesTabProps {
  hotelId: string;
  hotelName: string;
}

export function VenueResourcesTab({ hotelId, hotelName }: VenueResourcesTabProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [active, setActive] = useState("therapists");

  const tabs: SubTabDef[] = useMemo(
    () => [
      { id: "therapists", label: t("venueResourcesTab.therapists"), icon: Users },
      { id: "rooms", label: t("venueResourcesTab.rooms"), icon: DoorOpen },
    ],
    [t],
  );

  return (
    <div className="w-full">
      <PillSubTabs tabs={tabs} value={active} onValueChange={setActive} />

      {active === "therapists" && <VenueTherapistsTab hotelId={hotelId} />}
      {active === "rooms" && (
        <VenueTreatmentRoomsTab hotelId={hotelId} hotelName={hotelName} />
      )}
    </div>
  );
}
