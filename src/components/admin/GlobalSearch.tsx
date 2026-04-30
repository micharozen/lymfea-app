import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Calendar, Users, UserRound, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserContext } from "@/hooks/useUserContext";

// Hook personnalisé pour le Debounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const navigate = useNavigate();
  const { isAdmin, userVenueIds } = useUserContext() as any;

  // Raccourci clavier Cmd+K ou Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Réinitialise la recherche à la fermeture
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // Recherche serveur — bookings + customers + therapists en une seule passe
  // Déclenchée uniquement quand le dialog est ouvert et ≥2 caractères tapés
  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["global-search", debouncedSearch, isAdmin, userVenueIds],
    enabled: debouncedSearch.length >= 2 && open,
    queryFn: async () => {
      const searchTerm = `%${debouncedSearch}%`;
      const searchNum = parseInt(debouncedSearch, 10);
      const isNumeric = !isNaN(searchNum);

      let bookingQuery = supabase
        .from("bookings")
        .select("id, booking_id, client_first_name, client_last_name, client_email, phone, booking_date");

      if (!isAdmin) {
        if (!userVenueIds?.length) return { bookings: [], customers: [], therapists: [] };
        bookingQuery = bookingQuery.in("hotel_id", userVenueIds);
      }

      const bookingOrParts = [
        `client_first_name.ilike.${searchTerm}`,
        `client_last_name.ilike.${searchTerm}`,
        `client_email.ilike.${searchTerm}`,
        `phone.ilike.${searchTerm}`,
        ...(isNumeric ? [`booking_id.eq.${searchNum}`] : []),
      ];
      bookingQuery = bookingQuery.or(bookingOrParts.join(",")).limit(5);

      const [bookRes, custRes, therRes] = await Promise.all([
        bookingQuery,
        supabase
          .from("customers")
          .select("id, first_name, last_name, email, phone")
          .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`)
          .limit(5),
        supabase
          .from("therapists")
          .select("id, first_name, last_name, email, status")
          .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm}`)
          .limit(5),
      ]);

      return {
        bookings: bookRes.data || [],
        customers: custRes.data || [],
        therapists: therRes.data || [],
      };
    },
  });

  const filteredBookings = searchResults?.bookings ?? [];

  const onSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
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

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        {/* FIX 1: Titre invisible pour stopper l'erreur d'accessibilité dans la console */}
        <DialogTitle className="sr-only">Recherche globale</DialogTitle>

        <CommandInput
          placeholder="Nom, téléphone, n° réservation..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className="max-h-[450px]">
          {search.length < 2 ? (
            <div className="p-8 text-center">
              <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">
                Tapez au moins 2 lettres pour lancer la recherche...
              </p>
            </div>
          ) : isFetching ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <p className="text-sm">Recherche en cours...</p>
            </div>
          ) : (
            <>
              {/* FIX 2: CommandEmpty doit toujours être là pour que l'affichage ne buggue pas */}
              <CommandEmpty>Aucun résultat trouvé pour "{search}".</CommandEmpty>

              {filteredBookings.length > 0 && (
                <CommandGroup heading="Réservations">
                  {filteredBookings.map((booking: any) => (
                    <CommandItem
                      key={booking.id}
                      // FIX 3: Valeur explicite pour que la modale retrouve ses petits
                      value={`${booking.client_first_name} ${booking.client_last_name} ${booking.booking_id} ${booking.phone || ''} ${booking.client_email || ''}`}
                      onSelect={() => onSelect(`/admin/bookings?id=${booking.id}`)}
                      className="cursor-pointer"
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

              {filteredBookings.length > 0 && (searchResults?.customers?.length ?? 0) > 0 && <CommandSeparator />}

              {(searchResults?.customers?.length ?? 0) > 0 && (
                <CommandGroup heading="Clients">
                  {searchResults!.customers.map((c: any) => (
                    <CommandItem
                      key={c.id}
                      // FIX 3
                      value={`${c.first_name} ${c.last_name} ${c.email || ''} ${c.phone || ''}`}
                      onSelect={() => onSelect(`/admin/customers/${c.id}`)}
                      className="cursor-pointer"
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

              {(searchResults?.customers?.length ?? 0) > 0 && (searchResults?.therapists?.length ?? 0) > 0 && <CommandSeparator />}

              {(searchResults?.therapists?.length ?? 0) > 0 && (
                <CommandGroup heading="Praticiens">
                  {searchResults!.therapists.map((t: any) => (
                    <CommandItem
                      key={t.id}
                      // FIX 3
                      value={`${t.first_name} ${t.last_name} ${t.status || ''}`}
                      onSelect={() => onSelect(`/admin/therapists/${t.id}`)}
                      className="cursor-pointer"
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
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}