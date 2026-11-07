'use client';

import { Badge, Button, cn, SceneCover, type SceneShape } from '@playnex/ui';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { type ActionState, createProject } from './actions';

export interface TemplateChoice {
  id: string;
  dimension: '2d' | '3d';
  title: string;
  description: string;
  cover: { width: number; height: number; background: string; shapes: SceneShape[] };
}

export function NewProjectForm({ templates }: { templates: TemplateChoice[] }) {
  const t = useTranslations('creator.workshop');
  const [state, action, pending] = useActionState(createProject, {} satisfies ActionState);
  const [selected, setSelected] = useState(templates[0]?.id ?? '');
  const [title, setTitle] = useState(templates[0]?.title ?? '');
  const [edited, setEdited] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-4 text-body-md text-fg-secondary">{t('pickTemplate')}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {templates.map((template) => {
            const active = template.id === selected;
            return (
              <label
                key={template.id}
                className={cn(
                  'group flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 bg-surface-raised transition-transform duration-(--pn-duration-fast) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-border-focus motion-reduce:transition-none',
                  active
                    ? 'border-brand-solid shadow-sticker'
                    : 'border-border-subtle hover:-translate-y-0.5 hover:border-border-strong motion-reduce:hover:translate-y-0',
                )}
              >
                <input
                  type="radio"
                  name="template"
                  value={template.id}
                  checked={active}
                  className="sr-only"
                  onChange={() => {
                    setSelected(template.id);
                    if (!edited) setTitle(template.title);
                  }}
                />
                <SceneCover {...template.cover} title={template.title} />
                <span className="flex flex-col gap-1.5 p-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-display text-title-sm">{template.title}</span>
                    <Badge tone={template.dimension === '2d' ? 'cyan' : 'pink'}>
                      {template.dimension.toUpperCase()}
                    </Badge>
                  </span>
                  <span className="text-body-sm text-fg-secondary">{template.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 rounded-xl border-2 border-border-subtle bg-surface-raised p-4 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-label-md text-fg-secondary">{t('gameName')}</span>
          <input
            name="title"
            value={title}
            required
            maxLength={60}
            className="h-11 rounded-md border-2 border-border-strong bg-surface-sunken px-3 text-body-md text-fg-primary focus-visible:outline-2 focus-visible:outline-border-focus"
            onChange={(event) => {
              setTitle(event.target.value);
              setEdited(true);
            }}
          />
        </label>
        <Button type="submit" size="lg" isLoading={pending} loadingLabel={t('creating')}>
          <Sparkles aria-hidden className="size-5" />
          {t('create')}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-body-sm text-coral-text">
          {t.has(`errors.${state.error}` as 'errors.generic')
            ? t(`errors.${state.error}` as 'errors.generic')
            : t('errors.generic')}
        </p>
      ) : null}
    </form>
  );
}
