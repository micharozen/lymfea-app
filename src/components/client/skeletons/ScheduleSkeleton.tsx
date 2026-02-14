import { Skeleton } from "@/components/ui/skeleton";

export function ScheduleSkeleton() {
  return (
    <div className="relative min-h-[100dvh] w-full bg-white pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 border-b border-gray-200 pt-safe">
        <div className="flex items-center gap-4 p-4">
          <Skeleton className="h-10 w-10 rounded-full bg-gray-100" />
          <Skeleton className="h-5 w-32 bg-gray-100" />
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-200 h-0.5">
          <Skeleton className="bg-gold-400/50 h-full w-1/4" />
        </div>
      </div>

      <div className="px-6 py-6 space-y-8">
        {/* Page headline */}
        <div>
          <Skeleton className="h-3 w-24 mb-3 bg-gray-100" />
          <Skeleton className="h-8 w-3/4 bg-gray-100" />
        </div>

        {/* Date Selection */}
        <div className="space-y-4">
          <Skeleton className="h-3 w-16 bg-gray-100" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-shrink-0 w-[90px] h-[72px] rounded-lg bg-gray-100"
              />
            ))}
          </div>
        </div>

        {/* Time Selection */}
        <div className="space-y-4">
          <Skeleton className="h-3 w-12 bg-gray-100" />

          {/* Time period tabs */}
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-8 w-20 rounded-full bg-gray-100" />
            <Skeleton className="h-8 w-24 rounded-full bg-gray-100" />
            <Skeleton className="h-8 w-20 rounded-full bg-gray-100" />
          </div>

          {/* Time slots grid */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-12 rounded-lg bg-gray-100"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pb-safe">
        <Skeleton className="w-full h-16 bg-gray-100" />
      </div>
    </div>
  );
}
