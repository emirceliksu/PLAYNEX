import { Skeleton, SkeletonAvatar, SkeletonListRow } from '@playnex/ui';

export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-12" aria-busy>
      <div className="overflow-hidden rounded-2xl border-2 border-border-subtle bg-surface-raised">
        <Skeleton className="h-28 rounded-none md:h-36" />
        <div className="flex flex-col gap-5 px-5 pb-6 md:flex-row md:items-end md:px-8">
          <SkeletonAvatar className="-mt-12 size-24 md:-mt-14" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-full max-w-md rounded-full" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="rounded-xl border-2 border-border-subtle bg-surface-raised px-4">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonListRow key={index} />
        ))}
      </div>
    </div>
  );
}
