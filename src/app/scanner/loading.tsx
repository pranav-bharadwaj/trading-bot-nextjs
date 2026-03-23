import { SkeletonTable } from '@/components/SkeletonLoader';

export default function ScannerLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div>
        <div className="skeleton h-8 w-40 mb-2" />
        <div className="skeleton h-4 w-64" />
      </div>
      <div className="flex gap-3">
        <div className="skeleton h-10 flex-1" />
        <div className="skeleton h-10 w-16" />
        <div className="skeleton h-10 w-16" />
        <div className="skeleton h-10 w-16" />
      </div>
      <SkeletonTable rows={10} cols={8} />
    </div>
  );
}
