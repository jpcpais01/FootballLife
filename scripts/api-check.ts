// End-to-end logic check of the API against an in-memory PGlite database.
// Run with `node --experimental-strip-types scripts/api-check.ts`.
import { createServer } from 'node:http';
process.env.PGLITE_DIR = 'memory';
const { handleApi } = await import('../server/api.ts');
const { getDb } = await import('../server/db.ts');
const { tick } = await import('../server/league.ts');

const server = createServer((req, res) => handleApi(req, res));
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const jar: Record<string, string> = {};

async function call(who: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: jar[who] ?? '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) jar[who] = sc.split(';')[0];
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${j.error}`);
  return j;
}

let failed = false;
const check = (name: string, ok: boolean, info?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`, info ?? '');
  if (!ok) failed = true;
};

await call('ana', 'POST', '/api/auth/register', { username: 'ana', password: 'secret123' });
check('register + session', (await call('ana', 'GET', '/api/me')).user?.username === 'ana');
await call('ana', 'POST', '/api/player', { name: 'Ana Costa', position: 'ST', appearance: { skin: 2, hair: 6 } });
const created = await call('ana', 'POST', '/api/clubs', { name: 'Lime Rockets', short: 'LRK', primary: '#c6ff3d', secondary: '#111111', shape: 1, icon: 2, joinMode: 'invite' });
check('club created and placed in league', created.placement === 'joined', created.placement);

const club = await call('ana', 'GET', `/api/clubs/${created.id}`);
check('squad filled with bots', club.members.length >= 18, club.members.length);
check('lineup has 11', Object.keys(club.lineup).length === 11);
check('founder sees invite code', typeof club.club.inviteCode === 'string');

await call('bo', 'POST', '/api/auth/register', { username: 'bobby', password: 'secret123' });
await call('bo', 'POST', '/api/player', { name: 'Bo Larsen', position: 'GK' });
let blocked = false;
try { await call('bo', 'POST', `/api/clubs/${created.id}/join`, {}); } catch { blocked = true; }
check('invite-only club rejects without code', blocked);
await call('bo', 'POST', `/api/clubs/${created.id}/join`, { code: club.club.inviteCode });
const club2 = await call('bo', 'GET', `/api/clubs/${created.id}`);
check('human joined, bot GK replaced', club2.members.filter((m: { isBot: boolean }) => !m.isBot).length === 2 && club2.members.filter((m: { position: string; isBot: boolean }) => m.position === 'GK' && m.isBot).length === 1);
check('player cannot change tactics', await call('bo', 'POST', `/api/clubs/${created.id}/lineup`, { formation: '4-4-2' }).then(() => false, () => true));
await call('ana', 'POST', `/api/clubs/${created.id}/role`, { playerId: club2.members.find((m: { name: string }) => m.name === 'Bo Larsen').id, role: 'coach' });
await call('bo', 'POST', `/api/clubs/${created.id}/lineup`, { formation: '4-4-2', tactics: { mentality: 'attacking' } });
check('coach changed formation', (await call('bo', 'GET', `/api/clubs/${created.id}`)).club.formation === '4-4-2');

const train = await call('ana', 'POST', '/api/train', { focus: 'finishing' });
check('training grants xp', (train.xp.finishing ?? 0) > 0 || train.levelUps.length > 0, train.xp.finishing);
check('training cooldown enforced', await call('ana', 'POST', '/api/train', { focus: 'finishing' }).then(() => false, () => true));

const league = await call('ana', 'GET', '/api/league');
check('league has 10 clubs and 90 fixtures', league.table.length === 10 && league.matches.length === 90, `${league.table.length}/${league.matches.length}`);
check('our club is in the table', league.table.some((r: { clubId: string }) => r.clubId === created.id));

