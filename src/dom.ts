// Tiny templating helpers: escaped HTML strings plus delegated events.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Marks a string as already-safe HTML. */
export class Raw {
  html: string;
  constructor(html: string) {
    this.html = html;
  }
  toString() {
    return this.html;
  }
}
export const raw = (s: string) => new Raw(s);

/** Tagged template that escapes interpolations unless they are Raw (or arrays of Raw). */
export function html(strings: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += fmt(vals[i]);
  });
  return new Raw(out);
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.html;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

export function $(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector(sel);
}

export function $$(sel: string, root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll(sel)] as HTMLElement[];
}

export function mount(el: Element, content: Raw) {
  el.innerHTML = content.html;
}

/** Delegated click handler for elements with data-action. */
export function onAction(root: HTMLElement, handlers: Record<string, (el: HTMLElement, ev: Event) => void>) {
  const fn = (ev: Event) => {
    const t = (ev.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!t || !root.contains(t)) return;
    const h = handlers[t.dataset.action!];
    if (h) {
      ev.preventDefault();
      h(t, ev);
    }
  };
  root.addEventListener('click', fn);
  return () => root.removeEventListener('click', fn);
}
