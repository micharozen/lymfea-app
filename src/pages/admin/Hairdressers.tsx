import { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AddHairDresserDialog from "@/components/AddHairDresserDialog";
import EditHairDresserDialog from "@/components/EditHairDresserDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { HotelsCell, TrunksCell, PersonCell } from "@/components/table/EntityCell";
import { TablePagination } from "@/components/table/TablePagination";

interface Hotel {
  id: string;
  name: string;
  image: string | null;
}

interface Trunk {
  id: string;
  name: string;
  image: string | null;
}

interface HairDresser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  country_code: string;
  phone: string;
  profile_image: string | null;
  status: string;
  trunks: string | null;
  skills: string[];
  hairdresser_hotels?: { hotel_id: string }[];
}

export default function HairDresser() {
  const [hairdressers, setHairdressers] = useState<HairDresser[]>([]);
  const [filteredHairdressers, setFilteredHairdressers] = useState<HairDresser[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [trunks, setTrunks] = useState<Trunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hotelFilter, setHotelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedHairDresser, setSelectedHairDresser] = useState<HairDresser | null>(null);
  const [deleteHairDresserId, setDeleteHairDresserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const headerRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  // Auto-fit the number of rows so the page never needs scrolling
  const computeRows = useCallback(() => {
    const rowHeight = 40;
    const tableHeaderHeight = 32;
    const paginationHeight = 48;
    const sidebarOffset = 64;
    const pageHeaderHeight = headerRef.current?.offsetHeight || 100;
    const filtersHeight = filtersRef.current?.offsetHeight || 60;
    const chromePadding = 32;

    const usedHeight =
      pageHeaderHeight +
      filtersHeight +
      tableHeaderHeight +
      paginationHeight +
      sidebarOffset +
      chromePadding;

    const availableForRows = window.innerHeight - usedHeight;
    const rows = Math.max(5, Math.floor(availableForRows / rowHeight));

    setItemsPerPage(rows);
  }, []);

  useEffect(() => {
    computeRows();
    window.addEventListener("resize", computeRows);
    return () => window.removeEventListener("resize", computeRows);
  }, [computeRows]);

  // Force no scroll on this page only when pagination is needed
  const needsPagination = filteredHairdressers.length > itemsPerPage;
  
  useEffect(() => {
    if (!loading && needsPagination) {
      const prevHtmlOverflow = document.documentElement.style.overflow;
      const prevBodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prevHtmlOverflow;
        document.body.style.overflow = prevBodyOverflow;
      };
    }
  }, [loading, needsPagination]);

  useEffect(() => {
    fetchHairdressers();
    fetchHotels();
    fetchTrunks();
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!error && data) {
      setUserRole(data.role);
    }
  };

  const isAdmin = userRole === "admin";

  useEffect(() => {
    filterHairdressers();
  }, [searchQuery, hotelFilter, statusFilter, hairdressers]);

  const fetchHotels = async () => {
    const { data, error } = await supabase
      .from("hotels")
      .select("id, name, image")
      .order("name");

    if (error) {
      toast.error("Erreur lors du chargement des hôtels");
      return;
    }

    setHotels(data || []);
  };

  const fetchTrunks = async () => {
    const { data, error } = await supabase
      .from("trunks")
      .select("id, name, image")
      .order("name");

    if (error) {
      console.error("Erreur lors du chargement des trunks:", error);
      return;
    }

    setTrunks(data || []);
  };

  const fetchHairdressers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hairdressers")
      .select(`
        *,
        hairdresser_hotels(hotel_id)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erreur lors du chargement des coiffeurs");
      setLoading(false);
      return;
    }

    setHairdressers(data || []);
    setLoading(false);
  };

  const filterHairdressers = () => {
    let filtered = hairdressers;

    if (searchQuery) {
      filtered = filtered.filter(
        (hd) =>
          hd.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          hd.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          hd.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          hd.phone.includes(searchQuery)
      );
    }

    if (hotelFilter !== "all") {
      filtered = filtered.filter((hd) =>
        hd.hairdresser_hotels?.some((hh) => hh.hotel_id === hotelFilter)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((hd) => hd.status === statusFilter);
    }

    setFilteredHairdressers(filtered);
  };

  const getHotelsInfo = (hairdresserHotels?: { hotel_id: string }[]) => {
    if (!hairdresserHotels || hairdresserHotels.length === 0) {
      return [];
    }
    
    return hairdresserHotels
      .map((hh) => hotels.find((h) => h.id === hh.hotel_id))
      .filter(Boolean) as Hotel[];
  };

  const getSkillsDisplay = (skills: string[]) => {
    if (!skills || skills.length === 0) return "-";
    
    const skillMap: Record<string, string> = {
      men: "👨",
      women: "👩",
      barber: "💈",
      beauty: "💅",
    };

    const hasEmojiSkills = skills.some(skill => skillMap[skill]);
    
    if (hasEmojiSkills) {
      return skills.map((skill) => skillMap[skill] || "").filter(Boolean).join(" ");
    }
    
    return skills.join(", ");
  };

  const getTrunkInfo = (trunkIdOrName: string | null) => {
    if (!trunkIdOrName) return null;
    
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trunkIdOrName);
    
    if (isUuid) {
      return trunks.find((t) => t.id === trunkIdOrName) || null;
    }
    
    if (trunkIdOrName.includes(",")) {
      const firstItem = trunkIdOrName.split(",")[0].trim();
      const isItemUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firstItem);
      if (isItemUuid) {
        return trunks.find((t) => t.id === firstItem) || null;
      }
    }
    
    return null;
  };

  const getTrunkNames = (trunkIdOrName: string | null) => {
    if (!trunkIdOrName) return "-";
    
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trunkIdOrName);
    
    if (isUuid) {
      const trunk = trunks.find((t) => t.id === trunkIdOrName);
      return trunk?.name || "-";
    }
    
    if (trunkIdOrName.includes(",")) {
      const trunkNames = trunkIdOrName.split(",").map((item) => {
        const trimmed = item.trim();
        const isItemUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
        if (isItemUuid) {
          const trunk = trunks.find((t) => t.id === trimmed);
          return trunk?.name;
        }
        return trimmed;
      }).filter(Boolean);
      
      return trunkNames.length > 0 ? trunkNames.join(", ") : "-";
    }
    
    return trunkIdOrName;
  };

  const handleDelete = async () => {
    if (!deleteHairDresserId) return;

    const { error } = await supabase
      .from("hairdressers")
      .delete()
      .eq("id", deleteHairDresserId);

    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }

    toast.success("Coiffeur supprimé avec succès");
    setIsDeleteDialogOpen(false);
    setDeleteHairDresserId(null);
    fetchHairdressers();
  };

  const totalPages = Math.ceil(filteredHairdressers.length / itemsPerPage);
  const paginatedHairdressers = needsPagination
    ? filteredHairdressers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    : filteredHairdressers;

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  return (
    <div className={cn("bg-background flex flex-col", needsPagination ? "h-screen overflow-hidden" : "min-h-0")}>
      <div className="flex-shrink-0 px-6 pt-6" ref={headerRef}>
        <div className="mb-4">
          <h1 className="text-3xl font-bold tracking-tight">Coiffeurs</h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos coiffeurs et leurs informations
          </p>
        </div>
      </div>

      <div className={cn("flex-1 px-6 pb-6", needsPagination ? "overflow-hidden" : "")}>
        <div className={cn("bg-card rounded-lg border border-border flex flex-col", needsPagination ? "h-full" : "")}>
          <div ref={filtersRef} className="p-4 border-b border-border flex flex-wrap gap-4 items-center flex-shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Rechercher par nom, email ou téléphone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {isAdmin && (
              <Select value={hotelFilter} onValueChange={setHotelFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tous les hôtels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les hôtels</SelectItem>
                  {hotels.map((hotel) => (
                    <SelectItem key={hotel.id} value={hotel.id}>
                      {hotel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
              </SelectContent>
            </Select>

            <Button
              className="ml-auto bg-foreground text-background hover:bg-foreground/90"
              onClick={() => setIsAddDialogOpen(true)}
              style={{ display: isAdmin ? 'flex' : 'none' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un coiffeur
            </Button>
          </div>

          <div className={cn("flex-1", needsPagination ? "min-h-0 overflow-hidden" : "")}>
            <Table className="text-xs w-full table-fixed">
              <TableHeader>
                <TableRow className="bg-muted/20 h-8">
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Nom</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Email</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Téléphone</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Hôtel</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Trunks</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Compétences</TableHead>
                  <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate">Statut</TableHead>
                  {isAdmin && <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 truncate text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedHairdressers.length === 0 ? (
                  <TableRow className="h-10 max-h-10">
                    <TableCell colSpan={8} className="py-0 px-2 h-10 text-center text-muted-foreground">
                      Aucun coiffeur trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedHairdressers.map((hairdresser) => (
                    <TableRow key={hairdresser.id} className="cursor-pointer hover:bg-muted/50 transition-colors h-10 max-h-10">
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <PersonCell person={hairdresser} />
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">{hairdresser.email}</span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">
                          {hairdresser.country_code} {hairdresser.phone}
                        </span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <HotelsCell hotels={getHotelsInfo(hairdresser.hairdresser_hotels)} />
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        {(() => {
                          const trunk = getTrunkInfo(hairdresser.trunks);
                          const trunkName = getTrunkNames(hairdresser.trunks);
                          return trunk ? (
                            <TrunksCell trunks={[trunk]} displayName={trunkName} />
                          ) : <span className="text-foreground">-</span>;
                        })()}
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <span className="truncate block text-foreground">{getSkillsDisplay(hairdresser.skills)}</span>
                      </TableCell>
                      <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                        <StatusBadge status={hairdresser.status} type="entity" className="text-[10px] px-2 py-0.5 whitespace-nowrap" />
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="py-0 px-2 h-10 max-h-10 overflow-hidden">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                setSelectedHairDresser(hairdresser);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                setDeleteHairDresserId(hairdresser.id);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {needsPagination && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredHairdressers.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemName="coiffeurs"
            />
          )}
        </div>
      </div>

      <AddHairDresserDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSuccess={fetchHairdressers}
      />

      {selectedHairDresser && (
        <EditHairDresserDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          hairdresser={selectedHairDresser}
          onSuccess={fetchHairdressers}
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le coiffeur sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}