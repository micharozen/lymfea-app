import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Calendar, Users, UserRound, Loader2 } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useBookingData } from "@/hooks/booking";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/hooks/useUserContext";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { isAdmin, userVenueIds } = useUserContext();

  // 1. Récupération des données (bookings via hook, le reste via fetch)
  const { bookings = [] } = useBookingData();
  const [customers, setCustomers] = useState<any[]>([]);
  const [therapists, setTherapists] = useState<any[]>([]);

  useEffect(() => {
    // Raccourci clavier Cmd+K ou Ctrl+K
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Chargement des données à l'ouverture
  useEffect(() => {
    if (open) {
      fetchData();
    } else {
      setSearch(""); // Réinitialise la recherche à la fermeture
    }
  }, [open]);

  const fetchData = async () => {
    if (customers.length > 0) return; // Évite de recharger si déjà présent
    setLoading(true);
    try {
      const [custRes, therRes] = await Promise.all([
        supabase.from("customers").select("*").limit(200),
        supabase.from("therapists").select("*").limit(100),
      ]);
      if (custRes.data) setCustomers(custRes.data);
      if (therRes.data) setTherapists(therRes.data);
    } catch (error) {
      console.error("Search fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrage pour les Concierges (respect du périmètre de sécurité)
  const safeBookings = bookings || [];
  const filteredBookings = isAdmin 
    ? safeBookings 
    : safeBookings.filter(b => userVenueIds?.includes(b.hotel_id));

  const onSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* Bouton Sidebar (Adapté au mode icône) */}
      <div className="px-3 mb-2 group-data-[collapsible=icon]:px-0">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground border rounded-md hover:bg-accent w-full transition-colors group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:justify-center"
          title="Rechercher (⌘K)"
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Rechercher...</span>
          <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 ml-auto group-data-[collapsible=icon]:hidden">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Nom, téléphone, n° réservation..." 
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className="max-h-[450px]">
          {search.length > 0 ? (
            <>
              <CommandEmpty>Aucun résultat trouvé pour "{search}".</CommandEmpty>
              
              {loading && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* RÉSERVATIONS */}
              {filteredBookings.length > 0 && (
                <CommandGroup heading="Réservations">
                  {filteredBookings.slice(0, 5).map((booking) => (
                    <CommandItem
                      key={booking.id}
                      onSelect={() => onSelect(`/admin/bookings?id=${booking.id}`)}
                      className="cursor-pointer"
                      value={`${booking.client_first_name} ${booking.client_last_name} ${booking.booking_id} ${booking.phone} ${booking.client_email}`}
                    >
                      <Calendar className="w-4 h-4 mr-2 text-blue-500" />
                      <div className="flex flex-col">
                        <span className="font-medium">{booking.client_first_name} {booking.client_last_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          #{booking.booking_id} — {booking.booking_date} {booking.phone ? `— ${booking.phone}` : ''}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandSeparator />

              {/* CLIENTS */}
              {customers.length > 0 && (
                <CommandGroup heading="Clients">
                  {customers.slice(0, 5).map((c) => (
                    <CommandItem
                      key={c.id}
                      onSelect={() => onSelect(`/admin/customers/${c.id}`)}
                      className="cursor-pointer"
                      value={`${c.first_name} ${c.last_name} ${c.email} ${c.phone}`}
                    >
                      <Users className="w-4 h-4 mr-2 text-green-500" />
                      <div className="flex flex-col">
                        <span>{c.first_name} {c.last_name}</span>
                        <span className="text-[10px] text-muted-foreground">{c.email || c.phone}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandSeparator />

              {/* PRATICIENS (Mise à jour : Redirection vers la fiche détaillée) */}
              {therapists.length > 0 && (
                <CommandGroup heading="Praticiens">
                  {therapists.slice(0, 5).map((t) => (
                    <CommandItem
                      key={t.id}
                      // MODIFICATION ICI : On ajoute l'ID pour aller sur la fiche perso
                      onSelect={() => onSelect(`/admin/therapists/${t.id}`)}
                      className="cursor-pointer"
                      value={`${t.first_name} ${t.last_name} ${t.email} ${t.phone}`}
                    >
                      <UserRound className="w-4 h-4 mr-2 text-purple-500" />
                      <div className="flex flex-col">
                        <span>{t.first_name} {t.last_name}</span>
                        <span className="text-[10px] text-muted-foreground">Statut : {t.status}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          ) : (
            <div className="p-8 text-center">
              <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                Tapez un nom, un email ou un téléphone pour rechercher...
              </p>
            </div>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}