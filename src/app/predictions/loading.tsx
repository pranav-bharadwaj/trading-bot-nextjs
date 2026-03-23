import SkeletonCard, { SkeletonChart } from '@/components/SkeletonLoader';

export default function PredictionsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div>
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-4 w-80" />
      </div>
      <div className="skeleton h-12 w-full rounded-xl" />
      <div className="flex gap-2">
        {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-8 w-20 rounded-lg" />)}
      </div>
      <SkeletonCard lines={2} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={6} />
        <SkeletonCard lines={6} />
      </div>
      <SkeletonChart height={250} />
    </div>
  );
}
