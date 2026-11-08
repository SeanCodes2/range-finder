import { useState } from 'react';
import { Seg } from '@/app/ui';
import AmmoTab from './AmmoTab';
import RiflesTab from './RiflesTab';
import './gear.css';

type Sub = 'rifles' | 'ammo';
const KEY = 'gear.subtab';

function initialSub(): Sub {
  try { return localStorage.getItem(KEY) === 'ammo' ? 'ammo' : 'rifles'; } catch { return 'rifles'; }
}

export default function GearPage() {
  const [sub, setSubState] = useState<Sub>(initialSub);
  const setSub = (s: Sub) => { setSubState(s); try { localStorage.setItem(KEY, s); } catch { /* ignore */ } };

  return (
    <>
      <div className="row">
        <h1 className="page-title">Gear</h1>
        <span className="spacer" />
        <Seg value={sub} options={[{ value: 'rifles', label: 'Rifles' }, { value: 'ammo', label: 'Ammo' }]} onChange={setSub} label="Gear section" />
      </div>
      {sub === 'rifles' ? <RiflesTab /> : <AmmoTab />}
    </>
  );
}
