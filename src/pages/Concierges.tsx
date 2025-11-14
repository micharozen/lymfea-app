import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AddConciergeDialog } from "@/components/AddConciergeDialog";

interface Concierge {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country_code: string;
  hotel_id: string | null;
  profile_image: string | null;
  status: string;
  hotels?: { hotel_id: string }[];
}

export default function Concierges() {
  const [concierges, setConcierges] = useState<Concierge[]>([]);
  const [filteredConcierges, setFilteredConcierges] = useState<Concierge[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    fetchConcierges();
  }, []);

  useEffect(() => {
    filterConcierges();
  }, [concierges, searchQuery, hotelFilter, statusFilter]);

  const fetchConcierges = async () => {
    try {
      const { data, error } = await supabase
        .from("concierges")
        .select(`
          *,
          hotels:concierge_hotels(hotel_id)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setConcierges(data || []);
    } catch (error: any) {
      toast.error("Erreur lors du chargement des concierges");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterConcierges = () => {
    let filtered = [...concierges];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.first_name.toLowerCase().includes(query) ||
          c.last_name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query)
      );
    }

    if (hotelFilter !== "all") {
      filtered = filtered.filter((c) => c.hotel_id === hotelFilter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    setFilteredConcierges(filtered);
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getHotelName = (hotelId: string | null) => {
    if (!hotelId) return "Non assigné";
    const hotelMap: Record<string, string> = {
      "mandarin-london": "Mandarin Oriental Hyde Park, London",
      "sofitel-paris": "Hôtel Sofitel Paris le Faubourg",
      "test": "TEST",
    };
    return hotelMap[hotelId] || hotelId;
  };

  const getHotelNames = (hotels?: { hotel_id: string }[]) => {
    if (!hotels || hotels.length === 0) return "Non assigné";
    return hotels.map((h) => getHotelName(h.hotel_id)).join(", ");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-8">🛎️ Concierges</h1>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={hotelFilter} onValueChange={setHotelFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les hôtels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les hôtels</SelectItem>
                <SelectItem value="mandarin-london">Mandarin Oriental</SelectItem>
                <SelectItem value="sofitel-paris">Hôtel Sofitel</SelectItem>
                <SelectItem value="test">TEST</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="Actif">Actif</SelectItem>
                <SelectItem value="En attente">En attente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-card rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border">
                <TableHead className="text-muted-foreground font-normal py-4">
                  <div className="flex items-center gap-3">
                    <span>Nom</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 hover:bg-muted"
                      onClick={() => setShowAddDialog(true)}
                    >
                      <Plus className="h-4 w-4 text-foreground" />
                    </Button>
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground font-normal py-4">Email</TableHead>
                <TableHead className="text-muted-foreground font-normal py-4">Numéro de téléphone</TableHead>
                <TableHead className="text-muted-foreground font-normal py-4">Hôtel</TableHead>
                <TableHead className="text-muted-foreground font-normal py-4">Statut</TableHead>
                <TableHead className="text-muted-foreground font-normal py-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConcierges.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Aucun concierge trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredConcierges.map((concierge) => (
                  <TableRow key={concierge.id} className="border-b border-border">
                    <TableCell className="py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                          {concierge.profile_image ? (
                            <img src={concierge.profile_image} alt="Profile" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">
                              {getInitials(concierge.first_name, concierge.last_name)}
                            </span>
                          )}
                        </div>
                        <span className="font-medium text-sm">
                          {concierge.first_name} {concierge.last_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-5">
                      <span className="text-sm text-foreground">{concierge.email}</span>
                    </TableCell>
                    <TableCell className="py-5">
                      <span className="text-sm text-foreground">
                        {concierge.country_code} {concierge.phone}
                      </span>
                    </TableCell>
                    <TableCell className="py-5">
                      <span className="text-sm text-foreground">{getHotelNames(concierge.hotels)}</span>
                    </TableCell>
                    <TableCell className="py-5">
                      <span className={cn(
                        "font-medium text-sm",
                        concierge.status === "Actif" && "text-success",
                        concierge.status === "En attente" && "text-orange-500"
                      )}>
                        {concierge.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-5">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <AddConciergeDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onSuccess={fetchConcierges}
        />
      </div>
    </div>
  );
}