// Friendly, then fast-forward time by moving the kickoff into the past.
const opp = league.table.find((r: { clubId: string }) => r.clubId !== created.id).clubId;
const db = await getDb();
// Keep the check independent of the wall clock: no league kickoff right now.
await db.query("UPDATE matches SET kickoff_at = kickoff_at + interval '1 hour' WHERE status = 'scheduled'");
const fr = await call('bo', 'POST', `/api/clubs/${created.id}/friendly`, { opponentId: opp });
await db.query("UPDATE matches SET kickoff_at = now() - interval '2 minutes' WHERE id = $1", [fr.id]);
await tick(db, true);
const live = await call('ana', 'GET', `/api/matches/${fr.id}`);
check('friendly is live with partial events', live.match.status === 'live' && live.events.length > 0 && live.revealed < 3000 && live.match.score === null, `${live.match.status} ${live.revealed}`);
await db.query("UPDATE matches SET kickoff_at = now() - interval '1 hour', ends_at = now() - interval '1 minute' WHERE id = $1", [fr.id]);
// Play the first league round too.
await db.query("UPDATE matches SET kickoff_at = now() - interval '1 hour' WHERE round = 1");
await tick(db, true);
await db.query("UPDATE matches SET ends_at = now() - interval '1 second' WHERE round = 1");
await tick(db, true);
const done = await call('ana', 'GET', `/api/matches/${fr.id}`);
check('friendly finished with stats', done.finished && done.stats && done.match.score !== null);
const home = await call('ana', 'GET', '/api/home');
check('dashboard has results + notifications', home.recent.length >= 1 && home.notifications.length >= 1, home.notifications[0]?.text);
const lg2 = await call('ana', 'GET', '/api/league');
check('standings updated after round 1', lg2.table.reduce((s: number, r: { played: number }) => s + r.played, 0) === 10);
check('top scorers list', Array.isArray(lg2.scorers));
const prof = await call('bo', 'GET', `/api/players/${home.player.id}`);
check('profile has career', prof.career.apps >= 1, prof.career);

// ---------- Phase 3: achievements, shop, chat, invites ----------
const anaId = home.player.id;
const mine = await call('ana', 'GET', `/api/players/${anaId}`);
const got = new Set(mine.achievements.map((a: { id: string }) => a.id));
check('achievements awarded (club, founder, training)', got.has('club') && got.has('founder') && got.has('train1'), [...got]);
check('own profile shows achievement progress', mine.progress && Array.isArray(mine.progress.goal10));
check('other profiles hide progress', (await call('bo', 'GET', `/api/players/${anaId}`)).progress === undefined);

const shop = await call('ana', 'GET', '/api/shop');
check('shop has 4 featured items and a deal', shop.featured.length === 4 && shop.featured.includes(shop.deal));
const affordable = Object.entries(shop.prices as Record<string, number>).filter(([id, pr]) => pr > 0 && pr <= shop.coins && !shop.owned.includes(id)).sort((a, b) => a[1] - b[1])[0];
const bought = await call('ana', 'POST', '/api/shop/buy', { itemId: affordable[0] });
const { ACH_BY_ID } = await import('../shared/achievements.ts');
const achCoins = bought.achievements.reduce((t: number, id: string) => t + ACH_BY_ID[id].coins, 0);
const after = await call('ana', 'GET', '/api/me');
check('buying deducts coins', bought.coins === shop.coins - affordable[1] && after.player.coins === bought.coins + achCoins, `${shop.coins} → ${bought.coins} (+${achCoins})`);
check('cannot buy twice', await call('ana', 'POST', '/api/shop/buy', { itemId: affordable[0] }).then(() => false, () => true));
check('earned-only items are not for sale', await call('ana', 'POST', '/api/shop/buy', { itemId: 'boots-gold' }).then(() => false, () => true));
const slot = affordable[0].startsWith('cel-') ? 'celebration' : (await import('../shared/cosmetics.ts')).ITEM_BY_ID[affordable[0]].slot;
const eq = await call('ana', 'POST', '/api/locker/equip', { slot, itemId: affordable[0] });
check('equip owned item', eq.equipped[slot] === affordable[0]);
check('cannot equip unowned item', await call('ana', 'POST', '/api/locker/equip', { slot: 'boots', itemId: 'boots-chrome' }).then(() => false, () => true));
check('equipped item shows on profile', (await call('bo', 'GET', `/api/players/${anaId}`)).player.equipped[slot] === affordable[0]);

