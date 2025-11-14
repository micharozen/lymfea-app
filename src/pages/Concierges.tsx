import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Bell } from "lucide-react";
import { toast } from "sonner";

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
}

export default function Concierges() {
  const [concierges, setConcierges] = useState<Concierge[]>([]);
  const [filteredConcierges, setFilteredConcierges] = useState<Concierge[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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
        .select("*")
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="container mx-auto max-w-7xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
            <Bell className="w-6 h-6 text-orange-500" />
          </div>
          <h1 className="text-4xl font-bold text-foreground">Concierges</h1>
        </div>

        <div className="flex flex-wrap gap-4 mb-6">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={hotelFilter} onValueChange={setHotelFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by hotel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les hôtels</SelectItem>
              <SelectItem value="mandarin-london">Mandarin Oriental</SelectItem>
              <SelectItem value="sofitel-paris">Hôtel Sofitel</SelectItem>
              <SelectItem value="test">TEST</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="Actif">Active</SelectItem>
              <SelectItem value="En attente">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr className="text-left">
                  <th className="px-6 py-4 text-sm font-medium text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Name
                    </div>
                  </th>
                  <th className="px-6 py-4 text-sm font-medium text-muted-foreground">@ Email</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted-foreground">📞 Phone number</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted-foreground">🏨 Hotels</th>
                  <th className="px-6 py-4 text-sm font-medium text-muted-foreground text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredConcierges.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      Aucun concierge trouvé
                    </td>
                  </tr>
                ) : (
                  filteredConcierges.map((concierge) => (
                    <tr
                      key={concierge.id}
                      className="border-b border-border last:border-0 hover:bg-muted/5 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={concierge.profile_image || undefined} />
                            <AvatarFallback className="bg-muted">
                              {getInitials(concierge.first_name, concierge.last_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground">
                            {concierge.first_name} {concierge.last_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <a href={`mailto:${concierge.email}`} className="text-primary hover:underline">
                          {concierge.email}
                        </a>
                      </td>
                      <td className="px-6 py-4 text-foreground">
                        {concierge.country_code} {concierge.phone}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs">
                            🏨
                          </div>
                          <span className="text-foreground">{getHotelName(concierge.hotel_id)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Badge
                          variant={concierge.status === "Actif" ? "default" : "secondary"}
                          className={
                            concierge.status === "Actif"
                              ? "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {concierge.status === "Actif" ? "Active" : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <Button size="lg" className="gap-2">
            <Plus className="w-5 h-5" />
            Ajouter un concierge
          </Button>
        </div>
      </div>
    </div>
  );
}
