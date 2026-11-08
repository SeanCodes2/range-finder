// Common factory loads with manufacturer-published BCs and advertised muzzle velocities
// (typically from a 24" test barrel). These only pre-fill the Ammo form; the user should
// true MV against their own rifle.
import type { Ammo } from '@/store/types';

export type AmmoPreset = Pick<Ammo, 'name' | 'caliber' | 'bulletWeightGr' | 'bc' | 'dragModel' | 'muzzleVelocityFps'>;

export const AMMO_PRESETS: AmmoPreset[] = [
  { name: 'Hornady Match 73 ELD-M', caliber: '.223 Rem', bulletWeightGr: 73, bc: 0.203, dragModel: 'G7', muzzleVelocityFps: 2790 },
  { name: 'Sierra 77 SMK (Match)', caliber: '.223 Rem', bulletWeightGr: 77, bc: 0.190, dragModel: 'G7', muzzleVelocityFps: 2750 },
  { name: 'Hornady Match 108 ELD-M', caliber: '6mm Creedmoor', bulletWeightGr: 108, bc: 0.270, dragModel: 'G7', muzzleVelocityFps: 2960 },
  { name: 'Berger 105 Hybrid Target', caliber: '6mm Creedmoor', bulletWeightGr: 105, bc: 0.275, dragModel: 'G7', muzzleVelocityFps: 2950 },
  { name: 'Hornady Match 108 ELD-M', caliber: '6mm ARC', bulletWeightGr: 108, bc: 0.270, dragModel: 'G7', muzzleVelocityFps: 2750 },
  { name: 'Hornady Match 123 ELD-M', caliber: '6.5 Grendel', bulletWeightGr: 123, bc: 0.253, dragModel: 'G7', muzzleVelocityFps: 2580 },
  { name: 'Hornady Match 140 ELD-M', caliber: '6.5 Creedmoor', bulletWeightGr: 140, bc: 0.326, dragModel: 'G7', muzzleVelocityFps: 2710 },
  { name: 'Hornady Match 147 ELD-M', caliber: '6.5 Creedmoor', bulletWeightGr: 147, bc: 0.351, dragModel: 'G7', muzzleVelocityFps: 2695 },
  { name: 'Hornady Precision Hunter 143 ELD-X', caliber: '6.5 Creedmoor', bulletWeightGr: 143, bc: 0.315, dragModel: 'G7', muzzleVelocityFps: 2700 },
  { name: 'Berger 140 Hybrid Target', caliber: '6.5 Creedmoor', bulletWeightGr: 140, bc: 0.311, dragModel: 'G7', muzzleVelocityFps: 2850 },
  { name: 'Hornady Match 147 ELD-M', caliber: '6.5 PRC', bulletWeightGr: 147, bc: 0.351, dragModel: 'G7', muzzleVelocityFps: 2910 },
  { name: 'Federal Gold Medal 168 SMK', caliber: '.308 Win', bulletWeightGr: 168, bc: 0.224, dragModel: 'G7', muzzleVelocityFps: 2650 },
  { name: 'Federal Gold Medal 175 SMK', caliber: '.308 Win', bulletWeightGr: 175, bc: 0.243, dragModel: 'G7', muzzleVelocityFps: 2600 },
  { name: 'Hornady Match 168 ELD-M', caliber: '.308 Win', bulletWeightGr: 168, bc: 0.274, dragModel: 'G7', muzzleVelocityFps: 2700 },
  { name: 'Hornady Precision Hunter 178 ELD-X', caliber: '.308 Win', bulletWeightGr: 178, bc: 0.278, dragModel: 'G7', muzzleVelocityFps: 2600 },
  { name: 'Hornady Match 225 ELD-M', caliber: '.300 Win Mag', bulletWeightGr: 225, bc: 0.391, dragModel: 'G7', muzzleVelocityFps: 2800 },
  { name: 'Hornady Match 225 ELD-M', caliber: '.300 PRC', bulletWeightGr: 225, bc: 0.391, dragModel: 'G7', muzzleVelocityFps: 2810 },
];

/** Stable key for a preset (name + caliber, since some names repeat across calibers). */
export const presetKey = (p: AmmoPreset) => `${p.caliber} | ${p.name}`;

export function findPreset(key: string): AmmoPreset | undefined {
  return AMMO_PRESETS.find(p => presetKey(p) === key);
}
