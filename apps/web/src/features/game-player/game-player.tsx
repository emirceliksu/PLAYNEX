'use client';

import type { GameInstance, GameResult, GameRuntimeState, PlaySession } from '@playnex/game-sdk';
import type {
  AccentName,
  GamePlayerState,
  GameScoring,
  GameSetup,
  PlayMode,
} from '@playnex/shared-types';
import { Badge, Button, EmptyState, IconButton, ScoreValue } from '@playnex/ui';
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  WifiOff,
} from 'lucide-react';
import { useMessages, useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { Link } from '@/i18n/navigation';
import { formatDuration, localeTag } from '@/lib/format';
import { buildGamePalette } from '@/lib/games/palette';
import { loadGameModule } from '@/lib/games/registry';
import { useRoom } from '@/lib/realtime/use-room';

import { LocalSetup } from './lobby/local-setup';
import { ModePicker } from './lobby/mode-picker';
import { OnlineLobby } from './lobby/online-lobby';
import { ResultSummary } from './result-summary';
import { useBestScore } from './use-best-score';

export interface GamePlayerLabels {
  backToGame: string;
  score: string;
  best: string;
  time: string;
  pause: string;
  resume: string;
  restart: string;
  fullscreen: string;
  exitFullscreen: string;
  quit: string;
  localBestNote: string;
  loadingTitle: string;
  loadingHint: string;
  readyTitle: string;
  start: string;
  controls: string;
  pausedTitle: string;
  pausedHint: string;
  finishedTitle: string;
  newRecord: string;
  playAgain: string;
  backToCatalog: string;
  errorTitle: string;
  errorDescription: string;
  retry: string;
}

interface GamePlayerProps {
  game: {
    slug: string;
    title: string;
    accent: AccentName;
    controlsGuide: string[];
    scoring: GameScoring;
    setup: GameSetup;
  };
  locale: 'tr' | 'en';
  labels: GamePlayerLabels;
  // Development-only: forces a shell state so every screen can be reviewed and captured.
  preview?: GamePlayerState;
  // From an invite link (`?room=CODE`): opens the online lobby with the code filled in.
  roomCode?: string;
}

interface PlayerState {
  status: GamePlayerState;
  score: number;
  result: GameResult | null;
  isRecord: boolean;
  elapsedMs: number;
  startedAt: number | null;
}

type PlayerAction =
  | { type: 'runtime'; state: GameRuntimeState; now: number }
  | { type: 'score'; score: number }
  | { type: 'finish'; result: GameResult; isRecord: boolean }
  | { type: 'error' }
  | { type: 'tick'; now: number }
  | { type: 'reload' };

const initialState: PlayerState = {
  status: 'loading',
  score: 0,
  result: null,
  isRecord: false,
  elapsedMs: 0,
  startedAt: null,
};

const previewResult: GameResult = { score: 4110, durationMs: 272_000, stats: { apples: 41 } };

function reducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'runtime':
      switch (action.state) {
        case 'ready':
          return {
            ...state,
            status: 'ready',
            score: 0,
            result: null,
            isRecord: false,
            elapsedMs: 0,
            startedAt: null,
          };
        case 'playing':
          return state.status === 'paused'
            ? { ...state, status: 'playing', startedAt: action.now - state.elapsedMs }
            : {
                ...state,
                status: 'playing',
                result: null,
                isRecord: false,
                elapsedMs: 0,
                startedAt: action.now,
              };
        case 'paused':
          return { ...state, status: 'paused' };
        case 'finished':
          return { ...state, status: 'finished' };
      }
      return state;
    case 'score':
      return { ...state, score: action.score };
    case 'finish':
      return {
        ...state,
        status: 'finished',
        result: action.result,
        isRecord: action.isRecord,
        score: action.result.score,
        elapsedMs: action.result.durationMs,
      };
    case 'error':
      return { ...state, status: 'error' };
    case 'tick':
      return state.startedAt === null
        ? state
        : { ...state, elapsedMs: action.now - state.startedAt };
    case 'reload':
      return initialState;
  }
}

const accentDots: Record<AccentName, string> = {
  brand: 'bg-brand-solid',
  cyan: 'bg-cyan-solid',
  yellow: 'bg-yellow-solid',
  pink: 'bg-pink-solid',
  mint: 'bg-mint-solid',
  coral: 'bg-coral-solid',
};

