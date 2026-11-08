// IndexedDB store with a tiny reactive layer. Features use `useCollection` / `useDoc` for
// reads and `put` / `remove` for writes. Keep all persistence behind this file so a sync
// layer can be added later without touching features.
import { openDB, type IDBPDatabase } from 'idb';
import { useEffect, useState } from 'react';
import type { Base, Collection, Schema } from './types';

const DB_NAME = 'range-finder';
const DB_VERSION = 1;
const COLLECTIONS: Collection[] = [
  'ranges', 'stakes', 'rifles', 'zeroEvents', 'cleaningEvents', 'ammo',
  'sessions', 'groups', 'photos', 'timerRuns', 'settings',
];

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        for (const c of COLLECTIONS) if (!d.objectStoreNames.contains(c)) d.createObjectStore(c, { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

// --- change notification ---
type Listener = () => void;
const listeners = new Map<Collection, Set<Listener>>();
function notify(c: Collection) { listeners.get(c)?.forEach(fn => fn()); }
export function subscribe(c: Collection, fn: Listener) {
  if (!listeners.has(c)) listeners.set(c, new Set());
  listeners.get(c)!.add(fn);
  return () => { listeners.get(c)!.delete(fn); };
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export async function getAll<C extends Collection>(c: C): Promise<Schema[C][]> {
  return (await db()).getAll(c) as Promise<Schema[C][]>;
}
export async function get<C extends Collection>(c: C, id: string): Promise<Schema[C] | undefined> {
  return (await db()).get(c, id) as Promise<Schema[C] | undefined>;
}
/** Insert or update. Stamps createdAt/updatedAt on Base records. Returns the stored record. */
export async function put<C extends Collection>(c: C, rec: Schema[C]): Promise<Schema[C]> {
  const now = Date.now();
  const r: any = { ...rec };
  if (c !== 'settings' && c !== 'photos') { if (!r.createdAt) r.createdAt = now; r.updatedAt = now; }
  if (c === 'photos' && !r.createdAt) r.createdAt = now;
  await (await db()).put(c, r);
  notify(c);
  return r;
}
export async function remove(c: Collection, id: string) {
  await (await db()).delete(c, id);
  notify(c);
}
export async function clear(c: Collection) {
  await (await db()).clear(c);
  notify(c);
}

/** Convenience for creating a new Base record with id + timestamps. */
export function create<T extends Base>(fields: Omit<T, keyof Base>): T {
  const now = Date.now();
  return { id: newId(), createdAt: now, updatedAt: now, ...fields } as T;
}

// --- React hooks ---
export function useCollection<C extends Collection>(c: C): Schema[C][] {
  const [rows, setRows] = useState<Schema[C][]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => getAll(c).then(r => { if (alive) setRows(r); });
    load();
    const off = subscribe(c, load);
    return () => { alive = false; off(); };
  }, [c]);
  return rows;
}

export function useDoc<C extends Collection>(c: C, id: string | undefined): Schema[C] | undefined {
  const [doc, setDoc] = useState<Schema[C] | undefined>();
  useEffect(() => {
    if (!id) { setDoc(undefined); return; }
    let alive = true;
    const load = () => get(c, id).then(r => { if (alive) setDoc(r); });
    load();
    const off = subscribe(c, load);
    return () => { alive = false; off(); };
  }, [c, id]);
  return doc;
}

export function useSettings() {
  const s = useDoc('settings', 'settings');
  return s ?? { id: 'settings', distanceUnit: 'yd', speedUnit: 'fps', tempUnit: 'F' } as Schema['settings'];
}
