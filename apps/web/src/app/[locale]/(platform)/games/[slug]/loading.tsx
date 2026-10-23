import { Skeleton, SkeletonCover, SkeletonListRow, SkeletonText } from '@playnex/ui';

export default function GameLoading() {
  return (
    <div className="flex flex-col gap-14" aria-busy>
      <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-center md:gap-10">
        <SkeletonCover className="rounded-2xl" />
        <div className="flex flex-col gap-5">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-14 w-48 rounded-md" />
        </div>
      </div>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-16">
        <div className="flex flex-col gap-10">
          <Skeleton className="h-7 w-32" />
          <SkeletonText lines={4} />
          <Skeleton className="h-7 w-32" />
          <SkeletonText lines={3} />
        </div>
        <div className="rounded-xl border-2 border-border-subtle bg-surface-raised px-4">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonListRow key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
