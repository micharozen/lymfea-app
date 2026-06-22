import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/table/SortableTableHead";
import { useTableSort } from "@/hooks/useTableSort";
import type { HotelOverviewRow } from "@/hooks/useDashboardData";

interface DashboardOverviewProps {
  hotelData: HotelOverviewRow[];
}

type OverviewColumn = "name" | "totalSales" | "totalBookings" | "totalSessions" | "totalCancelled";

const headClassName =
  "text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3";

export function DashboardOverview({ hotelData }: DashboardOverviewProps) {
  const { getSortDirection, toggleSort, sortItems } = useTableSort<OverviewColumn>();

  const sortedData = sortItems(hotelData, (row, column) =>
    column === "totalSales" ? row.totalSalesValue : row[column]
  );

  return (
    <Card className="border border-border bg-card shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium text-foreground">Vue d&apos;ensemble</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {hotelData.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/50 hover:bg-transparent">
                  <SortableTableHead
                    column="name"
                    sortDirection={getSortDirection("name")}
                    onSort={(c) => toggleSort(c as OverviewColumn)}
                    className={headClassName}
                  >
                    Lieu
                  </SortableTableHead>
                  <SortableTableHead
                    column="totalSales"
                    sortDirection={getSortDirection("totalSales")}
                    onSort={(c) => toggleSort(c as OverviewColumn)}
                    align="right"
                    className={headClassName}
                  >
                    Ventes
                  </SortableTableHead>
                  <SortableTableHead
                    column="totalBookings"
                    sortDirection={getSortDirection("totalBookings")}
                    onSort={(c) => toggleSort(c as OverviewColumn)}
                    align="right"
                    className={headClassName}
                  >
                    Réservations
                  </SortableTableHead>
                  <SortableTableHead
                    column="totalSessions"
                    sortDirection={getSortDirection("totalSessions")}
                    onSort={(c) => toggleSort(c as OverviewColumn)}
                    align="right"
                    className={headClassName}
                  >
                    Sessions
                  </SortableTableHead>
                  <SortableTableHead
                    column="totalCancelled"
                    sortDirection={getSortDirection("totalCancelled")}
                    onSort={(c) => toggleSort(c as OverviewColumn)}
                    align="right"
                    className={headClassName}
                  >
                    Annulations
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((hotel, i) => (
                  <TableRow key={i} className="border-b border-border/30 last:border-0">
                    <TableCell className="py-4 px-6 whitespace-nowrap">
                      <span className="font-medium text-base text-foreground">{hotel.name}</span>
                    </TableCell>
                    <TableCell className="py-4 px-6 whitespace-nowrap text-right font-medium tabular-nums">
                      {hotel.totalSales}
                    </TableCell>
                    <TableCell className="py-4 px-6 whitespace-nowrap text-right font-medium tabular-nums text-muted-foreground">
                      {hotel.totalBookings}
                    </TableCell>
                    <TableCell className="py-4 px-6 whitespace-nowrap text-right font-medium tabular-nums text-muted-foreground">
                      {hotel.totalSessions}
                    </TableCell>
                    <TableCell className="py-4 px-6 whitespace-nowrap text-right font-medium tabular-nums text-muted-foreground">
                      {hotel.totalCancelled}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-12 text-center px-6">
            <p className="text-muted-foreground">Aucun lieu trouvé</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
