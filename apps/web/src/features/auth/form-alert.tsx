import { CircleAlert, CircleCheck } from 'lucide-react';

interface FormAlertProps {
  tone: 'error' | 'success';
  children: string;
}

export function FormAlert({ tone, children }: FormAlertProps) {
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-lg border-2 px-4 py-3 text-body-sm ${
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
