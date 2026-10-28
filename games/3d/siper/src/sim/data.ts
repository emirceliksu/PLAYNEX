import cosmeticsFile from '../../data/cosmetics.json';
import carsi from '../../data/maps/carsi.json';
import liman from '../../data/maps/liman.json';
import santral from '../../data/maps/santral.json';
import rulesFile from '../../data/rules.json';
import weaponsFile from '../../data/weapons.json';

// The realtime service reads the same files (`apps/realtime/src/matches/siper/data.rs`).

export type ModeKey = 'tdm' | 'bomb' | 'knife' | 'ffa' | 'gungame';
export type WeaponSlot = 'primary' | 'secondary' | 'melee';

export interface WeaponSpec {
  id: string;
  slot: WeaponSlot;
  price: number;
  reward: number;
  damage: number;
  fireMs: number;
  magazine: number;
  reserve: number;
  reloadMs: number;
  range: number;
  pellets: number;
  auto: boolean;
  speedScale: number;
  zoom?: number;
  spread: { base: number; moving: number; air: number; crouch: number; scoped?: number };
  recoil: number[][];
  recoveryMs: number;
}

export interface MapFile {
  id: string;
  width: number;
  height: number;
  rects: [string, number, number, number, number][];
}

export interface CosmeticSpec {
  id: string;
  tone: string;
  pattern?: string;
  accessory?: string;
}

export const rules = rulesFile;
export const weapons = weaponsFile.weapons as WeaponSpec[];
export const grenades = weaponsFile.grenades;
export const maps: Record<string, MapFile> = {
  liman: liman as MapFile,
  carsi: carsi as MapFile,
  santral: santral as MapFile,
};
export const cosmetics = cosmeticsFile as { skins: CosmeticSpec[]; outfits: CosmeticSpec[] };

export const TICK_SECONDS = 1 / rules.tickRate;

export function weapon(id: string): WeaponSpec | undefined {
  return weapons.find((spec) => spec.id === id);
}

export function cellHeight(kind: string): number {
  return (rules.cells as Record<string, { height: number } | undefined>)[kind]?.height ?? 0;
}
