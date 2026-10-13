import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Handle for end-to-end tests and debugging in the dev server.
if (import.meta.env.DEV) {
  void Promise.all([import('./store/designStore'), import('./canvas/PlanCanvas')]).then(([store, canvas]) => {
    Object.assign(window, { __pod: { store: store.useDesign, canvas: canvas.canvasApi } });
  });
}
