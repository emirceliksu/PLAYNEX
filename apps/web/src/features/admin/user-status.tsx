import type { ManagedUser } from '@playnex/shared-types';
import { Badge } from '@playnex/ui';
import { BadgeCheck, Ban, Clock, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export async function UserStatus({ user }: { user: ManagedUser }) {
  const t = await getTranslations('admin.status');

  return (
    <div className="flex flex-wrap gap-1.5">
      {user.suspendedAt ? (
        <Badge tone="coral" size="sm">
          <Ban aria-hidden />
          {t('suspended')}
        </Badge>
      ) : user.verified ? (
        <Badge tone="mint" size="sm">
          <BadgeCheck aria-hidden />
          {t('verified')}
        </Badge>
      ) : (
        <Badge tone="yellow" size="sm">
          <Clock aria-hidden />
          {t('pending')}
        </Badge>
      )}
      {user.role === 'admin' ? (
        <Badge tone="brand" size="sm">
          <ShieldCheck aria-hidden />
          {t('admin')}
        </Badge>
      ) : null}
    </div>
  );
}
