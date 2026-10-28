'use client';

import { IconButton, TextField, type TextFieldProps } from '@playnex/ui';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const t = useTranslations('auth.password');
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <IconButton
          type="button"
          label={visible ? t('hide') : t('show')}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </IconButton>
      }
    />
  );
}
