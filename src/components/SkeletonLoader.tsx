export default function SkeletonCard({ className = '', lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`glass-card p-5 animate-fade-in ${className}`}>
      <div className="skeleton h-5 w-32 mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4 mb-2" style={{ width: `${85 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-white/5">
        <div className="skeleton h-5 w-40" />
      </div>
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 p-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="skeleton h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart({ height = 200 }: { height?: number }) {
  return (
    <div className="glass-card p-5">
      <div className="skeleton h-5 w-32 mb-4" />
      <div className="skeleton" style={{ height }} />
    </div>
  );
}
