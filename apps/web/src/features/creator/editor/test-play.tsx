'use client';

import { createCreatorGame, type Diagnostic, type GameDocument } from '@playnex/creator-runtime';
import type { GameInstance } from '@playnex/game-sdk';
import { Button } from '@playnex/ui';
import { RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { buildGamePalette } from '@/lib/games/palette';

import { useRuntimeMessages } from '../use-runtime-messages';

interface TestPlayProps {
  document: GameDocument;
  swatches: readonly string[];
  locale: 'tr' | 'en';
  onClose: () => void;
  onDiagnostics: (diagnostics: Diagnostic[]) => void;
}

type Phase = 'loading' | 'playing' | 'finished' | 'failed';

export function TestPlay({ document, swatches, locale, onClose, onDiagnostics }: TestPlayProps) {
  const t = useTranslations('creator.editor.testPlay');
  const messages = useRuntimeMessages();
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<GameInstance | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [score, setScore] = useState(0);
  // The document is frozen when the test starts; editing continues underneath.
  const [snapshot] = useState(document);
  const diagnosticsRef = useRef(onDiagnostics);
  useLayoutEffect(() => {
    diagnosticsRef.current = onDiagnostics;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    const game = createCreatorGame(snapshot, {
      swatches: [...swatches],
      onDiagnostics: (diagnostics) => diagnosticsRef.current(diagnostics),
    });
    game
      .mount(container, {
        locale,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        palette: buildGamePalette('brand'),
        messages,
        session: { mode: 'solo', players: [], options: {} },
        onScore: setScore,
        onStateChange: (state) => {
          if (state === 'playing') setPhase('playing');
          if (state === 'finished') setPhase('finished');
        },
        onFinish: () => undefined,
        onError: () => setPhase('failed'),
      })
      .then((instance) => {
        if (disposed) {
          instance.destroy();
          return;
        }
        instanceRef.current = instance;
        instance.start();
      })
      .catch(() => setPhase('failed'));
    return () => {
      disposed = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [snapshot, swatches, locale, messages]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-50 flex flex-col bg-surface-canvas"
    >
      <div className="flex items-center justify-between gap-3 border-b-2 border-border-subtle px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-label-sm text-fg-muted uppercase">{t('title')}</span>
          <span className="font-display text-score-md tabular-nums" aria-live="polite">
            {score}
          </span>
          <span className="text-body-sm text-fg-muted" role="status">
            {phase === 'finished' ? t('finished') : phase === 'failed' ? t('failed') : t('hint')}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setScore(0);
              instanceRef.current?.restart();
            }}
          >
            <RotateCcw aria-hidden className="size-4" />
            {t('restart')}
          </Button>
          <Button size="sm" onClick={onClose}>
            <X aria-hidden className="size-4" />
            {t('close')}
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="relative min-h-0 flex-1" />
    </div>
  );
}
