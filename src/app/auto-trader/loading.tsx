import SkeletonCard, { SkeletonTable } from '@/components/SkeletonLoader';

export default function AutoTraderLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div>
        <div className="skeleton h-8 w-36 mb-2" />
        <div className="skeleton h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} lines={2} />)}
      </div>
      <SkeletonTable rows={5} cols={8} />
      <SkeletonCard lines={1} className="h-48" />
      <SkeletonTable rows={3} cols={6} />
    </div>
  );
}
