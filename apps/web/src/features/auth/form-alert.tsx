import { CircleAlert, CircleCheck } from 'lucide-react';
import type { Ref } from 'react';

interface FormAlertProps {
  tone: 'error' | 'success';
  children: string;
  id?: string;
  // Forms move focus here after a failed submit, so the alert must accept programmatic focus.
  ref?: Ref<HTMLParagraphElement>;
}

export function FormAlert({ tone, children, id, ref }: FormAlertProps) {
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <p
      ref={ref}
      id={id}
      tabIndex={ref ? -1 : undefined}
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-lg border-2 px-4 py-3 text-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
        tone === 'error'
          ? 'border-coral-solid/40 bg-coral-soft text-coral-text'
          : 'border-mint-solid/40 bg-mint-soft text-mint-text'
      }`}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
