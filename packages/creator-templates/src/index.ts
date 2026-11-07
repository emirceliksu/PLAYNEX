import type { Dimension, GameDocument } from '@playnex/creator-runtime';

import bos2d from '../templates/bos-2d.json';
import bos3d from '../templates/bos-3d.json';
import engelliKosu from '../templates/engelli-kosu-3d.json';
import kuleYig from '../templates/kule-yig-3d.json';
import labirentKacisi from '../templates/labirent-kacisi.json';
import platformKosusu from '../templates/platform-kosusu.json';
import topToplama from '../templates/top-toplama-3d.json';
import yorungeSavunmasi from '../templates/yorunge-savunmasi.json';

export type TemplateId =
  | 'platform-kosusu'
  | 'yorunge-savunmasi'
  | 'labirent-kacisi'
  | 'top-toplama-3d'
  | 'engelli-kosu-3d'
  | 'kule-yig-3d'
  | 'bos-2d'
  | 'bos-3d';

export interface CreatorTemplate {
  id: TemplateId;
  dimension: Dimension;
  blank: boolean;
  document: GameDocument;
}

// JSON imports widen string literals, so the documents are cast here. The engine
// tests (crates/creator-engine/tests/templates.rs) validate and play every one.
const asDocument = (json: unknown) => json as GameDocument;

export const templates: readonly CreatorTemplate[] = [
  { id: 'platform-kosusu', dimension: '2d', blank: false, document: asDocument(platformKosusu) },
  {
    id: 'yorunge-savunmasi',
    dimension: '2d',
    blank: false,
    document: asDocument(yorungeSavunmasi),
  },
  { id: 'labirent-kacisi', dimension: '2d', blank: false, document: asDocument(labirentKacisi) },
  { id: 'top-toplama-3d', dimension: '3d', blank: false, document: asDocument(topToplama) },
  { id: 'engelli-kosu-3d', dimension: '3d', blank: false, document: asDocument(engelliKosu) },
  { id: 'kule-yig-3d', dimension: '3d', blank: false, document: asDocument(kuleYig) },
  { id: 'bos-2d', dimension: '2d', blank: true, document: asDocument(bos2d) },
  { id: 'bos-3d', dimension: '3d', blank: true, document: asDocument(bos3d) },
];

export function findTemplate(id: string): CreatorTemplate | undefined {
  return templates.find((template) => template.id === id);
}

// Every project starts from its own copy; templates are never mutated.
export function instantiate(template: CreatorTemplate): GameDocument {
  return structuredClone(template.document);
}
