// Browser-side polyfills for Node globals used by some npm dependencies
// (notably @ledgerhq/hw-app-eth, which uses `Buffer` and `process`).
// Import this once at the entry of any extension page that loads those libs.

import { Buffer as BufferPolyfill } from 'buffer';

const g = globalThis as any;
if (typeof g.Buffer === 'undefined') g.Buffer = BufferPolyfill;
if (typeof g.process === 'undefined') {
  // Minimal `process` shim — the libs that need it (e.g. @ledgerhq/hw-app-eth)
  // only read `env`, `version`, and call `nextTick`.
  g.process = {
    env: {},
    version: '',
    versions: {},
    platform: 'browser',
    nextTick: (cb: (...args: any[]) => void, ...args: any[]) =>
      Promise.resolve().then(() => cb(...args)),
    browser: true,
  };
} else if (!g.process.env) {
  g.process.env = {};
}
