import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { loadFonts } from '@/fonts';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

loadFonts().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
