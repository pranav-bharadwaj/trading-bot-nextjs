import SkeletonCard, { SkeletonTable } from '@/components/SkeletonLoader';

export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={5} />
      </div>
      <SkeletonCard lines={2} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={5} />
      </div>
    </div>
  );
}
