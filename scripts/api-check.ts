// End-to-end logic check of the API against an in-memory PGlite database.
// Run with `node --experimental-strip-types scripts/api-check.ts`.
import { createServer } from 'node:http';
process.env.PGLITE_DIR = 'memory';
const { handleApi } = await import('../server/api.ts');
const { getDb } = await import('../server/db.ts');
const { tick } = await import('../server/league.ts');

const server = createServer((req, res) => handleApi(req, res));
// Long simulated stretches leave sockets idle; keep them open so fetch can reuse them.
server.keepAliveTimeout = 600_000;
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
const league0Name = (d: { clubs: { id: string; name: string; isBot: boolean }[] }, not: string) => d.clubs.find((c) => c.isBot && c.id !== not)!.name;
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
await call('ana', 'POST', `/api/clubs/${created.id}/role`, { playerId: club2.members.find((m: { name: string }) => m.name === 'Bo Larsen').id, role: 'captain' });
check('the coach is no longer a player role', await call('ana', 'POST', `/api/clubs/${created.id}/role`, { playerId: club2.members.find((m: { name: string }) => m.name === 'Bo Larsen').id, role: 'coach' }).then(() => false, () => true));
check('founder gives up tactics once there is a captain', await call('ana', 'POST', `/api/clubs/${created.id}/lineup`, { formation: '4-4-2' }).then(() => false, () => true));
await call('bo', 'POST', `/api/clubs/${created.id}/lineup`, { formation: '4-4-2', tactics: { mentality: 'attacking' } });
check('captain changed formation', (await call('bo', 'GET', `/api/clubs/${created.id}`)).club.formation === '4-4-2');

// Club identity can be edited any time by the founder or president.
check('captain cannot edit the badge', await call('bo', 'POST', `/api/clubs/${created.id}/settings`, { name: 'Bo United' }).then(() => false, () => true));
const aiName = league0Name(await call('ana', 'GET', '/api/clubs'), created.id);
check('rename to a taken name is refused', await call('ana', 'POST', `/api/clubs/${created.id}/settings`, { name: aiName }).then(() => false, () => true));
await call('ana', 'POST', `/api/clubs/${created.id}/settings`, {
  name: 'Lime Rovers', short: 'lro', primary: '#1e6bff', secondary: '#f5f5f5',
  badge: { shape: 9, icon: 21, pattern: 2, border: 4, iconScale: 999, iconRot: -30, text: 'est 2026 <b>', textPos: 3, stars: 9, accent: '#F2C14E', base: 'red' },
});
const renamed = (await call('ana', 'GET', `/api/clubs/${created.id}`)).club;
check('club renamed with new short name', renamed.name === 'Lime Rovers' && renamed.short === 'LRO', `${renamed.name}/${renamed.short}`);
check('kit colours updated', renamed.colors.primary === '#1e6bff');
const bd = renamed.badge;
check('badge options saved and cleaned', bd.shape === 9 && bd.icon === 21 && bd.pattern === 2 && bd.border === 4 && bd.textPos === 3 && bd.iconRot === -30, bd);
check('badge values clamped', bd.iconScale === 160 && bd.stars === 5 && bd.text === 'EST 2026 B' && bd.accent === '#f2c14e' && bd.base === undefined, bd);
await call('ana', 'POST', `/api/clubs/${created.id}/settings`, { name: 'Lime Rockets', short: 'LRK' });
check('renamed back, badge kept', (await call('ana', 'GET', `/api/clubs/${created.id}`)).club.badge.icon === 21);

const train = await call('ana', 'POST', '/api/train', { focus: 'finishing', score: 100 });
check('perfect drill gives the top multiplier', train.perf === 1.3, train.perf);
check('training grants xp', (train.xp.finishing ?? 0) > 0 || train.levelUps.length > 0, train.xp.finishing);
check('training cooldown enforced', await call('ana', 'POST', '/api/train', { focus: 'finishing' }).then(() => false, () => true));
{
  // A second session once recovered. Neon stores microseconds (PGlite's clock only has ms), which must not trip the double-submit guard.
  const tdb = await getDb();
  await tdb.query("UPDATE players SET last_train_at = now() - interval '2 days' + interval '123 microseconds' WHERE name = 'Ana Costa'");
  const again = await call('ana', 'POST', '/api/train', { focus: 'finishing', score: 50 }).then(() => true, (e) => String(e));
  check('second session after cooldown is accepted', again === true, again);
}

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
await call('ana', 'POST', `/api/clubs/${created.id}/role`, { playerId: withReq.members.find((m: { name: string }) => m.name === 'Bo Larsen').id, role: 'player' });
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

