// Goes fullscreen and turns the screen sideways (the game is made for landscape),
// hiding the system status and navigation bars, on the first tap or click.
// Browsers only allow it from a user gesture, so it re-arms whenever fullscreen is left
// (back gesture, app switch) and the next tap brings it back.
// iPhone Safari has no page fullscreen or orientation lock; there, the home-screen app draws under
// the status bar and a prompt asks the player to rotate.
function lockLandscape() {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  try { o?.lock?.('landscape').catch(() => {}); } catch { /* not supported */ }
}

// Phones and tablets only: on a computer with a mouse, forcing fullscreen on clicks made the
// window jump in and out of fullscreen, so desktop stays a normal window.
function isTouchDevice() {
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
}

export function fullscreenOnFirstTap() {
  if (!isTouchDevice()) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: (o?: FullscreenOptions) => void };
  const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
  if (!request || matchMedia('(display-mode: fullscreen)').matches) {
    // Already fullscreen (installed app): just turn sideways on the first tap.
    const once = () => { window.removeEventListener('pointerup', once, true); lockLandscape(); };
    window.addEventListener('pointerup', once, { capture: true, passive: true });
    return;
  }

  const events = ['pointerup', 'touchend'] as const;
  const arm = () => { for (const e of events) window.addEventListener(e, go, { capture: true, passive: true }); };
  const disarm = () => { for (const e of events) window.removeEventListener(e, go, true); };
  function go() {
    disarm();
    if (document.fullscreenElement) return;
    try {
      const p = request({ navigationUI: 'hide' }) as Promise<void> | undefined;
      if (p) p.then(lockLandscape, () => arm());
      else lockLandscape();
    } catch {
      // Not allowed here; try again on the next tap.
      arm();
    }
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) arm(); });
  arm();
}
