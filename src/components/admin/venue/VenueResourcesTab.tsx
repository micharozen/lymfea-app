import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VenueTreatmentRoomsTab } from "@/components/admin/venue/VenueTreatmentRoomsTab";
import { VenueTherapistsTab } from "@/components/admin/venue/VenueTherapistsTab";

interface VenueResourcesTabProps {
  hotelId: string;
  hotelName: string;
}

export function VenueResourcesTab({ hotelId, hotelName }: VenueResourcesTabProps) {
  return (
    <Tabs defaultValue="therapists" className="w-full">
      <TabsList className="w-full justify-start bg-transparent rounded-none border-b p-0 h-auto mb-4">
        <TabsTrigger
          value="therapists"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
        >
          Thérapeutes
        </TabsTrigger>
        <TabsTrigger
          value="rooms"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
        >
          Salles
        </TabsTrigger>
      </TabsList>

      <TabsContent value="therapists" className="mt-0">
        <VenueTherapistsTab hotelId={hotelId} />
      </TabsContent>

      <TabsContent value="rooms" className="mt-0">
        <VenueTreatmentRoomsTab hotelId={hotelId} hotelName={hotelName} />
      </TabsContent>
    </Tabs>
  );
}
