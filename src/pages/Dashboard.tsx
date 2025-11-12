import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

const salesData = [
  { date: "10 octobre", sales: 0 },
  { date: "20 octobre", sales: 0 },
  { date: "25 octobre", sales: 0 },
  { date: "30 octobre", sales: 750 },
  { date: "5 novembre", sales: 0 },
  { date: "10 novembre", sales: 0 },
];

const hotelData = [
  {
    name: "Hôtel Sofitel Paris le Faubourg",
    totalSales: "€0.00",
    totalBookings: 0,
    totalSessions: 16,
    totalCancelled: 3,
  },
];

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🏠</span>
          <h1 className="text-3xl font-bold text-foreground">Home</h1>
        </div>
        <div className="flex justify-end">
          <span className="text-sm text-muted-foreground">Last 30 days</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Sales"
          value="£739.00"
          trend={{ value: "100.00%", isPositive: true }}
        />
        <StatCard
          title="Total Upcoming Booking"
          value={9}
        />
        <StatCard
          title="Total Bookings"
          value={1}
          trend={{ value: "100.00%", isPositive: true }}
        />
        <StatCard
          title="Total Sessions"
          value={20}
          trend={{ value: "100.00%", isPositive: true }}
        />
      </div>

      <Card className="mb-8 border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Total Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                stroke="#666"
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                stroke="#666"
                domain={[0, 800]}
                ticks={[0, 100, 200, 300, 400, 500, 600, 700, 800]}
                tickFormatter={(value) => `£ ${value}`}
              />
              <Line
                type="monotone"
                dataKey="sales"
                stroke="#000000"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground font-normal">Hotel name</TableHead>
                <TableHead className="text-muted-foreground font-normal">Total sales</TableHead>
                <TableHead className="text-muted-foreground font-normal">Total bookings</TableHead>
                <TableHead className="text-muted-foreground font-normal">Total sessions</TableHead>
                <TableHead className="text-muted-foreground font-normal">Total cancelled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hotelData.map((hotel, index) => (
                <TableRow key={index}>
                  <TableCell className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-xs">
                      🏨
                    </div>
                    <span className="font-medium">{hotel.name}</span>
                  </TableCell>
                  <TableCell>{hotel.totalSales}</TableCell>
                  <TableCell>{hotel.totalBookings}</TableCell>
                  <TableCell>{hotel.totalSessions}</TableCell>
                  <TableCell>{hotel.totalCancelled}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
