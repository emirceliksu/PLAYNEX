import { Skeleton, SkeletonGameCard } from '@playnex/ui';

export default function CommunityLoading() {
  return (
    <div className="flex flex-col gap-10" aria-busy>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-20 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-10 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonGameCard key={index} />
        ))}
      </div>
    </div>
  );
}