// ---------- Phase 4: homes, garage, transfers, cup ----------
await db.query('UPDATE players SET coins = 60000 WHERE id = $1', [anaId]);
const house0 = await call('bo', 'GET', `/api/house/${anaId}`);
check('anyone can visit a home', house0.mine === false && house0.home.tier === 'studio' && house0.furniture.includes('sofa-grey'));
await call('ana', 'POST', '/api/garage/buy', { carId: 'car-hatch', color: '#ff3d5a' });
check('studio garage holds one car', await call('ana', 'POST', '/api/garage/buy', { carId: 'car-classic', color: '#16181b' }).then(() => false, () => true));
const coinsBefore = (await call('ana', 'GET', '/api/me')).player.coins;
const moved = await call('ana', 'POST', '/api/house/buy', { houseId: 'townhouse' });
check('buying a house moves you in', moved.home.tier === 'townhouse' && moved.coins === coinsBefore - 8000, `${coinsBefore} → ${moved.coins}`);
check('house + car achievements', moved.achievements.includes('house'));
await call('ana', 'POST', '/api/garage/buy', { carId: 'car-classic', color: '#16181b' });
const back = await call('ana', 'POST', '/api/house/buy', { houseId: 'studio' });
const coinsNow = (await call('ana', 'GET', '/api/me')).player.coins;
check('moving back to an owned home is free', back.coins === coinsNow && back.home.tier === 'studio');
await call('ana', 'POST', '/api/house/buy', { houseId: 'townhouse' });
const sofa = await call('ana', 'POST', '/api/house/furniture', { itemId: 'sofa-lime' });
check('furniture bought and placed', sofa.home.furniture.sofa === 'sofa-lime');
check('cannot place unowned furniture', await call('ana', 'POST', '/api/house/arrange', { itemId: 'tv-cinema' }).then(() => false, () => true));
const arranged = await call('ana', 'POST', '/api/house/arrange', { wall: 3, floor: 2, itemId: 'sofa-grey' });
check('arrange walls, floor and swap furniture', arranged.home.wall === 3 && arranged.home.floor === 2 && arranged.home.furniture.sofa === 'sofa-grey');
const rs = await call('ana', 'POST', '/api/garage/respray', { carId: 'car-hatch', color: '#2f6bff' });
await call('ana', 'POST', '/api/garage/favourite', { carId: 'car-classic' });
const house1 = await call('ana', 'GET', `/api/house/${anaId}`);
check('respray costs 300 and sticks', rs.coins === sofa.coins - 300 && house1.cars.find((x: { id: string }) => x.id === 'car-hatch').color === '#2f6bff');
check('favourite car and garage listed', house1.home.favCar === 'car-classic' && house1.cars.length === 2 && house1.mine);

