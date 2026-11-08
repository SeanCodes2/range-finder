// Round-count bookkeeping: a saved group adds its rounds to the rifle's roundCount and takes them
// from the ammo's onHand. Edits apply the delta, deletes reverse it. The math is pure; `applyMoves` persists.
import { get, put } from '@/store/db';
import type { Ammo, Rifle } from '@/store/types';

/** What a group (or a whole session) is attributed to. */
export interface Attribution { rifleId?: string; ammoId?: string; rounds: number }
/** Net change in rounds fired for one rifle or one ammo lot. */
export interface Move { kind: 'rifle' | 'ammo'; id: string; delta: number }

const safe = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/**
 * Moves needed to go from `prev` to `next`. Pass prev=null for a new group, next=null for a delete,
 * or both for an edit / session re-attribution. Moves to the same doc are merged; zero moves dropped.
 */
export function inventoryMoves(prev: Attribution | null, next: Attribution | null): Move[] {
  const acc = new Map<string, Move>();
  const add = (kind: Move['kind'], id: string | undefined, delta: number) => {
    if (!id || !delta) return;
    const k = `${kind}:${id}`;
    const m = acc.get(k);
    if (m) m.delta += delta; else acc.set(k, { kind, id, delta });
  };
  if (prev) { add('rifle', prev.rifleId, -safe(prev.rounds)); add('ammo', prev.ammoId, -safe(prev.rounds)); }
  if (next) { add('rifle', next.rifleId, safe(next.rounds)); add('ammo', next.ammoId, safe(next.rounds)); }
  return [...acc.values()].filter(m => m.delta !== 0);
}

export const applyToRifle = (r: Rifle, delta: number): Rifle => ({ ...r, roundCount: safe(r.roundCount) + delta });
export const applyToAmmo = (a: Ammo, delta: number): Ammo => ({ ...a, onHand: safe(a.onHand) - delta });

/** Read each target doc fresh and persist the move. Missing docs (deleted gear) are skipped. */
export async function applyMoves(moves: Move[]): Promise<void> {
  for (const m of moves) {
    if (m.kind === 'rifle') {
      const r = await get('rifles', m.id);
      if (r) await put('rifles', applyToRifle(r, m.delta));
    } else {
      const a = await get('ammo', m.id);
      if (a) await put('ammo', applyToAmmo(a, m.delta));
    }
  }
}
