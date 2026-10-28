'use client';

import { SearchInput } from '@playnex/ui';
import { useState } from 'react';

import { useRouter } from '@/i18n/navigation';

interface SearchFormProps {
  label: string;
  placeholder: string;
  defaultValue?: string;
  className?: string;
}

export function SearchForm({ label, placeholder, defaultValue = '', className }: SearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);

  return (
    <form
      role="search"
      aria-label={label}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        router.push(trimmed ? `/games?q=${encodeURIComponent(trimmed)}` : '/games');
      }}
    >
      <SearchInput
        label={label}
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />
    </form>
  );
}