// Transfers: Ana founds a new club and signs Dan, who is open to offers.
const owls = await call('ana', 'POST', '/api/clubs', { name: 'Night Owls', short: 'NOW', primary: '#16181b', secondary: '#ffb020', shape: 2, icon: 1, joinMode: 'open' });
const vac = await call('ana', 'POST', `/api/clubs/${owls.id}/vacancies`, { position: 'CM', minOvr: 40, note: 'Need a midfield engine' });
await call('ana', 'POST', `/api/clubs/${owls.id}/vacancies`, { position: 'CB' });
await call('ana', 'POST', `/api/clubs/${owls.id}/vacancies`, { position: 'GK' });
check('at most 3 open vacancies', await call('ana', 'POST', `/api/clubs/${owls.id}/vacancies`, { position: 'ST' }).then(() => false, () => true));
await call('ana', 'POST', `/api/vacancies/${vac.id}/close`);
const danId = (await call('dan', 'GET', '/api/me')).player.id;
const caraId = (await call('cara', 'GET', '/api/me')).player.id;
check('players in clubs are off the market by default', await call('ana', 'POST', `/api/clubs/${owls.id}/invite`, { playerId: caraId }).then(() => false, () => true));
await call('dan', 'POST', '/api/transfers/status', { open: true, note: 'Looking for minutes' });
const market = await call('ana', 'GET', '/api/transfers');
check('market lists vacancies and open players', market.vacancies.length === 2 && market.players.some((x: { id: string; club: unknown }) => x.id === danId && x.club) && market.me.canPost);
await call('ana', 'POST', `/api/clubs/${owls.id}/invite`, { playerId: danId });
const dInv2 = await call('dan', 'GET', '/api/invites');
await call('dan', 'POST', `/api/invites/${dInv2.invites[0].id}/respond`, { accept: true });
const danNow = (await call('dan', 'GET', '/api/me')).player;
check('transfer moves the player and takes them off the market', danNow.clubId === owls.id && danNow.transferOpen === false);
const oldChat = await call('bo', 'GET', `/api/clubs/${created.id}/chat`);
check('old club hears about the transfer', oldChat.messages.some((m: { text: string }) => m.text.includes('transferred to Night Owls')));

// The cup is drawn with the season.
const cup0 = (await call('bo', 'GET', '/api/league')).cup;
check('cup drawn with preliminary ties and byes', cup0 && cup0.total === 4 && cup0.ties.length >= 2 && cup0.byes.length === 6, cup0 && `${cup0.ties.length} ties, ${cup0.byes.length} byes`);
check('league fixtures exclude cup ties', (await call('bo', 'GET', '/api/league')).matches.every((m: { kind: string }) => m.kind === 'league'));

// Play out the whole season (league and cup) to check trophies and the rollover.
const s1 = (await db.query<{ id: string }>("SELECT id FROM seasons WHERE number = 1"))[0].id;
for (let k = 0; k < 8 && (await db.query("SELECT 1 FROM seasons WHERE number = 2")).length === 0; k++) {
  await db.query("UPDATE matches SET kickoff_at = now() - interval '2 hours' WHERE status = 'scheduled' AND kind <> 'friendly'");
  for (let i = 0; i < 12; i++) await tick(db, true);
  await db.query("UPDATE matches SET ends_at = now() - interval '1 second' WHERE status = 'played'");
  for (let i = 0; i < 6; i++) await tick(db, true);
}
const cupRows = await db.query<{ round: number; home_goals: number; away_goals: number; pens: [number, number] | null }>("SELECT round, home_goals, away_goals, pens FROM matches WHERE kind = 'cup' AND status = 'final' AND season_id = $1", [s1]);
check('cup played to a final', cupRows.filter((r) => r.round === 4).length === 1, cupRows.length);
check('every cup tie has a winner', cupRows.every((r) => r.home_goals !== r.away_goals || (r.pens && r.pens[0] !== r.pens[1])), cupRows.filter((r) => r.pens).length + ' on pens');
const cupWin = await db.query("SELECT 1 FROM trophies WHERE kind = 'cup' AND player_id IS NULL AND season_id = $1", [s1]);
check('cup winner gets a trophy', cupWin.length === 1);
const memo = await db.query<{ n: string }>('SELECT count(*) n FROM collectibles');
check('memorabilia collected from matches', +memo[0].n > 0, memo[0].n);
const lg3 = await call('bo', 'GET', '/api/league');
check('season rolled over with honours', lg3.season.number === 2 && lg3.honours.length === 1 && lg3.honours[0].champion && lg3.honours[0].cup && lg3.honours[0].golden_boot, lg3.honours[0]);
const tr = await db.query<{ n: string }>("SELECT count(*) n FROM trophies WHERE player_id IS NOT NULL");
check('player trophies recorded', +tr[0].n >= 3, tr[0].n);

server.close();
process.exit(failed ? 1 : 0);
