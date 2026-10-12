import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { registerServiceWorker } from './pwa.ts';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root를 찾지 못했어요');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
