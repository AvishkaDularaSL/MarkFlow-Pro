import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Ensure window and Window.prototype fetch is not restricted to a getter-only property
if (typeof window !== 'undefined') {
  try {
    let currentFetch: typeof window.fetch = window.fetch ? window.fetch.bind(window) : fetch;
    const makeSettable = (target: any) => {
      if (!target || target === Object.prototype || (typeof EventTarget !== 'undefined' && target === EventTarget.prototype)) return;
      try {
        const desc = Object.getOwnPropertyDescriptor(target, 'fetch');
        if (desc && desc.set) return;
        Object.defineProperty(target, 'fetch', {
          get() { return currentFetch; },
          set(val) { currentFetch = val; },
          configurable: true,
          enumerable: desc ? desc.enumerable !== false : true,
        });
      } catch (_) {}
    };

    // Clean up if fetch was ever attached to Object.prototype
    try {
      if (Object.prototype.hasOwnProperty('fetch')) {
        delete (Object.prototype as any).fetch;
      }
    } catch (_) {}

    makeSettable(window);
    if (typeof Window !== 'undefined' && Window.prototype) {
      makeSettable(Window.prototype);
    }
  } catch (_) {}
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
