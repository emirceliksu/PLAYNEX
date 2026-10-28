import { Skeleton, SkeletonCover, SkeletonGameCard, SkeletonText } from '@playnex/ui';

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
      <div className="flex items-baseline justify-between gap-4">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="grid gap-6 rounded-2xl border-2 border-border-subtle bg-surface-raised p-4 md:grid-cols-[3fr_2fr] md:p-6">
        <SkeletonCover />
        <div className="flex flex-col justify-center gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-3/4" />
          <SkeletonText lines={3} />
          <Skeleton className="h-14 w-44 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonGameCard key={index} />
        ))}
      </div>
    </div>
  );
}
