import { Skeleton } from "@/components/ui/skeleton";

export function WelcomeSkeleton() {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden flex flex-col justify-end pb-safe bg-black">
      {/* Background placeholder */}
      <div className="absolute inset-0 z-0">
        <Skeleton className="h-full w-full bg-white/5" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/40" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 w-full flex flex-col max-w-lg mx-auto pt-20 px-6">
        {/* Logo placeholder */}
        <Skeleton className="h-14 w-14 mb-8 bg-white/10" />

        {/* Label */}
        <Skeleton className="h-3 w-32 mb-4 bg-white/10" />

        {/* Title */}
        <Skeleton className="h-10 w-3/4 mb-2 bg-white/10" />
        <Skeleton className="h-10 w-1/2 mb-4 bg-white/10" />

        {/* Description */}
        <Skeleton className="h-4 w-full mb-2 bg-white/10" />
        <Skeleton className="h-4 w-3/4 mb-8 bg-white/10" />

        {/* Practitioners carousel placeholder */}
        <div className="mb-8">
          <Skeleton className="h-4 w-24 mb-4 bg-white/10" />
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="w-16 h-16 rounded-full bg-white/10 flex-shrink-0" />
            ))}
          </div>
        </div>

        {/* Services preview */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-3 w-20 bg-white/10" />
            <Skeleton className="h-3 w-12 bg-white/10" />
          </div>
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-32">
                <Skeleton className="aspect-[3/4] rounded-sm mb-2 bg-white/10" />
                <Skeleton className="h-3 w-20 mb-1 bg-white/10" />
                <Skeleton className="h-3 w-12 bg-white/10" />
              </div>
            ))}
          </div>
        </div>

        {/* CTA Button */}
        <Skeleton className="w-full h-16 mb-6 bg-white/10" />

        {/* Bottom section */}
        <div className="flex flex-col items-center gap-4 py-4 mb-4">
          <div className="flex gap-8">
            <Skeleton className="h-3 w-16 bg-white/10" />
            <Skeleton className="h-3 w-16 bg-white/10" />
            <Skeleton className="h-3 w-16 bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
