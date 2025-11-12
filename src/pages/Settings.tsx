import { Search, Plus, User, Mail, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Settings() {
  const admins = [
    {
      id: 1,
      name: "Tom Uzan",
      email: "tom@oomworld.com",
      phone: "+33 6 14 21 64 42",
      status: "Actif",
    },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-8">Paramètres & Accès</h1>
      </div>

      <div className="max-w-6xl">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Admin</h2>
          
          <div className="relative w-64 mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher"
              className="pl-10"
            />
          </div>
        </div>

        <Card className="border border-border bg-card shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-muted-foreground font-normal w-[40px]">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-normal">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Nom
                    </div>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-normal">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </div>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-normal">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Numéro de téléphone
                    </div>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-normal">
                    Statut
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell>
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{admin.name}</TableCell>
                    <TableCell>
                      <a href={`mailto:${admin.email}`} className="text-primary hover:underline">
                        {admin.email}
                      </a>
                    </TableCell>
                    <TableCell>{admin.phone}</TableCell>
                    <TableCell>
                      <Badge className="bg-success/10 text-success hover:bg-success/20 border-0">
                        {admin.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
