import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './app/App';
import { gate, previouslyAllowed } from './app/access';
import './app/styles.css';

registerSW({ immediate: true });
const root = createRoot(document.getElementById('root')!);
const render = () => root.render(<StrictMode><App /></StrictMode>);

// Known-good devices render immediately and re-verify in the background; new devices wait.
if (previouslyAllowed()) { render(); gate(); }
else gate().then(ok => { if (ok) render(); });
