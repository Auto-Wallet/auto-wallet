// Chrome notification helper for signing and sending events

const ICON_URL = 'icons/icon128.png';

export function notifyTx(hash: string, origin: string, autoSigned: boolean): void {
  const shortHash = `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  chrome.notifications.create(hash, {
    type: 'basic',
    iconUrl: ICON_URL,
    title: autoSigned ? 'Auto-Signed Transaction' : 'Transaction Sent',
    message: `${shortHash}\nfrom ${origin}`,
    priority: 1,
  });
}

export function notifySign(method: string, origin: string, autoSigned: boolean): void {
  const label = method === 'personal_sign' ? 'Message' : 'Typed Data';
  chrome.notifications.create(`sign-${Date.now()}`, {
    type: 'basic',
    iconUrl: ICON_URL,
    title: autoSigned ? `Auto-Signed ${label}` : `${label} Signed`,
    message: `from ${origin}`,
    priority: 0,
  });
}
