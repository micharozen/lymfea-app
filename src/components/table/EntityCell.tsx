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

interface Trunk {
  id: string;
  name: string;
  image?: string | null;
}

interface TrunkCellProps {
  trunk: Trunk | null | undefined;
  className?: string;
}

export function TrunkCell({ trunk, className }: TrunkCellProps) {
  if (!trunk) return <span className="text-foreground">-</span>;
  
  return (
    <EntityCell
      image={trunk.image}
      name={trunk.name}
      fallback="🧳"
      className={className}
    />
  );
}

interface TrunksCellProps {
  trunks: Trunk[];
  displayName?: string;
  className?: string;
}

export function TrunksCell({ trunks, displayName, className }: TrunksCellProps) {
  if (!trunks || trunks.length === 0) return <span className="text-foreground">-</span>;
  
  const firstTrunk = trunks[0];
  const name = displayName || trunks.map(t => t.name).join(", ");
  
  return (
    <EntityCell
      image={firstTrunk.image}
      name={name}
      fallback="🧳"
      className={className}
    />
  );
}
