import '../lib/node-polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LedgerPicker } from '../popup/LedgerPicker';
import { MSG_SOURCE, genId } from '../types/messages';
import '../popup/styles.css';

const requestId = new URLSearchParams(window.location.search).get('id') ?? '';

function sendResponse(payload: { selected?: unknown; error?: string }) {
  chrome.runtime.sendMessage({
    source: MSG_SOURCE,
    id: genId(),
    type: 'ledger_picker_response',
    requestId,
    ...payload,
  });
}

function App() {
  return (
    <LedgerPicker
      submitLabel="Add"
      onSubmit={({ selected }) => sendResponse({ selected })}
      onCancel={() => sendResponse({ error: 'Ledger picker was cancelled' })}
    />
  );
}

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
