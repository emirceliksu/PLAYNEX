'use client';

import type { MatchOutcome, OnlineMessage, OnlineSession, SessionPlayer } from '@playnex/game-sdk';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type ConnectionStatus,
  RealtimeConnection,
  realtimeUrl,
  type ServerFrame,
} from './connection';

export interface RoomMember {
  id: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
  seat: number | null;
}

export interface RoomState {
  code: string;
  game: string;
  options: Record<string, string | number>;
  hostId: string;
  phase: 'lobby' | 'playing';
  minPlayers: number;
  maxPlayers: number;
  members: RoomMember[];
}

export interface RoomMatch {
  // Changes on every match.start so the player remounts the game.
  id: number;
  session: OnlineSession;
}

interface MatchStartPayload {
  seat: number;
  round: number;
  players: { id: string; nickname: string; seat: number }[];
  options: Record<string, string | number>;
}

interface LiveMatch {
  push(message: OnlineMessage): void;
}

function createSession(start: MatchStartPayload, send: (input: unknown) => void) {
  const listeners = new Set<(message: OnlineMessage) => void>();
  const buffer: OnlineMessage[] = [];
  const players: SessionPlayer[] = start.players
    .map(({ seat, nickname }) => ({ seat, nickname }))
    .sort((a, b) => a.seat - b.seat);
  const options = Object.fromEntries(
    Object.entries(start.options).map(([key, value]) => [key, String(value)]),
  );

  const session: OnlineSession = {
    mode: 'online',
    seat: start.seat,
    round: start.round,
    players,
    options,
    send,
    subscribe(listener) {
      listeners.add(listener);
      for (const message of buffer.splice(0)) listener(message);
      return () => listeners.delete(listener);
    },
  };
  const live: LiveMatch = {
    push(message) {
      if (listeners.size === 0) {
        buffer.push(message);
        return;
      }
      for (const listener of listeners) listener(message);
    },
  };
  return { session, live };
}

// The server expects numbers where the value is numeric (chess minutes) and
// strings otherwise; the lobby keeps everything as strings.
function toServerOptions(values: Record<string, string>, locale: string) {
  const options: Record<string, string | number> = { locale };
  for (const [key, value] of Object.entries(values)) {
    options[key] = /^\d+$/.test(value) ? Number(value) : value;
  }
  return options;
}

export function useRoom(slug: string, locale: string) {
  const [status, setStatus] = useState<ConnectionStatus | 'idle'>('idle');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [match, setMatch] = useState<RoomMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const liveRef = useRef<LiveMatch | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const matchCounter = useRef(0);

  const send = useCallback((type: string, payload?: unknown) => {
    connectionRef.current?.send(type, payload);
  }, []);

  const handleFrame = useCallback(
    (frame: ServerFrame) => {
      switch (frame.type) {
        case 'room.state': {
          const next = frame.payload as RoomState;
          roomCodeRef.current = next.code;
          setRoom(next);
          setError(null);
          return;
        }
        case 'room.left':
          roomCodeRef.current = null;
          liveRef.current = null;
          setRoom(null);
          setMatch(null);
          return;
        case 'match.start': {
          const { session, live } = createSession(frame.payload as MatchStartPayload, (input) =>
            send('input', input),
          );
          liveRef.current = live;
          matchCounter.current += 1;
          setMatch({ id: matchCounter.current, session });
          return;
        }
        case 'state.snapshot':
          liveRef.current?.push({ kind: 'snapshot', payload: frame.payload });
          return;
        case 'event':
          liveRef.current?.push({ kind: 'event', payload: frame.payload });
          return;
        case 'match.finish':
          liveRef.current?.push({ kind: 'finish', outcome: frame.payload as MatchOutcome });
          liveRef.current = null;
          return;
        case 'error': {
          const { code } = frame.payload as { code: string };
          if (liveRef.current) {
            liveRef.current.push({ kind: 'rejected', code });
            return;
          }
          if (code === 'room_not_found' || code === 'room_closed') {
            roomCodeRef.current = null;
            setRoom(null);
          }
          setError(code);
          return;
        }
      }
    },
    [send],
  );

  const connect = useCallback(
    (nickname: string, then?: () => void) => {
      pendingRef.current = then ?? null;
      if (connectionRef.current) {
        connectionRef.current.close();
      }
      setError(null);
      const connection = new RealtimeConnection(realtimeUrl(), nickname, {
        onFrame: handleFrame,
        onStatus: setStatus,
        onGreeted: (id) => {
          setPlayerId(id);
          // After a reconnect the room has to be re-entered on the new socket.
          if (roomCodeRef.current) {
            connection.send('room.join', { code: roomCodeRef.current });
          }
          const pending = pendingRef.current;
          pendingRef.current = null;
          pending?.();
        },
      });
      connectionRef.current = connection;
      connection.open();
    },
    [handleFrame],
  );

  const disconnect = useCallback(() => {
    connectionRef.current?.close();
    connectionRef.current = null;
    roomCodeRef.current = null;
    liveRef.current = null;
    setRoom(null);
    setMatch(null);
    setStatus('idle');
  }, []);

  useEffect(() => () => connectionRef.current?.close(), []);

  return {
    status,
    playerId,
    room,
    match,
    error,
    connect,
    disconnect,
    clearError: () => setError(null),
    create: (options: Record<string, string>) =>
      send('room.create', { game: slug, options: toServerOptions(options, locale) }),
    join: (code: string) => send('room.join', { code: code.trim().toUpperCase() }),
    leave: () => send('room.leave'),
    setReady: (ready: boolean) => send('match.ready', { ready }),
    start: () => send('match.start'),
  };
}

export type RoomController = ReturnType<typeof useRoom>;
