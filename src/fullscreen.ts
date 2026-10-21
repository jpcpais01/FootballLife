// Goes fullscreen, hiding the system status and navigation bars, on the first tap or click.
// Browsers only allow it from a user gesture, so it re-arms whenever fullscreen is left
// (back gesture, app switch) and the next tap brings it back.
// iPhone Safari has no page fullscreen; there, the home-screen app draws under the status bar instead.
export function fullscreenOnFirstTap() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: (o?: FullscreenOptions) => void };
  const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!request) return;
  if (matchMedia('(display-mode: fullscreen)').matches) return;

  const events = ['pointerup', 'touchend', 'keydown'] as const;
  const arm = () => { for (const e of events) window.addEventListener(e, go, { capture: true, passive: true }); };
  const disarm = () => { for (const e of events) window.removeEventListener(e, go, true); };
  function go() {
    disarm();
    if (document.fullscreenElement) return;
    try {
      const p = request({ navigationUI: 'hide' }) as Promise<void> | undefined;
      p?.catch(() => arm());
    } catch {
      // Not allowed here; try again on the next tap.
      arm();
    }
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) arm(); });
  arm();
}
