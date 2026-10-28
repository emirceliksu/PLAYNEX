import { Skeleton, SkeletonGameCard } from '@playnex/ui';

export default function GamesLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex flex-col gap-5 rounded-xl border-2 border-border-subtle bg-surface-raised p-4 md:p-5">
        <Skeleton className="h-11 w-full rounded-lg" />
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-20 rounded-full" />
                <Skeleton className="h-10 w-24 rounded-full" />
                <Skeleton className="h-10 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-4 w-20" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <SkeletonGameCard key={index} />
        ))}
      </div>
    </div>
  );
}
