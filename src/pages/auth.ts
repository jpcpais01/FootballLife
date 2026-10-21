import { api } from '../api.ts';
import { brandMark } from '../art.ts';
import { html, mount } from '../dom.ts';
import { navigate } from '../router.ts';
import { refreshMe } from '../state.ts';

export async function authPage(el: HTMLElement) {
  let mode: 'login' | 'register' = 'register';
  mount(el, html`<div class="auth">
    <div class="auth-art" id="art">
      <div class="copy fade-in">
        <div class="eyebrow">Online football career</div>
        <div class="h1" style="margin-top:8px">Your player.<br>Your club.<br><span class="lime">Your legacy.</span></div>
        <p class="muted" style="max-width:440px;margin-top:14px">Create a footballer, build a club with friends, and watch every league match play out live with everyone else.</p>
      </div>
    </div>
    <div class="auth-form">
      <div class="row">${brandMark(40)}<span class="wordmark">FOOTBAL<b>LIFE</b></span></div>
      <div>
        <div class="h1" id="title" style="font-size:40px">Create account</div>
        <p class="muted" id="sub" style="margin:6px 0 0">Start your career in under a minute.</p>
      </div>
      <form class="stack" id="form" style="gap:14px">
        <div class="field"><label for="u">Username</label><input class="input" id="u" name="username" autocomplete="username" required minlength="3" maxlength="20"></div>
        <div class="field"><label for="p">Password</label><input class="input" id="p" name="password" type="password" autocomplete="new-password" required minlength="6"></div>
        <div class="small" id="err" style="color:var(--red);min-height:18px"></div>
        <button class="btn primary block" id="submit" style="height:48px">Create account</button>
      </form>
      <div class="small muted" id="switch">Already have an account? <a href="#" class="lime" data-switch style="font-weight:700">Sign in</a></div>
      <a href="/patch-notes" class="tiny dim">Patch notes</a>
    </div>
  </div>`);

  const form = el.querySelector<HTMLFormElement>('#form')!;
  const setMode = (m: typeof mode) => {
    mode = m;
    el.querySelector('#title')!.textContent = m === 'login' ? 'Welcome back' : 'Create account';
    el.querySelector('#sub')!.textContent = m === 'login' ? 'Sign in to continue your career.' : 'Start your career in under a minute.';
    el.querySelector('#submit')!.textContent = m === 'login' ? 'Sign in' : 'Create account';
    (el.querySelector('#p') as HTMLInputElement).autocomplete = m === 'login' ? 'current-password' : 'new-password';
    el.querySelector('#switch')!.innerHTML = m === 'login'
      ? 'New here? <a href="#" class="lime" data-switch style="font-weight:700">Create an account</a>'
      : 'Already have an account? <a href="#" class="lime" data-switch style="font-weight:700">Sign in</a>';
    el.querySelector('#err')!.textContent = '';
  };
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-switch]')) {
      e.preventDefault();
      setMode(mode === 'login' ? 'register' : 'login');
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.querySelector<HTMLButtonElement>('#submit')!;
    btn.disabled = true;
    try {
      const fd = new FormData(form);
      await api.post(`/api/auth/${mode}`, { username: fd.get('username'), password: fd.get('password') });
      await refreshMe();
      navigate('/', true);
    } catch (err) {
      el.querySelector('#err')!.textContent = (err as Error).message;
    } finally {
      btn.disabled = false;
    }
  });

  // Live 3D attract mode behind the copy.
  let stop: (() => void) | undefined;
  let alive = true;
  import('../viewer/demo.ts').then((m) => {
    const art = el.querySelector('#art') as HTMLElement | null;
    if (alive && art) stop = m.startDemo(art);
  }).catch((e) => console.warn('3D preview unavailable', e));
  return () => {
    alive = false;
    stop?.();
  };
}
