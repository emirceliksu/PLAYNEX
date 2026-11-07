'use client';

import type { CreatorRun, GameDocument } from '@playnex/creator-runtime';
import { useCallback, useEffect, useRef } from 'react';

import { GamePlayer, type GamePlayerLabels } from '@/features/game-player/game-player';
import { swatchHex } from '@/lib/creator/swatches';

import { countPlay, finishRun, startRun } from './actions';
import { useRuntimeMessages } from './use-runtime-messages';

interface CreatorPlayerProps {
  release: { id: string; title: string; document: GameDocument };
  controlsGuide: string[];
  labels: GamePlayerLabels;
  locale: 'tr' | 'en';
  viewer: string | null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function CreatorPlayer({
  release,
  controlsGuide,
  labels,
  locale,
  viewer,
}: CreatorPlayerProps) {
  const messages = useRuntimeMessages();
  const runRef = useRef<string | null>(null);

  useEffect(() => {
    void countPlay(release.id);
  }, [release.id]);

  // Signed-in runs take their seed from the server so the result can be replayed
  // and ranked; guests play a local seed that never reaches the leaderboard.
  const loadModule = useCallback(
    () =>
      import('@playnex/creator-runtime/game').then(({ createCreatorGame }) =>
        createCreatorGame(release.document, {
          swatches: [...swatchHex],
          seedSource: async () => {
            const run = viewer ? await startRun(release.id) : null;
            runRef.current = run?.id ?? null;
            return run?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!;
          },
          onRun: (run: CreatorRun) => {
            const runId = runRef.current;
            runRef.current = null;
            if (!runId) return;
            void finishRun(runId, {
              inputLog: toBase64(run.inputLog),
              score: run.score,
              ticks: run.ticks,
            });
          },
        }),
      ),
    [release.id, release.document, viewer],
  );

  return (
    <GamePlayer
      game={{
        slug: `creator-${release.id}`,
        title: release.title,
        accent: release.document.dimension === '2d' ? 'cyan' : 'pink',
        controlsGuide,
        messages,
        scoring: 'high-score',
        setup: { modes: ['solo'], options: [] },
      }}
      locale={locale}
      labels={labels}
      viewer={viewer}
      loadModule={loadModule}
      backHref={`/community/${release.id}`}
      catalogHref="/community"
    />
  );
}
