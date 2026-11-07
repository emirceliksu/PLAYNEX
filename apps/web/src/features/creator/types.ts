import type { Dimension, DocumentError, GameDocument } from '@playnex/creator-runtime';

export interface ProjectSummary {
  id: string;
  title: string;
  dimension: Dimension;
  template: string | null;
  currentReleaseId: string | null;
  plays: number;
  likes: number;
  updatedAt: string;
}

export interface Project {
  id: string;
  title: string;
  dimension: Dimension;
  template: string | null;
  document: GameDocument;
  revision: number;
  currentReleaseId: string | null;
  updatedAt: string;
}

// [shape code, swatch, x, y, width, height, rotation]; see apps/api/src/creator/publish.rs.
export type CoverItem = [number, number, number, number, number, number, number];

export interface Cover {
  width: number;
  height: number;
  background: number;
  items: CoverItem[];
}

export interface CommunityGame {
  releaseId: string;
  projectId: string;
  title: string;
  description: string;
  dimension: Dimension;
  author: string;
  plays: number;
  likes: number;
  publishedAt: string;
  cover: Cover;
}

export interface Release extends Omit<CommunityGame, 'releaseId'> {
  id: string;
  version: number;
  document: GameDocument;
  latest: boolean;
}

export interface LeaderboardEntry {
  username: string;
  score: number;
  achievedAt: string;
}

export interface LikeState {
  liked: boolean;
  likes: number;
}

export interface RunVerdict {
  verified: boolean;
  score: number;
  best: number | null;
}

export type SaveResult = { ok: true; revision: number } | { ok: false; error: string };

export type PublishResult =
  { ok: true; releaseId: string } | { ok: false; error: string; errors?: DocumentError[] };
