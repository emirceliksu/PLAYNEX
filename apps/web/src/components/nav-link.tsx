import type { LinkComponent } from '@playnex/ui';

import { Link } from '@/i18n/navigation';

// Adapter so router-agnostic UI components render the localized Next link.
export const NavLink: LinkComponent = ({ href, children, ...rest }) => (
  <Link href={href} {...rest}>
    {children}
  </Link>
);
