import '../lib/node-polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initTheme } from './theme';

initTheme();

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
