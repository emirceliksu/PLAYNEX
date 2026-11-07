import { callApi } from '@/lib/auth/api';

import type {
  CommunityGame,
  LeaderboardEntry,
  LikeState,
  Project,
  ProjectSummary,
  Release,
} from './types';

const uuid = /^[0-9a-f-]{36}$/;

export type CommunitySort = 'new' | 'popular' | 'liked';

export async function loadCommunity(
  sort: CommunitySort,
  dimension: '2d' | '3d' | null,
): Promise<CommunityGame[]> {
  const query = new URLSearchParams({ sort });
  if (dimension) query.set('dimension', dimension);
  const result = await callApi<CommunityGame[]>(`/v1/creator/community?${query.toString()}`);
  if (!result.ok) throw new Error(`community failed: ${result.body.error}`);
  return result.data;
}

export async function loadPlayerGames(username: string): Promise<CommunityGame[]> {
  const result = await callApi<CommunityGame[]>(
    `/v1/players/${encodeURIComponent(username)}/games`,
  );
  return result.ok ? result.data : [];
}

export async function loadRelease(id: string): Promise<Release | null> {
  if (!uuid.test(id)) return null;
  const result = await callApi<Release>(`/v1/creator/releases/${id}`);
  if (result.ok) return result.data;
  if (result.status === 404) return null;
  throw new Error(`release failed: ${result.body.error}`);
}

export async function loadLeaderboard(id: string): Promise<LeaderboardEntry[]> {
  const result = await callApi<LeaderboardEntry[]>(`/v1/creator/releases/${id}/leaderboard`);
  return result.ok ? result.data : [];
}

export async function loadLikeState(projectId: string, token: string): Promise<LikeState | null> {
  const result = await callApi<LikeState>(`/v1/creator/projects/${projectId}/like`, { token });
  return result.ok ? result.data : null;
}

export async function loadMyProjects(token: string): Promise<ProjectSummary[]> {
  const result = await callApi<ProjectSummary[]>('/v1/creator/projects', { token });
  if (!result.ok) throw new Error(`projects failed: ${result.body.error}`);
  return result.data;
}

export async function loadProject(id: string, token: string): Promise<Project | null> {
  if (!uuid.test(id)) return null;
  const result = await callApi<Project>(`/v1/creator/projects/${id}`, { token });
  if (result.ok) return result.data;
  if (result.status === 404) return null;
  throw new Error(`project failed: ${result.body.error}`);
}
