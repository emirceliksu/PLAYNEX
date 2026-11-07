import { Skeleton, SkeletonCover, SkeletonListRow, SkeletonText } from '@playnex/ui';

export default function ReleaseLoading() {
  return (
    <div className="flex flex-col gap-12" aria-busy>
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <SkeletonCover />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-12 w-64" />
          <SkeletonText lines={3} />
          <Skeleton className="h-12 w-40 rounded-xl" />
        </div>
      </div>
      <div className="flex max-w-2xl flex-col gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonListRow key={index} />
        ))}
      </div>
    </div>
  );
}
