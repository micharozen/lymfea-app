import { Skeleton } from "@/components/ui/skeleton";

export function TreatmentsSkeleton() {
  return (
    <div className="min-h-screen bg-white flex flex-col text-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 border-b border-gray-200">
        <div className="relative h-20 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-between px-4 pt-safe">
            <Skeleton className="h-10 w-10 rounded-full bg-gray-100" />
            <Skeleton className="h-6 w-40 bg-gray-100" />
            <div className="w-10" />
          </div>
        </div>
      </div>

      {/* Bestseller Section Skeleton */}
      <div className="px-5 pt-6 pb-3">
        <Skeleton className="h-3 w-24 bg-gray-100 mb-2" />
        <Skeleton className="h-3 w-40 bg-gray-100" />
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pb-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="aspect-[4/3] w-full bg-gray-100 mb-1.5" />
            <Skeleton className="h-2 w-10 bg-gray-100 mb-1" />
            <Skeleton className="h-3 w-full bg-gray-100 mb-1.5" />
            <Skeleton className="h-3 w-8 bg-gray-100 mb-1.5" />
            <Skeleton className="h-6 w-full bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="border-b border-gray-200" />

      {/* Gender Section */}
      <div className="border-b border-gray-200">
        <div className="flex items-center justify-between px-5 py-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32 bg-gray-100" />
            <Skeleton className="h-3 w-20 bg-gray-100" />
          </div>
          <Skeleton className="h-5 w-5 bg-gray-100" />
        </div>

        {/* Categories Tabs */}
        <div className="flex gap-2 px-2 border-t border-gray-100 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 bg-gray-100" />
          ))}
        </div>

        {/* Treatment Items */}
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 space-y-2">
              <Skeleton className="h-5 w-3/4 bg-gray-100" />
              <Skeleton className="h-3 w-full bg-gray-100" />
              <Skeleton className="h-3 w-2/3 bg-gray-100" />
              <div className="flex justify-between items-end mt-4 pt-2">
                <div className="space-y-1">
                  <Skeleton className="h-5 w-16 bg-gray-100" />
                  <Skeleton className="h-3 w-12 bg-gray-100" />
                </div>
                <Skeleton className="h-9 w-20 bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Second Gender Section (collapsed) */}
      <div className="border-b border-gray-200">
        <div className="flex items-center justify-between px-5 py-5">
          <div className="space-y-2">
            <Skeleton className="h-6 w-28 bg-gray-100" />
            <Skeleton className="h-3 w-16 bg-gray-100" />
          </div>
          <Skeleton className="h-5 w-5 bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
