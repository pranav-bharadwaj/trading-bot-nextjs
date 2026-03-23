import SkeletonCard, { SkeletonTable, SkeletonChart } from '@/components/SkeletonLoader';

export default function RealTradingLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="skeleton h-8 w-60 mb-2" />
          <div className="skeleton h-4 w-48" />
        </div>
        <div className="flex gap-3">
          <div className="skeleton h-10 w-28 rounded-lg" />
          <div className="skeleton h-10 w-28 rounded-lg" />
          <div className="skeleton h-10 w-28 rounded-lg" />
        </div>
      </div>

      {/* Mode toggle */}
      <div className="skeleton h-14 w-full rounded-xl" />

      {/* Safety cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>

      {/* Positions table */}
      <SkeletonTable rows={4} cols={10} />

      {/* Chart */}
      <SkeletonChart height={250} />

      {/* Closed trades */}
      <SkeletonTable rows={5} cols={9} />

      {/* Log */}
      <SkeletonCard lines={6} className="h-64" />
    </div>
  );
}
