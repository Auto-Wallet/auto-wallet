// Utility to create popup windows positioned at top-right of the screen

export function createPopupWindow(
  url: string,
  width: number,
  height: number,
): Promise<chrome.windows.Window | null> {
  return new Promise((resolve) => {
    // Get the current focused window to determine screen position
    chrome.windows.getCurrent((currentWindow) => {
      let left: number | undefined;
      let top: number | undefined;

      if (currentWindow) {
        // Position at top-right of the current window's screen area
        const screenRight = (currentWindow.left ?? 0) + (currentWindow.width ?? 1440);
        left = screenRight - width - 16; // 16px margin from right edge
        top = (currentWindow.top ?? 0) + 16; // 16px margin from top
      }

      chrome.windows.create(
        { url, type: 'popup', width, height, focused: true, left, top },
        (window) => resolve(window ?? null),
      );
    });
  });
}
