export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-white animate-pulse">
      {/* Hero skeleton */}
      <div className="h-[35vh] bg-gray-200" />

      {/* Session selector skeleton */}
      <div className="flex items-center justify-center px-6 py-5 border-b border-gray-100">
        <div className="h-6 w-48 bg-gray-200 rounded" />
      </div>

      {/* Metrics skeleton */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white rounded-lg border border-gray-100 p-4 space-y-2">
              <div className="h-5 w-5 bg-gray-200 rounded mx-auto" />
              <div className="h-8 w-12 bg-gray-200 rounded mx-auto" />
              <div className="h-3 w-16 bg-gray-100 rounded mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-0">
          <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-50">
              <div className="h-4 w-12 bg-gray-200 rounded" />
              <div className="w-0.5 h-8 bg-gray-100" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
