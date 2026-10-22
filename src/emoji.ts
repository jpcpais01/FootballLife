// Emoji picker data for the club chat, plus helpers for recents and big-emoji messages.

const flag = (cc: string) => String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
const sub = (tag: string) => '\u{1F3F4}' + [...tag].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('') + '\u{E007F}';

const split = (s: string) => s.trim().split(/\s+/);

export interface EmojiSet { id: string; label: string; tab: string; list: string[] }

export const EMOJI_SETS: EmojiSet[] = [
  {
    id: 'football', label: 'Football', tab: '⚽',
    list: split(`⚽ 🥅 🏟️ 🏆 🥇 🥈 🥉 🏅 🎖️ 👟 🧤 🦵 🦶 🟨 🟥 🚩 ⏱️ 📣 🎺 🥁 🔔 🎉 🎊 🥳 🔥 💥 ⚡ 🚀 🎯 💯 🐐 👑 🧠 💪 👏 🙌 🤝 🫡 🙏 🤞 ✌️ 🫶 😤 😱 🤯 🥶 😭 🍺 🍻 🥤 🌭 🍕 🧃 🚌 ✈️ 📺 📸 🎙️ 📊 📈 📉 🩹 🚑 🧊 ⭐ 🌟 ✨`),
  },
  {
    id: 'smileys', label: 'Smileys', tab: '😀',
    list: split(`😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🫠 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 😵‍💫 🤠 🥸 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 🤡 👻 👽 🤖 💩 🙈 🙉 🙊`),
  },
  {
    id: 'hands', label: 'Hands and people', tab: '👍',
    list: split(`👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✌️ 🤞 🫰 🤟 🤘 👌 🤌 🤏 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 🫵 💪 🦾 🫶 ✍️ 👀 👁️ 🫦 👂 🧠 🦵 🦶 🏃 🏃‍♀️ 🤸 🤾 🧍 🧎 🕺 💃 🤷 🤷‍♀️ 🤦 🤦‍♀️ 🙋 🙋‍♀️ 🙆 🙅 💁 🧑‍🤝‍🧑 👨‍👩‍👧 🧑‍🍳 👮 🧑‍⚖️ 🦸 🦹 🥷 🧙`),
  },
  {
    id: 'hearts', label: 'Hearts and symbols', tab: '❤️',
    list: split(`❤️ 🧡 💛 💚 💙 🩵 💜 🖤 🤍 🤎 🩷 💔 ❤️‍🔥 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💬 💭 🗯️ 💤 💫 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ 🌙 ☔ ❄️ 🎵 🎶 ✅ ❌ ❗ ❓ ‼️ ⁉️ ⚠️ 🚫 🔝 🆕 🆒 🆗 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🎁 🎈 🍀 🌹 🐶 🐱 🦁 🐯 🐺 🦊 🐻 🐼 🐸 🐔 🦅 🦉 🐝 🦈 🐬 🐍 🦓 🦒`),
  },
  {
    id: 'flags', label: 'Flags', tab: '🏁',
    list: [
      '🏁', '🏳️', '🏴', '🏳️‍🌈', sub('gbeng'), sub('gbsct'), sub('gbwls'),
      ...split('PT BR ES FR DE IT NL BE AR UY CO MX US CA HR RS CH AT DK SE NO PL CZ TR GR IE UA RO HU SK SI MA SN NG GH CM CI EG DZ TN ZA JP KR AU SA IR QA CL PE EC PY VE CR JM IS FI SC').map(flag),
    ],
  },
];

const RECENT_KEY = 'fl-emoji-recent';
const RECENT_MAX = 24;

export function recentEmoji(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

export function rememberEmoji(e: string) {
  const list = [e, ...recentEmoji().filter((x) => x !== e)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// A message made of nothing but a few emoji is shown big, like on phone messengers.
const ONLY_EMOJI = /^[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}‍️⃣\u{E0020}-\u{E007F}\s]+$/u;
const PICTO = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

export function jumboCount(text: string): number {
  const t = text.replace(/\s+/g, '');
  if (!t || !ONLY_EMOJI.test(t) || !PICTO.test(t)) return 0;
  const Seg = (Intl as any).Segmenter;
  const n = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(t)].length : [...t].length;
  return n <= 3 ? n : 0;
}
