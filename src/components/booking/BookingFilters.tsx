import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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

      <ButtonGroup className="ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onViewChange("calendar")}
              className={`h-7 w-7 ${view === "calendar" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Calendrier</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onViewChange("list")}
              className={`h-7 w-7 ${view === "list" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Liste</TooltipContent>
        </Tooltip>
      </ButtonGroup>
    </div>
  );
}
