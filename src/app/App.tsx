import { useEffect, useState } from 'react';
import RangePage from '@/features/range/RangePage';
import BallisticsPage from '@/features/ballistics/BallisticsPage';
import LogbookPage from '@/features/logbook/LogbookPage';
import GearPage from '@/features/gear/GearPage';
import TimerPage from '@/features/timer/TimerPage';

const TABS = [
  { id: 'range', label: 'Range', icon: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10Z', Page: RangePage },
  { id: 'dope', label: 'Dope', icon: 'M4 20L20 4M4 4l4 4M8 4l0 4M4 8l4 0M14 14l6 6', Page: BallisticsPage },
  { id: 'log', label: 'Log', icon: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM9 8h6M9 12h6M9 16h4', Page: LogbookPage },
  { id: 'gear', label: 'Gear', icon: 'M3 12h3l2-3h8l2 3h3M5 12v5h14v-5M9 17v3M15 17v3', Page: GearPage },
  { id: 'timer', label: 'Timer', icon: 'M12 6a8 8 0 1 0 0 16a8 8 0 1 0 0-16ZM12 10v4l3 2M9 2h6', Page: TimerPage },
] as const;
type TabId = typeof TABS[number]['id'];

const readHash = (): TabId => (TABS.find(t => t.id === location.hash.slice(1))?.id ?? 'range');

export default function App() {
  const [tab, setTab] = useState<TabId>(readHash);
  useEffect(() => {
    const fn = () => setTab(readHash());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  const go = (id: TabId) => { location.hash = id; setTab(id); };
  const Page = TABS.find(t => t.id === tab)!.Page;
  return (
    <div className="shell">
      <main className="shell-main"><Page /></main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(t => (
          <button key={t.id} onClick={() => go(t.id)} aria-current={t.id === tab ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
