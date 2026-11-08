// Shared domain types. Every record has id/createdAt/updatedAt so a later cloud sync layer
// (same pattern as Pond Tracker) can merge by updatedAt without a schema change.

export interface Base {
  id: string;
  createdAt: number; // epoch ms
  updatedAt: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
  acc: number; // meters, 1-sigma-ish
  alt?: number; // meters, if GPS gave it
  t: number;
}

// ---------- Range ----------
export interface Range extends Base {
  name: string;
  firingLine: GeoPoint | null;
  notes?: string;
}

export interface Stake extends Base {
  rangeId: string;
  label: string; // "100 yd", "Steel plate", ...
  point: GeoPoint;
  intendedDistanceM?: number; // what you were trying to set it at, if any
}

// ---------- Gear ----------
export type ClickUnit = 'MOA' | 'MRAD';

export interface Rifle extends Base {
  name: string;
  caliber: string;
  barrelLengthIn?: number;
  twistRate?: string; // "1:8"
  scope?: string;
  scopeHeightIn: number; // sight height over bore
  clickUnit: ClickUnit;
  clickValue: number; // 0.25 MOA, 0.1 MRAD
  zeroDistanceM: number;
  roundCount: number; // total through the barrel
  notes?: string;
}

export interface ZeroEvent extends Base {
  rifleId: string;
  distanceM: number;
  ammoId?: string;
  notes?: string;
}

export interface CleaningEvent extends Base {
  rifleId: string;
  roundCountAt: number;
  notes?: string;
}

export type DragModel = 'G1' | 'G7';

export interface Ammo extends Base {
  name: string; // "Hornady 140 ELD-M"
  caliber: string;
  bulletWeightGr: number;
  bc: number;
  dragModel: DragModel;
  muzzleVelocityFps: number; // trued value lives here; factory value in notes if you like
  lot?: string;
  onHand: number; // rounds remaining
  costPerRound?: number;
  notes?: string;
}

// ---------- Logbook ----------
export interface Conditions {
  tempF?: number;
  pressureInHg?: number; // station pressure
  humidityPct?: number;
  windMph?: number;
  windDirDeg?: number; // where wind comes FROM, true north
  altitudeFt?: number;
  source?: 'manual' | 'open-meteo';
  fetchedAt?: number;
}

export interface Session extends Base {
  date: number;
  rangeId?: string;
  rifleId?: string;
  ammoId?: string;
  conditions: Conditions;
  notes?: string;
}

export interface ShotGroup extends Base {
  sessionId: string;
  stakeId?: string;
  distanceM: number;
  rounds: number;
  groupSizeIn?: number; // extreme spread
  elevationHold?: number; // in the rifle's click unit
  windHold?: number;
  photoId?: string; // key in the photos store
  notes?: string;
}

export interface Photo {
  id: string;
  blob: Blob;
  createdAt: number;
}

// ---------- Timer ----------
export interface TimerRun extends Base {
  parTimeS?: number;
  splitsS: number[]; // seconds from start beep
  notes?: string;
}

export interface Settings {
  id: 'settings';
  distanceUnit: 'yd' | 'm';
  speedUnit: 'fps' | 'mps';
  tempUnit: 'F' | 'C';
}

export interface Schema {
  ranges: Range;
  stakes: Stake;
  rifles: Rifle;
  zeroEvents: ZeroEvent;
  cleaningEvents: CleaningEvent;
  ammo: Ammo;
  sessions: Session;
  groups: ShotGroup;
  photos: Photo;
  timerRuns: TimerRun;
  settings: Settings;
}

export type Collection = keyof Schema;
