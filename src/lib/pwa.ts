export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).catch(() => {
      // Offline support is a nice-to-have, not load-bearing - don't block the app on failure.
    });
  });
}
