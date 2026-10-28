'use client';

import type { GameCategory, GameDimension, GameMode } from '@playnex/shared-types';
import { Button, FilterChip, FilterGroup, SearchInput } from '@playnex/ui';
import { X } from 'lucide-react';
import { useState } from 'react';

import { useRouter } from '@/i18n/navigation';

export interface CatalogFilters {
  q: string;
  category: GameCategory | 'all';
  dimension: GameDimension | 'all';
  mode: GameMode | 'all';
  sort: 'popular' | 'new';
}

interface FilterBarProps {
  filters: CatalogFilters;
  labels: {
    search: string;
    category: string;
    dimension: string;
    mode: string;
    sort: string;
    clear: string;
    categories: Record<string, string>;
    dimensions: Record<string, string>;
    modes: Record<string, string>;
    sorts: Record<string, string>;
  };
}

function toQuery(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.dimension !== 'all') params.set('dimension', filters.dimension);
  if (filters.mode !== 'all') params.set('mode', filters.mode);
  if (filters.sort !== 'popular') params.set('sort', filters.sort);
  const query = params.toString();
  return query ? `/games?${query}` : '/games';
}

interface ChipRowProps {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}

function ChipRow({ label, value, options, onChange }: ChipRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-display text-label-sm text-fg-muted uppercase">{label}</span>
      <FilterGroup
        type="single"
        value={value}
        aria-label={label}
        onValueChange={(next) => {
          // Radix clears the value when the active chip is pressed again; keep "all" selected instead.
          if (next) onChange(next);
        }}
      >
        {Object.entries(options).map(([key, text]) => (
          <FilterChip key={key} value={key}>
            {text}
          </FilterChip>
        ))}
      </FilterGroup>
    </div>
  );
}

export function FilterBar({ filters, labels }: FilterBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.q);
  const isFiltered =
    filters.q !== '' ||
    filters.category !== 'all' ||
    filters.dimension !== 'all' ||
    filters.mode !== 'all';

  const apply = (next: Partial<CatalogFilters>) => {
    router.replace(toQuery({ ...filters, q: query, ...next }));
  };

  return (
    <div className="flex flex-col gap-5 rounded-xl border-2 border-border-subtle bg-surface-raised p-4 md:p-5">
      <form
        role="search"
        aria-label={labels.search}
        className="flex gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: query });
        }}
      >
        <SearchInput
          label={labels.search}
          placeholder={labels.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="flex-1"
          autoComplete="off"
        />
        {isFiltered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11"
            onClick={() => {
              setQuery('');
              router.replace('/games');
            }}
          >
            <X aria-hidden className="size-4" />
            {labels.clear}
          </Button>
        ) : null}
      </form>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChipRow
          label={labels.category}
          value={filters.category}
          options={labels.categories}
          onChange={(value) => apply({ category: value as CatalogFilters['category'] })}
        />
        <ChipRow
          label={labels.mode}
          value={filters.mode}
          options={labels.modes}
          onChange={(value) => apply({ mode: value as CatalogFilters['mode'] })}
        />
        <ChipRow
          label={labels.dimension}
          value={filters.dimension}
          options={labels.dimensions}
          onChange={(value) => apply({ dimension: value as CatalogFilters['dimension'] })}
        />
        <ChipRow
          label={labels.sort}
          value={filters.sort}
          options={labels.sorts}
          onChange={(value) => apply({ sort: value === 'new' ? 'new' : 'popular' })}
        />
      </div>
    </div>
  );
}
