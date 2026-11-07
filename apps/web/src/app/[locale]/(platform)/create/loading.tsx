import { Skeleton, SkeletonCover, SkeletonListRow } from '@playnex/ui';

export default function WorkshopLoading() {
  return (
    <div className="flex flex-col gap-14" aria-busy>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="flex flex-col gap-2">
        <SkeletonListRow />
        <SkeletonListRow />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <SkeletonCover key={index} />
        ))}
      </div>
    </div>
  );
}
