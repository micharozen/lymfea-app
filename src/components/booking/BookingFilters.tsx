import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarIcon, List, Search } from "lucide-react";
import type { Hotel, Hairdresser } from "@/hooks/booking";

interface BookingFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  hotelFilter: string;
  onHotelChange: (value: string) => void;
  hairdresserFilter: string;
  onHairdresserChange: (value: string) => void;
  view: "calendar" | "list";
  onViewChange: (view: "calendar" | "list") => void;
  isAdmin: boolean;
  hotels: Hotel[] | undefined;
  hairdressers: Hairdresser[] | undefined;
}

export function BookingFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  hotelFilter,
  onHotelChange,
  hairdresserFilter,
  onHairdresserChange,
  view,
  onViewChange,
  isAdmin,
  hotels,
  hairdressers,
}: BookingFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 pb-4 border-b border-border">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 w-[140px]"
        />
      </div>

      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Tous les statuts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les statuts</SelectItem>
          <SelectItem value="quote_pending">Devis</SelectItem>
          <SelectItem value="pending">En attente</SelectItem>
          <SelectItem value="confirmed">Confirmé</SelectItem>
          <SelectItem value="ongoing">En cours</SelectItem>
          <SelectItem value="completed">Terminé</SelectItem>
          <SelectItem value="cancelled">Annulé</SelectItem>
        </SelectContent>
      </Select>

      {isAdmin && (
        <Select value={hotelFilter} onValueChange={onHotelChange}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Tous les hôtels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les hôtels</SelectItem>
            {hotels?.map((hotel) => (
              <SelectItem key={hotel.id} value={hotel.id}>
                {hotel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isAdmin && (
        <Select value={hairdresserFilter} onValueChange={onHairdresserChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tous les coiffeurs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les coiffeurs</SelectItem>
            {hairdressers?.map((hairdresser) => (
              <SelectItem key={hairdresser.id} value={hairdresser.id}>
                {hairdresser.first_name} {hairdresser.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="ml-auto flex items-center border rounded-md overflow-hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewChange("calendar")}
          className={`rounded-none border-0 h-6 px-1.5 text-[11px] ${view === "calendar" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
        >
          <CalendarIcon className="h-3 w-3 md:mr-1" />
          <span className="hidden md:inline">Calendrier</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewChange("list")}
          className={`rounded-none border-0 h-6 px-1.5 text-[11px] ${view === "list" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
        >
          <List className="h-3 w-3 md:mr-1" />
          <span className="hidden md:inline">Liste</span>
        </Button>
      </div>
    </div>
  );
}