await call('ana', 'POST', `/api/clubs/${created.id}/chat`, { text: 'Big match tonight!' });
const chat = await call('bo', 'GET', `/api/clubs/${created.id}/chat`);
check('club chat delivers messages', chat.messages.some((m: { text: string }) => m.text === 'Big match tonight!'));
check('club chat has system lines', chat.messages.some((m: { kind: string; text: string }) => m.kind === 'system' && m.text.includes('joined')));
check('chat rate limit', await call('ana', 'POST', `/api/clubs/${created.id}/chat`, { text: 'again' }).then(() => false, () => true));

await call('cara', 'POST', '/api/auth/register', { username: 'cara', password: 'secret123' });
await call('cara', 'POST', '/api/player', { name: 'Cara Neves', position: 'CM' });
check('outsiders cannot read chat', await call('cara', 'GET', `/api/clubs/${created.id}/chat`).then(() => false, () => true));
await call('cara', 'POST', `/api/clubs/${created.id}/request`, {});
check('duplicate request blocked', await call('cara', 'POST', `/api/clubs/${created.id}/request`, {}).then(() => false, () => true));
const withReq = await call('ana', 'GET', `/api/clubs/${created.id}`);
check('staff see join request', withReq.requests.length === 1 && withReq.requests[0].player.name === 'Cara Neves');
check('players cannot answer requests', await call('bo', 'POST', `/api/invites/${withReq.requests[0].id}/respond`, { accept: true }).then(() => false, () => true));
await call('ana', 'POST', `/api/invites/${withReq.requests[0].id}/respond`, { accept: true });
check('accepted request joins club', (await call('cara', 'GET', '/api/me')).player.clubId === created.id);

await call('dan', 'POST', '/api/auth/register', { username: 'dan', password: 'secret123' });
await call('dan', 'POST', '/api/player', { name: 'Dan Rocha', position: 'CB' });
const fa = await call('ana', 'GET', '/api/free-agents?q=dan');
check('free agent search', fa.players.length === 1);
await call('ana', 'POST', `/api/clubs/${created.id}/invite`, { playerId: fa.players[0].id });
const dinv = await call('dan', 'GET', '/api/invites');
check('invite arrives', dinv.invites.length === 1 && dinv.invites[0].club.id === created.id);
await call('dan', 'POST', `/api/invites/${dinv.invites[0].id}/respond`, { accept: true });
check('accepted invite joins club', (await call('dan', 'GET', '/api/me')).player.clubId === created.id);
const byCode = await call('dan', 'GET', `/api/join/${withReq.club.inviteCode}`);
check('invite link resolves club', byCode.club.id === created.id);

// Leaving as founder hands the club over.
await call('ana', 'POST', '/api/clubs/leave');
const handed = await call('bo', 'GET', `/api/clubs/${created.id}`);
check('founder role passed on', handed.members.find((m: { name: string }) => m.name === 'Bo Larsen').role === 'founder');

// Play out the whole season to check trophies and the rollover.
await db.query("UPDATE matches SET kickoff_at = now() - interval '2 hours' WHERE status = 'scheduled' AND kind = 'league'");
for (let i = 0; i < 12; i++) await tick(db, true);
await db.query("UPDATE matches SET ends_at = now() - interval '1 second' WHERE status = 'played'");
for (let i = 0; i < 6; i++) await tick(db, true);
const lg3 = await call('bo', 'GET', '/api/league');
check('season rolled over with honours', lg3.season.number === 2 && lg3.honours.length === 1 && lg3.honours[0].champion && lg3.honours[0].golden_boot, lg3.honours[0]);
const tr = await db.query<{ n: string }>("SELECT count(*) n FROM trophies WHERE player_id IS NOT NULL");
check('player trophies recorded', +tr[0].n >= 3, tr[0].n);

server.close();
process.exit(failed ? 1 : 0);
