import { html, mount } from '../dom.ts';
import { PATCH_NOTES } from '../patchnotes.ts';

export async function patchNotesPage(el: HTMLElement) {
  mount(el, html`<div style="max-width:760px;margin:0 auto;padding:${document.getElementById('page') ? '0' : '28px 16px'}">
    <div class="page-head"><div><div class="eyebrow">What's new</div><div class="h1" style="margin-top:6px">Patch notes</div></div></div>
    <div class="card stagger" style="padding:24px 24px 6px">${PATCH_NOTES.map((g) => html`<div class="patch-group">
      <div class="h3">${new Date(g.hour).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
      <ul>${g.entries.map((e) => html`<li><b>${e.title}</b> — <span class="muted">${e.body}</span></li>`)}</ul></div>`)}</div>
  </div>`);
}
