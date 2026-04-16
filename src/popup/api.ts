// Typed wrapper for Popup -> Background communication

import { MSG_SOURCE, genId } from '../types/messages';

export async function callBackground<T = unknown>(action: string, payload?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        source: MSG_SOURCE,
        id: genId(),
        type: 'popup_request',
        action,
        payload,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.error) {
          reject(new Error(typeof response.error === 'string' ? response.error : response.error.message));
          return;
        }
        resolve(response?.result as T);
      },
    );
  });
}
