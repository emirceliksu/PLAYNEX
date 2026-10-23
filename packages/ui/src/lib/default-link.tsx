import type { LinkComponent } from './link';

export const DefaultLink: LinkComponent = ({ children, ...props }) => <a {...props}>{children}</a>;
