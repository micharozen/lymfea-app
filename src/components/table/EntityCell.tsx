import { cn } from "@/lib/utils";

interface EntityCellProps {
  image?: string | null;
  name: string;
  fallback?: string;
  className?: string;
}

export function EntityCell({ image, name, fallback, className }: EntityCellProps) {
  const displayFallback = fallback || name.substring(0, 2).toUpperCase();
  
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {image ? (
        <img
          src={image}
          alt={name}
          className="w-4 h-4 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
          <span className="text-[6px] font-medium text-muted-foreground">
            {displayFallback}
          </span>
        </div>
      )}
      <span className="truncate text-foreground">{name}</span>
    </div>
  );
}

interface Person {
  id?: string;
  first_name: string;
  last_name: string;
  profile_image?: string | null;
}

interface PersonCellProps {
  person: Person | null | undefined;
  className?: string;
}

export function PersonCell({ person, className }: PersonCellProps) {
  if (!person) return <span className="text-foreground">-</span>;
  
  const name = `${person.first_name} ${person.last_name}`;
  const initials = `${person.first_name.charAt(0)}${person.last_name.charAt(0)}`.toUpperCase();
  
  return (
    <div className={cn("flex items-center gap-2 whitespace-nowrap", className)}>
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
        {person.profile_image ? (
          <img src={person.profile_image} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] font-medium text-muted-foreground">
            {initials}
          </span>
        )}
      </div>
      <span className="truncate font-medium text-foreground">{name}</span>
    </div>
  );
}

interface PersonNameCellProps {
  firstName: string;
  lastName: string;
  className?: string;
}

export function PersonNameCell({ firstName, lastName, className }: PersonNameCellProps) {
  return (
    <span className={cn("truncate block text-foreground", className)}>
      {firstName} {lastName}
    </span>
  );
}

interface Hotel {
  id: string;
  name: string;
  image?: string | null;
}

interface HotelCellProps {
  hotel: Hotel | null | undefined;
  className?: string;
}

export function HotelCell({ hotel, className }: HotelCellProps) {
  if (!hotel) return <span className="text-foreground">-</span>;
  
  return (
    <EntityCell
      image={hotel.image}
      name={hotel.name}
      className={className}
    />
  );
}

interface HotelsCellProps {
  hotels: Hotel[];
  className?: string;
}

export function HotelsCell({ hotels, className }: HotelsCellProps) {
  if (!hotels || hotels.length === 0) return <span className="text-foreground">-</span>;
  
  const firstHotel = hotels[0];
  const names = hotels.map(h => h.name).join(", ");
  
  return (
    <EntityCell
      image={firstHotel.image}
      name={names}
      className={className}
    />
  );
}

interface TreatmentRoom {
  id: string;
  name: string;
  image?: string | null;
}

interface TreatmentRoomCellProps {
  room: TreatmentRoom | null | undefined;
  className?: string;
}

export function TreatmentRoomCell({ room, className }: TreatmentRoomCellProps) {
  if (!room) return <span className="text-foreground">-</span>;

  return (
    <EntityCell
      image={room.image}
      name={room.name}
      fallback="🚪"
      className={className}
    />
  );
}

interface TreatmentRoomsCellProps {
  rooms: TreatmentRoom[];
  displayName?: string;
  className?: string;
}

export function TreatmentRoomsCell({ rooms, displayName, className }: TreatmentRoomsCellProps) {
  if (!rooms || rooms.length === 0) return <span className="text-foreground">-</span>;

  const firstRoom = rooms[0];
  const name = displayName || rooms.map(r => r.name).join(", ");

  return (
    <EntityCell
      image={firstRoom.image}
      name={name}
      fallback="🚪"
      className={className}
    />
  );
}

interface Concierge {
  id: string;
  first_name: string;
  last_name: string;
  profile_image?: string | null;
}

interface ConciergeCellProps {
  concierge: Concierge | null | undefined;
  className?: string;
}

export function ConciergeCell({ concierge, className }: ConciergeCellProps) {
  if (!concierge) return <span className="text-foreground">-</span>;
  
  const name = `${concierge.first_name} ${concierge.last_name}`;
  
  return (
    <EntityCell
      image={concierge.profile_image}
      name={name}
      className={className}
    />
  );
}

interface ConciergesCellProps {
  concierges: Concierge[];
  className?: string;
}

export function ConciergesCell({ concierges, className }: ConciergesCellProps) {
  if (!concierges || concierges.length === 0) return <span className="text-foreground">-</span>;
  
  const firstConcierge = concierges[0];
  const names = concierges.map(c => `${c.first_name} ${c.last_name}`).join(", ");
  
  return (
    <EntityCell
      image={firstConcierge.profile_image}
      name={names}
      className={className}
    />
  );
}
