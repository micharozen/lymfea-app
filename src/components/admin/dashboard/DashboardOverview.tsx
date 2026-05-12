import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HotelOverviewRow } from "@/hooks/useDashboardData";

interface DashboardOverviewProps {
  hotelData: HotelOverviewRow[];
}

export function DashboardOverview({ hotelData }: DashboardOverviewProps) {
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
                  <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3">
                    Lieu
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3 text-right">
                    Ventes
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3 text-right">
                    Réservations
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3 text-right">
                    Sessions
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium text-xs uppercase tracking-wider whitespace-nowrap px-6 py-3 text-right">
                    Annulations
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hotelData.map((hotel, i) => (
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
