const BLOCKED_PROVIDER_HOSTS = new Set([
  'docs.google.com',
]);

export function isProviderInjectionAllowed(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  return !BLOCKED_PROVIDER_HOSTS.has(url.hostname.toLowerCase());
}
