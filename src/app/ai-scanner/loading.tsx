import SkeletonCard from '@/components/SkeletonLoader';

export default function AiScannerLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div>
        <div className="skeleton h-8 w-36 mb-2" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="skeleton h-12 w-full rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard lines={6} />
        <SkeletonCard lines={6} />
      </div>
    </div>
  );
}
