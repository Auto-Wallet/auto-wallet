// Chrome notification helper for signing and sending events

const ICON_URL = 'icons/icon128.png';

// Map notification ID → explorer URL for click-to-open
const notificationUrls: Map<string, string> = new Map();

export type TxNotifyStatus = 'confirmed' | 'failed';

export function notifyTx(
  hash: string,
  origin: string,
  autoSigned: boolean,
  status: TxNotifyStatus,
  explorerUrl?: string,
): void {
  const shortHash = `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  const notifId = `tx-${hash}`;
  const prefix = autoSigned ? 'Auto-Signed Transaction' : 'Transaction';
  const title = status === 'confirmed' ? `${prefix} Confirmed` : `${prefix} Failed`;
  chrome.notifications.create(notifId, {
    type: 'basic',
    iconUrl: ICON_URL,
    title,
    message: `${shortHash}\nfrom ${origin}`,
    priority: 1,
  });
  if (explorerUrl) {
    notificationUrls.set(notifId, `${explorerUrl}/tx/${hash}`);
  }
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

// Open explorer when clicking a tx notification
chrome.notifications.onClicked.addListener((notifId) => {
  const url = notificationUrls.get(notifId);
  if (url) {
    chrome.tabs.create({ url });
    notificationUrls.delete(notifId);
  }
  chrome.notifications.clear(notifId);
});

// Clean up closed notifications
chrome.notifications.onClosed.addListener((notifId) => {
  notificationUrls.delete(notifId);
});
