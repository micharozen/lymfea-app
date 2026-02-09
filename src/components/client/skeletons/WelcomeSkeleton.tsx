import { Skeleton } from "@/components/ui/skeleton";

export function WelcomeSkeleton() {
  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Hero Section placeholder */}
      <div className="relative w-full overflow-hidden">
        <Skeleton className="absolute inset-0 bg-white/5" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/40" />

        <div className="relative z-10 w-full max-w-lg mx-auto pt-16 pb-10 px-6">
          {/* Logo */}
          <Skeleton className="h-12 w-12 mb-6 bg-white/10" />
          {/* Label */}
          <Skeleton className="h-3 w-32 mb-4 bg-white/10" />
          {/* Title */}
          <Skeleton className="h-10 w-3/4 mb-2 bg-white/10" />
          <Skeleton className="h-10 w-1/2 mb-4 bg-white/10" />
          {/* Description */}
          <Skeleton className="h-4 w-full mb-2 bg-white/10" />
          <Skeleton className="h-4 w-3/4 mb-6 bg-white/10" />
          {/* How it works */}
          <Skeleton className="h-3 w-40 bg-white/10" />
        </div>
      </div>

      {/* Reassurance banner */}
      <div className="px-4 py-3 bg-white/5 flex items-center justify-center gap-2 border-b border-white/5">
        <Skeleton className="h-3 w-48 bg-white/10" />
      </div>

      {/* Gender sections */}
      <div className="flex-1">
        {/* Women section */}
        <div className="border-b border-white/10 px-5 py-5">
          <Skeleton className="h-6 w-32 mb-2 bg-white/10" />
          <Skeleton className="h-3 w-20 bg-white/10" />
        </div>

        {/* Treatment cards placeholders */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 border-b border-white/5">
            <div className="flex gap-4">
              <Skeleton className="w-20 h-20 rounded-sm flex-shrink-0 bg-white/10" />
              <div className="flex-1 flex flex-col gap-2">
                <Skeleton className="h-5 w-3/4 bg-white/10" />
                <Skeleton className="h-3 w-full bg-white/10" />
                <div className="flex items-center justify-between mt-2">
                  <Skeleton className="h-5 w-16 bg-white/10" />
                  <Skeleton className="h-9 w-20 bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Men section */}
        <div className="border-b border-white/10 px-5 py-5">
          <Skeleton className="h-6 w-32 mb-2 bg-white/10" />
          <Skeleton className="h-3 w-20 bg-white/10" />
        </div>
      </div>
    </div>
  );
}
