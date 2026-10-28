'use client';

import { Badge, Button, FilterChip, FilterGroup, IconButton, TextField } from '@playnex/ui';
import { ArrowLeft, Bot, Crown, LogIn, LogOut, RefreshCw, Send, Users, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { ReportButton } from '@/features/siper/report-button';
import { Link } from '@/i18n/navigation';
import type { RoomController, RoomMember, RoomState } from '@/lib/realtime/use-room';

const MODES = ['tdm', 'bomb', 'knife', 'ffa', 'gungame'] as const;
const MAPS = ['liman', 'carsi', 'santral'] as const;
const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
const TEAM_SIZES = ['1', '2', '3', '4', '5'] as const;
const FFA_SIZES = ['2', '4', '6', '8', '10'] as const;
const ONLINE_BOTS = ['off', 'easy', 'normal', 'hard'] as const;

type Mode = (typeof MODES)[number];

const teamModes = new Set<string>(['tdm', 'bomb', 'knife']);

async function fetchTicket(): Promise<string | null> {
  try {
    const response = await fetch('/api/realtime/ticket', { method: 'POST' });
    if (!response.ok) return null;
    const body = (await response.json()) as { ticket?: string };
    return body.ticket ?? null;
  } catch {
    return null;
  }
}

function Choice<T extends string>({
  label,
  values,
  value,
  onChange,
  render,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  render: (value: T) => string;
}) {
  return (
    <fieldset className="flex flex-col gap-2 text-left">
      <legend className="mb-2 text-label-sm text-fg-muted uppercase">{label}</legend>
      <FilterGroup
        type="single"
        value={value}
        aria-label={label}
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
      >
        {values.map((item) => (
          <FilterChip key={item} value={item}>
            {render(item)}
          </FilterChip>
        ))}
      </FilterGroup>
    </fieldset>
  );
}

export function SiperLobby({
  room,
  viewer,
  initialCode,
}: {
  room: RoomController;
  viewer: string | null;
  initialCode?: string;
}) {
  const t = useTranslations('siper.lobby');
  const [tab, setTab] = useState<'bots' | 'online'>(viewer || initialCode ? 'online' : 'bots');
  const [mode, setMode] = useState<Mode>('tdm');
  const [map, setMap] = useState<(typeof MAPS)[number]>('liman');
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>('normal');
  const [size, setSize] = useState('5');
  const [onlineBots, setOnlineBots] = useState<(typeof ONLINE_BOTS)[number]>('normal');
  const [code, setCode] = useState(initialCode ?? '');
  const [partyCode, setPartyCode] = useState('');
  const autoStart = useRef(false);
  const joined = useRef(false);

  const current = room.room;
  const connected = room.status === 'open' || (room.status === 'reconnecting' && current !== null);
  const signedIn = room.account !== null;
  const sizes: readonly string[] = teamModes.has(mode) ? TEAM_SIZES : FFA_SIZES;
  // Switching between team and free-for-all modes can leave the old size out of range.
  const players = sizes.includes(size) ? size : (sizes.at(-1) ?? '5');
  const errorText = room.error
    ? t.has(`errors.${room.error}` as 'errors.generic')
      ? t(`errors.${room.error}` as 'errors.generic')
      : t('errors.generic')
    : null;

  // Bot matches skip the waiting room: the room is created and started in one go.
  useEffect(() => {
    if (
      autoStart.current &&
      current?.solo &&
      current.phase === 'lobby' &&
      current.hostId === room.playerId
    ) {
      autoStart.current = false;
      room.start();
    }
  }, [current, room]);

  useEffect(() => {
    if (tab !== 'online' || !viewer || room.status !== 'idle') return;
    room.connect(
      viewer,
      () => {
        room.listRooms();
        if (initialCode && !joined.current) {
          joined.current = true;
          room.join(initialCode);
        }
      },
      fetchTicket,
    );
  }, [tab, viewer, room, initialCode]);

  const playBots = () => {
    const create = () => {
      autoStart.current = true;
      room.createWith({ mode, map, bots: difficulty, size: Number(players), solo: true });
    };
    if (room.status === 'open') create();
    else room.connect(viewer ?? t('guestName'), create, viewer ? fetchTicket : undefined);
  };

  const errorLine = errorText ? (
    <p role="alert" className="text-body-sm text-coral-text">
      {errorText}
    </p>
  ) : null;

  if (current && !current.solo) {
    return <RoomPanel room={room} current={current} viewer={viewer} errorLine={errorLine} />;
  }
  if (current?.solo) {
    return (
      <p role="status" className="font-display text-title-md">
        {t('startingBots')}
      </p>
    );
  }

  const modeLabel = (value: Mode) => t(`modes.${value}` as 'modes.tdm');
  const mapLabel = (value: string) => t(`maps.${value}` as 'maps.liman');

  return (
    <div className="flex w-full flex-col gap-5 text-left">
      <div className="flex flex-col gap-1">
        <p className="font-display text-title-lg">{t('title')}</p>
        <p className="text-body-sm text-fg-secondary">{t('subtitle')}</p>
      </div>
      <FilterGroup
        type="single"
        value={tab}
        aria-label={t('title')}
        onValueChange={(next) => {
          if (next) setTab(next as 'bots' | 'online');
        }}
      >
        <FilterChip value="bots">
          <Bot aria-hidden className="size-4" />
          {t('tabBots')}
        </FilterChip>
        <FilterChip value="online">
          <Users aria-hidden className="size-4" />
          {t('tabOnline')}
        </FilterChip>
      </FilterGroup>

      <Choice label={t('mode')} values={MODES} value={mode} onChange={setMode} render={modeLabel} />
      <p className="-mt-3 text-body-sm text-fg-muted">
        {t(`modeHints.${mode}` as 'modeHints.tdm')}
      </p>

      {tab === 'bots' ? (
        <>
          <Choice label={t('map')} values={MAPS} value={map} onChange={setMap} render={mapLabel} />
          <Choice
            label={t('difficulty')}
            values={DIFFICULTIES}
            value={difficulty}
            onChange={setDifficulty}
            render={(value) => t(`difficulties.${value}` as 'difficulties.normal')}
          />
          <Choice
            label={teamModes.has(mode) ? t('teamSize') : t('playerCount')}
            values={sizes}
            value={players}
            onChange={setSize}
            render={(value) => (teamModes.has(mode) ? t('perTeam', { n: value }) : value)}
          />
          {errorLine}
          <Button
            size="lg"
            onClick={playBots}
            isLoading={room.status === 'connecting'}
            loadingLabel={t('connecting')}
          >
            <Bot aria-hidden className="size-5" />
            {t('playBots')}
          </Button>
          <p className="text-body-sm text-fg-muted">{t('botsNote')}</p>
        </>
      ) : !viewer ? (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-border-subtle bg-surface-sunken p-4">
          <p className="font-display text-title-sm">{t('accountTitle')}</p>
          <p className="text-body-sm text-fg-secondary">{t('accountBody')}</p>
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent('/play/siper')}`}>
              <LogIn aria-hidden className="size-4" />
              {t('signIn')}
            </Link>
          </Button>
        </div>
      ) : !connected ? (
        <p role="status" className="text-body-md text-fg-secondary">
          {room.status === 'closed' ? t('offline') : t('connecting')}
        </p>
      ) : !signedIn ? (
        <p role="alert" className="text-body-sm text-coral-text">
          {t('errors.invalid_ticket')}
        </p>
      ) : (
        <>
          <Button size="lg" onClick={() => room.quickMatch(mode)}>
            <Zap aria-hidden className="size-5" />
            {t('quickMatch')}
          </Button>
          <PartyPanel room={room} code={partyCode} setCode={setPartyCode} />

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-label-sm text-fg-muted uppercase">{t('openRooms')}</p>
              <IconButton label={t('refresh')} size="sm" onClick={() => room.listRooms()}>
                <RefreshCw />
              </IconButton>
            </div>
            {room.rooms.length === 0 ? (
              <p className="text-body-sm text-fg-muted">{t('noRooms')}</p>
            ) : (
              <ul
                className="flex max-h-48 flex-col gap-1.5 overflow-y-auto"
                data-testid="siper-rooms"
              >
                {room.rooms.map((listed) => (
                  <li
                    key={listed.code}
                    className="flex items-center gap-2 rounded-lg border-2 border-border-subtle bg-surface-sunken px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-body-sm">
                      <span className="font-semibold">
                        {listed.mode ? t(`modes.${listed.mode}` as 'modes.tdm') : '—'}
                      </span>
                      {' · '}
                      {listed.map ? t(`maps.${listed.map}` as 'maps.liman') : ''}
                    </span>
                    <Badge tone={listed.phase === 'playing' ? 'yellow' : 'mint'}>
                      {listed.players}/{listed.maxPlayers}
                    </Badge>
                    <Button size="sm" variant="secondary" onClick={() => room.join(listed.code)}>
                      {t('join')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="rounded-xl border-2 border-border-subtle p-3">
            <summary className="cursor-pointer text-label-md">{t('createRoom')}</summary>
            <div className="mt-3 flex flex-col gap-4">
              <Choice
                label={t('map')}
                values={MAPS}
                value={map}
                onChange={setMap}
                render={mapLabel}
              />
              <Choice
                label={t('bots')}
                values={ONLINE_BOTS}
                value={onlineBots}
                onChange={setOnlineBots}
                render={(value) => t(`onlineBots.${value}` as 'onlineBots.off')}
              />
              <Choice
                label={teamModes.has(mode) ? t('teamSize') : t('playerCount')}
                values={sizes}
                value={players}
                onChange={setSize}
                render={(value) => (teamModes.has(mode) ? t('perTeam', { n: value }) : value)}
              />
              <Button
                variant="secondary"
                onClick={() => room.createWith({ mode, map, bots: onlineBots, size: Number(players) })}
              >
                {t('create')}
              </Button>
            </div>
          </details>

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              room.join(code);
            }}
          >
            <TextField
              className="flex-1"
              label={t('code')}
              placeholder="ABC234"
              value={code}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
            <Button type="submit" variant="secondary" disabled={code.trim().length !== 6}>
              {t('join')}
            </Button>
          </form>
          {errorLine}
        </>
      )}
    </div>
  );
}

function PartyPanel({
  room,
  code,
  setCode,
}: {
  room: RoomController;
  code: string;
  setCode: (code: string) => void;
}) {
  const t = useTranslations('siper.lobby');
  const party = room.party;
  if (party) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border-2 border-border-subtle bg-surface-sunken p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-label-md">{t('partyCode', { code: party.code })}</p>
          <Button size="sm" variant="ghost" onClick={() => room.leaveParty()}>
            {t('leaveParty')}
          </Button>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {party.members.map((member) => (
            <li key={member.id}>
              <Badge tone={member.id === party.leader ? 'yellow' : 'neutral'}>
                {member.id === party.leader ? <Crown aria-hidden className="size-3" /> : null}
                {member.nickname}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-fg-muted">{t('partyHint')}</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <p className="text-label-sm text-fg-muted uppercase">{t('party')}</p>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim().length === 6) room.joinParty(code);
          else room.createParty();
        }}
      >
        <TextField
          className="flex-1"
          label={t('partyJoinLabel')}
          placeholder="XYZ789"
          value={code}
          maxLength={6}
          autoComplete="off"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <Button type="submit" variant="secondary">
          {code.trim().length === 6 ? t('joinParty') : t('createParty')}
        </Button>
      </form>
    </section>
  );
}

function RoomPanel({
  room,
  current,
  viewer,
  errorLine,
}: {
  room: RoomController;
  current: RoomState;
  viewer: string | null;
  errorLine: ReactNode;
}) {
  const t = useTranslations('siper.lobby');
  const [message, setMessage] = useState('');
  const mode = String(current.options.mode ?? 'tdm');
  const map = String(current.options.map ?? 'liman');
  const teams = teamModes.has(mode);
  const isHost = current.hostId === room.playerId;
  const me = current.members.find((member) => member.id === room.playerId);
  const othersReady = current.members.every(
    (member) => member.id === current.hostId || (member.ready && member.connected),
  );

  const memberRow = (member: RoomMember) => (
    <li
      key={member.id}
      className="flex items-center gap-2 rounded-lg border-2 border-border-subtle bg-surface-sunken px-3 py-1.5"
    >
      {member.id === current.hostId ? (
        <Crown aria-label={t('host')} className="size-4 text-yellow-text" />
      ) : null}
      <span className="truncate font-display text-body-md">{member.nickname}</span>
      {member.id === room.playerId ? (
        <span className="text-label-sm text-fg-muted">({t('you')})</span>
      ) : null}
      <span className="ml-auto flex items-center gap-1">
        {!member.connected ? (
          <Badge tone="coral">{t('offlineBadge')}</Badge>
        ) : member.id !== current.hostId && !current.quick ? (
          <Badge tone={member.ready ? 'mint' : 'neutral'}>
            {member.ready ? t('ready') : t('notReady')}
          </Badge>
        ) : null}
        {viewer && member.username && member.id !== room.playerId ? (
          <ReportButton username={member.username} />
        ) : null}
      </span>
    </li>
  );

  const column = (team: number | null, title: string) => (
    <div key={String(team)} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p
          className={`text-label-sm uppercase ${team === 0 ? 'text-coral-text' : team === 1 ? 'text-cyan-text' : 'text-fg-muted'}`}
        >
          {title}
        </p>
        {!current.quick && current.phase === 'lobby' && me?.team !== team ? (
          <Button size="sm" variant="ghost" onClick={() => room.pickTeam(team)}>
            {t('switchHere')}
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1.5">
        {current.members.filter((member) => (member.team ?? null) === team).map(memberRow)}
      </ul>
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <div className="flex items-center gap-2">
        <IconButton label={t('leave')} size="sm" onClick={() => room.leave()}>
          <ArrowLeft />
        </IconButton>
        <div className="min-w-0">
          <p className="font-display text-title-md">
            {t(`modes.${mode}` as 'modes.tdm')} · {t(`maps.${map}` as 'maps.liman')}
          </p>
          <p className="text-label-sm text-fg-muted" data-testid="room-code">
            {current.quick ? t('quickRoom') : t('roomCode', { code: current.code })}
          </p>
        </div>
      </div>

      {teams && !current.quick ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {column(0, t('teamAttackers'))}
          {column(1, t('teamDefenders'))}
          <div className="sm:col-span-2">{column(null, t('unassigned'))}</div>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="room-members">
          {current.members.map(memberRow)}
        </ul>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-label-sm text-fg-muted uppercase">{t('chat')}</p>
        <ol
          className="flex max-h-32 flex-col gap-0.5 overflow-y-auto rounded-lg bg-surface-sunken p-2 text-body-sm"
          aria-live="polite"
        >
          {room.chatLog.length === 0 ? <li className="text-fg-muted">{t('chatEmpty')}</li> : null}
          {room.chatLog.map((line) => (
            <li key={line.id}>
              <span className="font-semibold">{line.from}:</span> {line.text}
            </li>
          ))}
        </ol>
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim()) room.chat(message.trim(), false);
            setMessage('');
          }}
        >
          <TextField
            className="flex-1"
            label={t('chatLabel')}
            value={message}
            maxLength={160}
            autoComplete="off"
            onChange={(event) => setMessage(event.target.value)}
          />
          <IconButton label={t('send')} type="submit">
            <Send />
          </IconButton>
        </form>
      </section>

      {errorLine}
      {current.quick ? (
        <p role="status" className="text-body-sm text-fg-secondary">
          {current.phase === 'playing' ? t('quickJoining') : t('quickNext')}
        </p>
      ) : isHost ? (
        <Button
          size="lg"
          disabled={!othersReady}
          onClick={() => room.start()}
          data-testid="room-start"
        >
          {t('start')}
        </Button>
      ) : (
        <Button
          size="lg"
          variant={me?.ready ? 'secondary' : 'primary'}
          onClick={() => room.setReady(!me?.ready)}
          data-testid="room-ready"
        >
          {me?.ready ? t('unsetReady') : t('setReady')}
        </Button>
      )}
      {!current.quick && teams && current.options.bots === 'off' ? (
        <p className="text-body-sm text-fg-muted">{t('equalTeams')}</p>
      ) : null}
      <Button variant="ghost" onClick={() => room.leave()}>
        <LogOut aria-hidden className="size-4" />
        {t('leave')}
      </Button>
    </div>
  );
}