const accentBars: Record<AccentName, string> = {
  brand: 'bg-brand-solid',
  cyan: 'bg-cyan-solid',
  yellow: 'bg-yellow-solid',
  pink: 'bg-pink-solid',
  mint: 'bg-mint-solid',
  coral: 'bg-coral-solid',
};

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-end leading-none">
      <span className="text-[0.625rem] font-semibold tracking-wider text-fg-muted uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

const soloSession: PlaySession = { mode: 'solo', players: [], options: {} };
const noMessages: Record<string, string> = {};

function needsSetup(setup: GameSetup): boolean {
  return setup.modes.length > 1 || setup.modes[0] !== 'solo' || setup.options.length > 0;
}

export function GamePlayer({ game, locale, labels, preview, roomCode }: GamePlayerProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [attempt, setAttempt] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [localSession, setLocalSession] = useState<PlaySession | null>(() =>
    preview || !needsSetup(game.setup) ? soloSession : null,
  );
  const [leftMatchId, setLeftMatchId] = useState<number | null>(null);
  const [mode, setMode] = useState<PlayMode | null>(() => {
    if (roomCode && game.setup.modes.includes('online')) return 'online';
    return game.setup.modes.length === 1 ? (game.setup.modes[0] ?? null) : null;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<GameInstance | null>(null);
  const { best, record } = useBestScore(game.slug);
  const room = useRoom(game.slug, locale);
  const t = useTranslations('lobby');
  const messages = useMessages();
  const tag = localeTag(locale);
  // Online, the room hands out a fresh session on every match.start; leaving the result
  // screen hides that match until the next one starts.
  const roomMatch = room.match;
  const session =
    mode === 'online'
      ? roomMatch && roomMatch.id !== leftMatchId
        ? roomMatch.session
        : null
      : localSession;
  const online = session?.mode === 'online';
  const solo = session?.mode === 'solo';
  const tracksBest = solo && game.scoring === 'high-score';

  const gameMessages =
    (messages.gameText as Record<string, Record<string, string> | undefined>)[game.slug] ??
    noMessages;

  useEffect(() => {
    if (!session) return;
    dispatch({ type: 'reload' });
    if (preview === 'loading') return;
    if (preview === 'error') {
      dispatch({ type: 'error' });
      return;
    }
    if (preview === 'finished') {
      dispatch({ type: 'finish', result: previewResult, isRecord: true });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let instance: GameInstance | null = null;
    const palette = buildGamePalette(game.accent);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    loadGameModule(game.slug)
      .then((module) =>
        module.mount(container, {
          locale,
          reducedMotion,
          palette,
          messages: gameMessages,
          session,
          onScore: (score) => dispatch({ type: 'score', score }),
          onStateChange: (runtime) =>
            dispatch({ type: 'runtime', state: runtime, now: Date.now() }),
          onFinish: (result) =>
            dispatch({
              type: 'finish',
              result,
              // Only solo high-score runs count as personal bests: versus results and
              // race times (lower is better) do not fit a single "higher wins" record.
              isRecord: tracksBest && record(result.score),
            }),
          onError: () => dispatch({ type: 'error' }),
        }),
      )
      .then((mounted) => {
        if (cancelled) {
          mounted.destroy();
          return;
        }
        instance = mounted;
        instanceRef.current = mounted;
        // The room already started the match; there is no ready screen to pass.
        if (session.mode === 'online' || preview === 'playing' || preview === 'paused') {
          mounted.start();
        }
        if (preview === 'paused') {
          mounted.pause();
        }
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'error' });
      });

    return () => {
      cancelled = true;
      instanceRef.current = null;
      instance?.destroy();
    };
  }, [game.slug, game.accent, locale, preview, attempt, record, session, gameMessages, tracksBest]);

  useEffect(() => {
    if (state.status !== 'playing') return;
    const interval = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 250);
    return () => window.clearInterval(interval);
  }, [state.status]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const togglePause = useCallback(() => {
    const instance = instanceRef.current;
    if (!instance || online) return;
    if (state.status === 'playing') instance.pause();
    else if (state.status === 'paused') instance.resume();
  }, [state.status, online]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (state.status === 'playing' || state.status === 'paused')) {
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.status, togglePause]);

  const start = () => instanceRef.current?.start();
  const restart = () => instanceRef.current?.restart();
  // Online this returns to the room (still joined); locally it reopens the mode or setup screen.
  const leaveMatch = () => {
    if (online) {
      setLeftMatchId(roomMatch?.id ?? null);
      return;
    }
    setLocalSession(null);
    if (game.setup.modes.length > 1) setMode(null);
  };
  const canChangeMode = !preview && needsSetup(game.setup);
  const retry = () => {
    dispatch({ type: 'reload' });
    setAttempt((count) => count + 1);
  };
  const toggleFullscreen = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void wrapper.requestFullscreen();
    }
  };

  const canPause = !online && (state.status === 'playing' || state.status === 'paused');
  const canRestart =
    session !== null && !online && state.status !== 'loading' && state.status !== 'error';
  const overlayClass = 'absolute inset-0 grid place-items-center bg-ink-950/80 p-4 animate-fade-in';
  const panelClass =
    'flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border-2 border-border-strong bg-surface-overlay p-6 text-center shadow-sticker-lg animate-pop-in';

  return (
    <div ref={wrapperRef} className="flex h-dvh flex-col bg-surface-canvas">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b-2 border-border-subtle px-2 md:gap-3 md:px-4">
        <IconButton asChild label={labels.backToGame} size="sm">
          <Link href={`/games/${game.slug}`}>
            <ArrowLeft />
          </Link>
        </IconButton>
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`size-2.5 shrink-0 rounded-full ${accentDots[game.accent]}`}
          />
          <h1 className="truncate font-display text-title-sm">{game.title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-4 md:gap-6">
          {game.scoring === 'high-score' ? (
            <Stat label={labels.score}>
              <ScoreValue value={state.score} locale={tag} className="text-title-md" />
            </Stat>
          ) : null}
          {tracksBest ? (
            <div className="hidden sm:block">
              <Stat label={labels.best}>
                <ScoreValue
                  value={Math.max(best, state.score)}
                  locale={tag}
                  animate={false}
                  className="text-title-md text-fg-secondary"
                />
              </Stat>
            </div>
          ) : null}
          <Stat label={labels.time}>
            <span className="font-display text-title-md text-fg-secondary tabular-nums">
              {formatDuration(state.elapsedMs)}
            </span>
          </Stat>
        </div>
        <div className="flex items-center gap-0.5 md:gap-1">
          <IconButton
            label={state.status === 'paused' ? labels.resume : labels.pause}
            size="sm"
            disabled={!canPause}
            onClick={togglePause}
          >
            {state.status === 'paused' ? <Play /> : <Pause />}
          </IconButton>
          <IconButton label={labels.restart} size="sm" disabled={!canRestart} onClick={restart}>
            <RotateCcw />
          </IconButton>
          <IconButton
            label={isFullscreen ? labels.exitFullscreen : labels.fullscreen}
            size="sm"
            onClick={toggleFullscreen}
            className="hidden sm:inline-flex"
          >
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </IconButton>
        </div>
      </header>

      <div className="grain relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0 overflow-hidden" />

        {session === null ? (
          <div className={`${overlayClass} overflow-y-auto`}>
            <div className={panelClass}>
              {mode === null ? (
                <ModePicker modes={game.setup.modes} onPick={setMode} />
              ) : mode === 'online' ? (
                <OnlineLobby
                  setup={game.setup}
                  room={room}
                  initialCode={roomCode}
                  canGoBack={game.setup.modes.length > 1}
                  onBack={() => setMode(null)}
                />
              ) : (
                <LocalSetup
                  mode={mode}
                  setup={game.setup}
                  canGoBack={game.setup.modes.length > 1}
                  onBack={() => setMode(null)}
                  onStart={setLocalSession}
                />
              )}
            </div>
          </div>
        ) : null}

        {online && room.status === 'reconnecting' ? (
          <p
            role="status"
            className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-yellow-soft px-4 py-2 text-body-sm text-yellow-text"
          >
            <WifiOff aria-hidden className="size-4" />
            {t('online.reconnecting')}
          </p>
        ) : null}

        {session !== null && state.status === 'loading' ? (
          <div className={overlayClass}>
            <div className={panelClass} role="status">
              <p className="font-display text-title-lg">{labels.loadingTitle}</p>
              <p className="text-body-sm text-fg-secondary">{labels.loadingHint}</p>
              <div className="h-2.5 w-full overflow-hidden rounded-full border-2 border-border-subtle bg-surface-sunken">
                <div
                  className={`h-full w-1/3 rounded-full ${accentBars[game.accent]} motion-safe:animate-[pn-slide_1.2s_ease-in-out_infinite]`}
                />
              </div>
            </div>
          </div>
        ) : null}

        {!online && state.status === 'ready' ? (
          <div className={overlayClass}>
            <div className={panelClass}>
              <p className="font-display text-display-sm">{labels.readyTitle}</p>
              <div className="w-full text-left">
                <p className="mb-2 text-label-sm text-fg-muted uppercase">{labels.controls}</p>
                <ul className="flex flex-col gap-1.5">
                  {game.controlsGuide.map((line) => (
                    <li key={line} className="flex gap-2 text-body-sm text-fg-secondary">
                      <span
                        aria-hidden
                        className={`mt-2 size-1.5 shrink-0 rounded-full ${accentDots[game.accent]}`}
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col gap-2">
                <Button size="lg" onClick={start} className="w-full" autoFocus>
                  <Play aria-hidden className="size-5" />
                  {labels.start}
                </Button>
                {canChangeMode ? (
                  <Button variant="ghost" onClick={leaveMatch}>
                    <Shuffle aria-hidden className="size-4" />
                    {t('changeMode')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {state.status === 'paused' ? (
          <div className={overlayClass}>
            <div className={panelClass}>
              <p className="font-display text-display-sm">{labels.pausedTitle}</p>
              <p className="text-body-sm text-fg-secondary">{labels.pausedHint}</p>
              <div className="flex w-full flex-col gap-2">
                <Button size="lg" onClick={togglePause} autoFocus>
                  <Play aria-hidden className="size-5" />
                  {labels.resume}
                </Button>
                <Button variant="secondary" onClick={restart}>
                  <RotateCcw aria-hidden className="size-4" />
                  {labels.restart}
                </Button>
                <Button asChild variant="ghost">
                  <Link href={`/games/${game.slug}`}>{labels.quit}</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {session !== null && state.status === 'finished' ? (
          <div className={overlayClass}>
            <div className={panelClass} role="dialog" aria-labelledby="result-title">
              {state.isRecord ? (
                <Badge sticker tone="yellow" className="-mt-9 text-label-md">
                  {labels.newRecord}
                </Badge>
              ) : null}
              {state.result?.outcome ? (
                <ResultSummary
                  outcome={state.result.outcome}
                  players={state.result.participants ?? session.players}
                  selfSeat={session.mode === 'online' ? session.seat : solo ? 0 : null}
                  scoring={game.scoring}
                  locale={locale}
                />
              ) : (
                <>
                  <p id="result-title" className="font-display text-title-md text-fg-secondary">
                    {labels.finishedTitle}
                  </p>
                  <ScoreValue
                    value={state.score}
                    locale={tag}
                    className="text-display-xl leading-none"
                  />
                  <dl className="flex w-full justify-center gap-8 text-center">
                    {tracksBest ? (
                      <div>
                        <dt className="text-label-sm text-fg-muted uppercase">{labels.best}</dt>
                        <dd className="font-display text-title-md tabular-nums">
                          {new Intl.NumberFormat(tag).format(Math.max(best, state.score))}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-label-sm text-fg-muted uppercase">{labels.time}</dt>
                      <dd className="font-display text-title-md tabular-nums">
                        {formatDuration(state.elapsedMs)}
                      </dd>
                    </div>
                  </dl>
                </>
              )}
              <div className="flex w-full flex-col gap-2">
                {online ? (
                  <Button size="lg" onClick={leaveMatch} autoFocus>
                    <RotateCcw aria-hidden className="size-5" />
                    {t('result.backToRoom')}
                  </Button>
                ) : (
                  <Button size="lg" onClick={restart} autoFocus disabled={preview === 'finished'}>
                    <RotateCcw aria-hidden className="size-5" />
                    {labels.playAgain}
                  </Button>
                )}
                {!online && canChangeMode ? (
                  <Button variant="secondary" onClick={leaveMatch}>
                    <Shuffle aria-hidden className="size-4" />
                    {t('changeMode')}
                  </Button>
                ) : null}
                <Button asChild variant={online || canChangeMode ? 'ghost' : 'secondary'}>
                  <Link href="/games">{labels.backToCatalog}</Link>
                </Button>
              </div>
              {tracksBest ? (
                <p className="text-label-sm text-fg-muted">{labels.localBestNote}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {state.status === 'error' ? (
          <div className={overlayClass}>
            <EmptyState
              tone="error"
              title={labels.errorTitle}
              description={labels.errorDescription}
              className="w-full max-w-sm bg-surface-overlay"
              action={
                <div className="flex gap-2">
                  <Button onClick={retry}>{labels.retry}</Button>
                  <Button asChild variant="ghost">
                    <Link href={`/games/${game.slug}`}>{labels.quit}</Link>
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
