// Goes fullscreen on the first tap or click. Browsers only allow it from a user gesture.
// iPhone Safari has no page fullscreen; there, adding to the home screen gives the same effect.
export function fullscreenOnFirstTap() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!request) return;
  if (matchMedia('(display-mode: fullscreen)').matches) return;

  const events = ['pointerup', 'touchend', 'keydown'] as const;
  const go = () => {
    for (const e of events) window.removeEventListener(e, go, true);
    if (document.fullscreenElement) return;
    try {
      const p = request() as Promise<void> | undefined;
      p?.catch(() => {});
    } catch {
      // Not allowed here; stay windowed.
    }
  };
  for (const e of events) window.addEventListener(e, go, { capture: true, passive: true });
}
