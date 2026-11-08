// Typical accurate-barrel-life figures (rounds) by cartridge. These are rough community
// rules of thumb for precision use, not hard limits; the UI uses them only for a progress bar.
// Keys are normalized via `normalizeCaliber`.

export interface BarrelLifeEntry {
  key: string; // normalized caliber key
  label: string;
  rounds: number;
}

const TABLE: BarrelLifeEntry[] = [
  { key: '223', label: '.223 Rem / 5.56', rounds: 15000 },
  { key: '556', label: '.223 Rem / 5.56', rounds: 15000 },
  { key: '224valkyrie', label: '.224 Valkyrie', rounds: 3000 },
  { key: '22250', label: '.22-250', rounds: 3000 },
  { key: '243', label: '.243 Win', rounds: 3000 },
  { key: '6creedmoor', label: '6mm Creedmoor', rounds: 2000 },
  { key: '6cm', label: '6mm Creedmoor', rounds: 2000 },
  { key: '6arc', label: '6mm ARC', rounds: 4000 },
  { key: '6dasher', label: '6mm Dasher', rounds: 2500 },
  { key: '6br', label: '6mm BR', rounds: 3000 },
  { key: '6gt', label: '6 GT', rounds: 2500 },
  { key: '65creedmoor', label: '6.5 Creedmoor', rounds: 3000 },
  { key: '65cm', label: '6.5 Creedmoor', rounds: 3000 },
  { key: '65prc', label: '6.5 PRC', rounds: 2000 },
  { key: '65grendel', label: '6.5 Grendel', rounds: 6000 },
  { key: '260', label: '.260 Rem', rounds: 3000 },
  { key: '7mm08', label: '7mm-08', rounds: 4000 },
  { key: '7prc', label: '7mm PRC', rounds: 1800 },
  { key: '7remmag', label: '7mm Rem Mag', rounds: 2000 },
  { key: '280ai', label: '.280 AI', rounds: 2000 },
  { key: '308', label: '.308 Win / 7.62', rounds: 8000 },
  { key: '762', label: '.308 Win / 7.62', rounds: 8000 },
  { key: '3006', label: '.30-06', rounds: 5000 },
  { key: '300wm', label: '.300 Win Mag', rounds: 2500 },
  { key: '300winmag', label: '.300 Win Mag', rounds: 2500 },
  { key: '300prc', label: '.300 PRC', rounds: 2000 },
  { key: '300norma', label: '.300 Norma', rounds: 1500 },
  { key: '300blk', label: '.300 BLK', rounds: 10000 },
  { key: '300blackout', label: '.300 BLK', rounds: 10000 },
  { key: '338lapua', label: '.338 Lapua', rounds: 2500 },
  { key: '338lm', label: '.338 Lapua', rounds: 2500 },
  // Rimfire / pistol calibers deliberately omitted: effectively no barrel life concern.
];

const INDEX = new Map(TABLE.map(e => [e.key, e]));

/**
 * Normalize a free-text caliber string to a lookup key.
 * ".308 Win" -> "308", "6.5 CM" -> "65cm", "6.5 Creedmoor" -> "65creedmoor",
 * "5.56 NATO" -> "556", "300 Win Mag" -> "300winmag", "7.62x51" -> "762".
 */
export function normalizeCaliber(input: string): string {
  let s = input.toLowerCase().trim();
  s = s.replace(/[.\-_/]/g, '');          // drop punctuation (.308 -> 308, 22-250 -> 22250, 7mm-08 -> 7mm08)
  s = s.replace(/\s+/g, '');              // collapse whitespace
  s = s.replace(/x\d+(mm)?$/i, '');       // 7.62x51 -> 762, 5.56x45mm -> 556
  // specific equivalences
  s = s.replace(/^(223|556)(rem|nato)?$/, '$1');
  s = s.replace(/^308(win|winchester)$/, '308');
  s = s.replace(/^762(nato)?$/, '762');
  s = s.replace(/^3006(spr|springfield)?$/, '3006');
  s = s.replace(/^243(win|winchester)?$/, '243');
  s = s.replace(/^260(rem|remington)?$/, '260');
  s = s.replace(/^22250(rem|remington)?$/, '22250');
  s = s.replace(/^(6|65|7|300)mm?/, (_m, n: string) => n); // 6mm -> 6, 6.5mm -> 65
  s = s.replace(/^(6|65|7|300)(creed|creedmore)$/, '$1creedmoor');
  s = s.replace(/^300(wm|winmag|winchestermagnum)$/, '300winmag');
  s = s.replace(/^300(blk|blackout|aacblackout)$/, '300blk');
  s = s.replace(/^338(lapua|lapuamag|lapuamagnum|lm)$/, '338lapua');
  s = s.replace(/^7(remmag|remingtonmagnum|mag)$/, '7remmag');
  return s;
}

/** Returns typical barrel life in rounds for the caliber, or undefined if unknown / not applicable. */
export function barrelLifeFor(caliber: string): BarrelLifeEntry | undefined {
  if (!caliber) return undefined;
  const key = normalizeCaliber(caliber);
  const hit = INDEX.get(key);
  if (hit) return hit;
  // tolerate a stray trailing qualifier, e.g. "6.5 Creedmoor Match" -> try prefixes
  for (const e of TABLE) if (key.startsWith(e.key) && e.key.length >= 3) return e;
  return undefined;
}

/** 0..1 fraction of expected life consumed, clamped. */
export function barrelLifeFraction(roundCount: number, life: number): number {
  if (life <= 0) return 0;
  return Math.max(0, Math.min(1, roundCount / life));
}
