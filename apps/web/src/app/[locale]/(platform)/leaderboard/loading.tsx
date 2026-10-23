import { Skeleton, SkeletonListRow } from '@playnex/ui';

export default function LeaderboardLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-36 rounded-full" />
        <Skeleton className="h-10 w-36 rounded-full" />
        <Skeleton className="h-10 w-36 rounded-full" />
      </div>
      <Skeleton className="h-11 w-72 rounded-lg" />
      <div className="rounded-xl border-2 border-border-subtle bg-surface-raised px-4">
        {Array.from({ length: 10 }, (_, index) => (
          <SkeletonListRow key={index} />
        ))}
      </div>
    </div>
  );
}
