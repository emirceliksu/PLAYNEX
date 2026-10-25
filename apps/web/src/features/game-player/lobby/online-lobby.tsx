'use client';

import type { GameOptionValue, GameSetup } from '@playnex/shared-types';
import { Badge, Button, IconButton, TextField } from '@playnex/ui';
import { ArrowLeft, Check, Copy, Crown, LogOut, Play, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useSyncExternalStore } from 'react';

import type { RoomController } from '@/lib/realtime/use-room';

import { defaultOptions, OptionChips } from './option-chips';

const NICKNAME_KEY = 'playnex:nickname';

function readNickname(): string {
  try {
    return window.localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function subscribeNothing() {
  return () => undefined;
}

function storeNickname(nickname: string) {
  try {
    window.localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // The field just starts empty next time.
  }
}

export function OnlineLobby({
  setup,
  room,
  initialCode,
  canGoBack,
  onBack,
}: {
  setup: GameSetup;
  room: RoomController;
  initialCode?: string;
  canGoBack: boolean;
  onBack: () => void;
}) {
  const t = useTranslations('lobby');
  const specs = setup.options.filter((spec) => spec.modes.includes('online'));
  // The stored nickname is read through an external-store snapshot so the server render stays empty.
  const storedNickname = useSyncExternalStore(subscribeNothing, readNickname, () => '');
  const [draftNickname, setNickname] = useState<string | null>(null);
  const nickname = draftNickname ?? storedNickname;
  const [code, setCode] = useState(initialCode ?? '');
  const [values, setValues] = useState<Record<string, GameOptionValue>>(() =>
    defaultOptions(specs),
  );
  const [copied, setCopied] = useState(false);
  const autoJoined = useRef(false);

  const errorText = room.error
    ? t.has(`errors.${room.error}` as 'errors.generic')
      ? t(`errors.${room.error}` as 'errors.generic')
      : t('errors.generic')
    : null;
  // A reconnect keeps the room on screen; before the first hello there is nothing to show yet.
  const connected =
    room.status === 'open' || (room.status === 'reconnecting' && room.room !== null);
  const busy = room.status === 'connecting' || room.status === 'reconnecting';

  const connect = () => {
    const trimmed = nickname.trim();
    storeNickname(trimmed);
    room.connect(trimmed, () => {
      if (initialCode && !autoJoined.current) {
        autoJoined.current = true;
        room.join(initialCode);
      }
    });
  };

  const header = (title: string, back?: () => void) => (
    <div className="flex items-center gap-2">
      {back ? (
        <IconButton label={t('back')} size="sm" type="button" onClick={back}>
          <ArrowLeft />
        </IconButton>
      ) : null}
      <p className="font-display text-title-lg">{title}</p>
    </div>
  );

  const errorLine = errorText ? (
    <p role="alert" className="text-body-sm text-coral-text">
      {errorText}
    </p>
  ) : null;

  if (!connected) {
    return (
      <form
        className="flex w-full flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          connect();
        }}
      >
        {header(t('modes.online.title'), canGoBack ? onBack : undefined)}
        <TextField
          label={t('online.nickname')}
          hint={t('online.nicknameHint')}
          value={nickname}
          minLength={2}
          maxLength={16}
          required
          autoComplete="nickname"
          autoFocus
          onChange={(event) => setNickname(event.target.value)}
        />
        {room.status === 'closed' ? (
          <p role="alert" className="flex items-center gap-2 text-body-sm text-coral-text">
            <WifiOff aria-hidden className="size-4" />
            {t('online.closed')}
          </p>
        ) : null}
        {errorLine}
        <Button type="submit" size="lg" isLoading={busy} loadingLabel={t('online.connecting')}>
          {initialCode ? t('online.joinCode', { code: initialCode }) : t('online.connect')}
        </Button>
      </form>
    );
  }

  const current = room.room;
  if (!current) {
    return (
      <div className="flex w-full flex-col gap-5">
        {header(t('modes.online.title'), () => {
          room.disconnect();
          if (canGoBack) onBack();
        })}
        <OptionChips
          specs={specs}
          values={values}
          onChange={(key, value) => setValues((state) => ({ ...state, [key]: value }))}
        />
        <Button size="lg" onClick={() => room.create(values)}>
          {t('online.create')}
        </Button>
        <div className="flex items-center gap-3 text-label-sm text-fg-muted uppercase">
          <span aria-hidden className="h-0.5 flex-1 bg-border-subtle" />
          {t('online.or')}
          <span aria-hidden className="h-0.5 flex-1 bg-border-subtle" />
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            room.join(code);
          }}
        >
          <TextField
            className="flex-1"
            label={t('online.code')}
            placeholder="ABC234"
            value={code}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <Button type="submit" variant="secondary" disabled={code.trim().length !== 6}>
            {t('online.join')}
          </Button>
        </form>
        {errorLine}
      </div>
    );
  }

  const me = current.members.find((member) => member.id === room.playerId);
  const isHost = current.hostId === room.playerId;
  const othersReady = current.members.every(
    (member) => member.id === current.hostId || (member.ready && member.connected),
  );
  const enoughPlayers = current.members.length >= current.minPlayers;
  const inviteUrl = () => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('room', current.code);
    return url.toString();
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col items-center gap-1">
        <p className="text-label-sm text-fg-muted uppercase">{t('online.roomCode')}</p>
        <p
          className="font-display text-display-md tracking-[0.2em] tabular-nums"
          data-testid="room-code"
        >
          {current.code}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(inviteUrl()).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2_000);
            });
          }}
        >
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {copied ? t('online.copied') : t('online.invite')}
        </Button>
      </div>

      <div className="text-left">
        <p className="mb-2 text-label-sm text-fg-muted uppercase">
          {t('online.players', { count: current.members.length, max: current.maxPlayers })}
        </p>
        <ul className="flex flex-col gap-1.5" data-testid="room-members">
          {current.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-2 rounded-lg border-2 border-border-subtle bg-surface-sunken px-3 py-2"
            >
              {member.id === current.hostId ? (
                <Crown aria-label={t('online.host')} className="size-4 text-yellow-text" />
              ) : null}
              <span className="truncate font-display text-body-md">{member.nickname}</span>
              {member.id === room.playerId ? (
                <span className="text-label-sm text-fg-muted">({t('online.you')})</span>
              ) : null}
              <span className="ml-auto">
                {!member.connected ? (
                  <Badge tone="coral">{t('online.offline')}</Badge>
                ) : member.id === current.hostId ? null : member.ready ? (
                  <Badge tone="mint">{t('online.ready')}</Badge>
                ) : (
                  <Badge>{t('online.notReady')}</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {room.status === 'reconnecting' ? (
        <p role="status" className="flex items-center gap-2 text-body-sm text-yellow-text">
          <WifiOff aria-hidden className="size-4" />
          {t('online.reconnecting')}
        </p>
      ) : null}
      {errorLine}

      <div className="flex flex-col gap-2">
        {isHost ? (
          <>
            <Button
              size="lg"
              disabled={!enoughPlayers || !othersReady}
              onClick={() => room.start()}
              data-testid="room-start"
            >
              <Play aria-hidden className="size-5" />
              {t('online.start')}
            </Button>
            {!enoughPlayers ? (
              <p className="text-body-sm text-fg-muted">
                {t('online.needPlayers', { min: current.minPlayers })}
              </p>
            ) : !othersReady ? (
              <p className="text-body-sm text-fg-muted">{t('online.waitingReady')}</p>
            ) : null}
          </>
        ) : (
          <>
            <Button
              size="lg"
              variant={me?.ready ? 'secondary' : 'primary'}
              onClick={() => room.setReady(!me?.ready)}
              data-testid="room-ready"
            >
              {me?.ready ? t('online.unsetReady') : t('online.setReady')}
            </Button>
            <p className="text-body-sm text-fg-muted">{t('online.waitingHost')}</p>
          </>
        )}
        <Button variant="ghost" onClick={() => room.leave()}>
          <LogOut aria-hidden className="size-4" />
          {t('online.leave')}
        </Button>
      </div>
    </div>
  );
}
