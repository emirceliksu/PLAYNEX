import { Skeleton, SkeletonText } from '@playnex/ui';

export default function AuthLoading() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" aria-busy>
      <div className="grain hidden border-r-2 border-border-subtle bg-brand-soft lg:block" />
      <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-4 py-16">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-3/4" />
        <SkeletonText lines={2} />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
        <Skeleton className="h-14 w-full rounded-md" />
      </div>
    </div>
  );
}
