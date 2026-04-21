import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VenueCategoriesStep } from "@/components/admin/steps/VenueCategoriesStep";
import { VenueAmenitiesTab } from "@/components/admin/venue/VenueAmenitiesTab";

interface VenueCatalogTabProps {
  hotelId: string;
  venueType?: string;
}

export function VenueCatalogTab({ hotelId, venueType }: VenueCatalogTabProps) {
  return (
    <Tabs defaultValue="categories" className="w-full">
      <TabsList className="w-full justify-start bg-transparent rounded-none border-b p-0 h-auto mb-4">
        <TabsTrigger
          value="categories"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
        >
          Catégories
        </TabsTrigger>
        <TabsTrigger
          value="amenities"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-2.5 pt-1.5"
        >
          Commodités
        </TabsTrigger>
      </TabsList>

      <TabsContent value="categories" className="mt-0">
        <VenueCategoriesStep hotelId={hotelId} />
      </TabsContent>

      <TabsContent value="amenities" className="mt-0">
        <VenueAmenitiesTab hotelId={hotelId} venueType={venueType} />
      </TabsContent>
    </Tabs>
  );
}
