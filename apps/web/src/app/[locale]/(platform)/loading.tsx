import {
  Skeleton,
  SkeletonCover,
  SkeletonGameCard,
  SkeletonListRow,
  SkeletonText,
} from '@playnex/ui';

// Mirrors the home page rhythm: featured block, shelf, grid, dense list.
export default function HomeLoading() {
  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:gap-10" aria-busy>
      <div className="flex flex-col gap-14">
        <div className="grid gap-6 rounded-2xl border-2 border-border-subtle bg-surface-raised p-4 md:grid-cols-[3fr_2fr] md:p-6">
          <SkeletonCover />
          <div className="flex flex-col justify-center gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-3/4" />
            <SkeletonText lines={3} />
            <Skeleton className="h-14 w-44 rounded-md" />
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-7 w-40" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }, (_, index) => (
              <SkeletonGameCard key={index} className="w-44 shrink-0 md:w-52" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-32" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonGameCard className="sm:col-span-2" />
            <SkeletonGameCard />
            <SkeletonGameCard />
            <SkeletonGameCard />
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-7 w-48" />
          <div className="rounded-xl border-2 border-border-subtle bg-surface-raised px-4">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonListRow key={index} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="rounded-xl border-2 border-border-subtle bg-surface-raised p-4"
          >
            <Skeleton className="mb-4 h-5 w-28" />
            <SkeletonListRow />
            <SkeletonListRow />
          </div>
        ))}
      </div>
    </div>
  );
}
