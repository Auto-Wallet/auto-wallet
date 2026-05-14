import React from 'react';
import { createRoot } from 'react-dom/client';
import '../popup/styles.css';
import { initTheme } from '../popup/theme';
import { SwapPage } from './SwapPage';

initTheme();

// The swap page lives in its own tab; the popup body width override doesn't
// apply here. Allow the body to fill the viewport so the two-column layout
// can breathe.
document.body.style.width = '100vw';
document.body.style.minHeight = '100vh';

const root = createRoot(document.getElementById('root')!);
root.render(<SwapPage />);
