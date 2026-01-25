import { Skeleton } from "@/components/ui/skeleton";

export function TreatmentsSkeleton() {
  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/80 border-b border-white/10">
        <div className="relative h-20 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-between px-4 pt-safe">
            <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
            <Skeleton className="h-6 w-40 bg-white/10" />
            <div className="w-10" />
          </div>
        </div>
      </div>

      {/* Reassurance Banner */}
      <div className="px-4 py-3 bg-white/5 flex items-center justify-center gap-2 border-b border-white/5">
        <Skeleton className="h-3 w-3 rounded-full bg-white/10" />
        <Skeleton className="h-3 w-48 bg-white/10" />
      </div>

      {/* Gender Section */}
      <div className="border-b border-white/10">
        <div className="flex items-center justify-between px-5 py-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32 bg-white/10" />
            <Skeleton className="h-3 w-20 bg-white/10" />
          </div>
          <Skeleton className="h-5 w-5 bg-white/10" />
        </div>

        {/* Categories Tabs */}
        <div className="flex gap-2 px-2 border-t border-white/5 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 bg-white/10" />
          ))}
        </div>

        {/* Treatment Items */}
        <div className="divide-y divide-white/5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 flex gap-4">
              <Skeleton className="w-24 h-24 rounded-sm bg-white/10 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4 bg-white/10" />
                <Skeleton className="h-3 w-full bg-white/10" />
                <Skeleton className="h-3 w-2/3 bg-white/10" />
                <div className="flex justify-between items-end mt-4 pt-2">
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-16 bg-white/10" />
                    <Skeleton className="h-3 w-12 bg-white/10" />
                  </div>
                  <Skeleton className="h-9 w-20 bg-white/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Second Gender Section (collapsed) */}
      <div className="border-b border-white/10">
        <div className="flex items-center justify-between px-5 py-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-28 bg-white/10" />
            <Skeleton className="h-3 w-16 bg-white/10" />
          </div>
          <Skeleton className="h-5 w-5 bg-white/10" />
        </div>
      </div>
    </div>
  );
}
