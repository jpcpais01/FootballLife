// Player-facing patch notes. One group per hour (UTC), at most 5 entries per group.
// Newest group first. Add an entry with every merge to main.
export interface PatchGroup {
  hour: string; // ISO timestamp at the top of the hour, UTC
  entries: { title: string; body: string }[];
}

export const PATCH_NOTES: PatchGroup[] = [
  {
    hour: '2026-10-21T22:00:00Z',
    entries: [
      { title: 'Instant menus', body: 'Switching pages is now instant. Each page opens straight away from what you saw last time and quietly updates if anything changed, pages start loading the moment your finger touches a button, and the 3D training pitch and shop stand stay ready between visits. Page transitions are snappier too.' },
    ],
  },
  {
    hour: '2026-10-21T21:00:00Z',
    entries: [
      { title: 'A new home screen', body: 'The home screen is now a row of big tiles: your next match, club, training, league, cup, shop, home, transfers and profile. Move across them with the mouse or arrow keys, or tap once on mobile, and the screen below changes to show what is waiting there.' },
      { title: 'Training ground', body: 'Training is now played. Pick a drill (target finishing, rebound passing, speed gates, slide tackling or shot stopping) and run six reps on a sunny 3D training pitch by timing each strike on the meter. Your score sets the XP: from ×0.8 up to ×1.3 for a perfect run. Quick sessions still work, and you can practise for fun while you recover.' },
      { title: 'A real stadium', body: 'Matches now play in a closed two-tier bowl with a roof, floodlights, hospitality boxes, LED ribbons and big screens showing the score. The home end sings with scarves, flags and stripes in club colours, the away fans have their own block, and the whole crowd jumps up when a goal goes in. The pitch has proper mowing sheen, and day games get clouds and real roof shadows.' },
      { title: 'Matches that move like football', body: 'Both teams now play like real sides. Back lines hold a flat shape and step up together, forwards time runs behind the defence, full-backs overlap and defenders mark goal-side. Corners, free kicks with walls, penalties and goal kicks all set up properly. Players accelerate, brake, backpedal and side-step with bending knees, and you will see real kicks, headers, slide tackles and diving saves.' },
      { title: 'New look everywhere, built for phones', body: 'Glass panels, a soft moving background in your club colours, rounder buttons and tabs, smoother page transitions, and a top menu with the time, your coins and your inbox. On phones the tab bar floats, every button, chip and colour swatch is a comfortable thumb size, your activity on the home screen stacks into easy-to-read cards, scrolling tab rows fade at the edge, and text boxes no longer zoom the page on iPhone.' },
    ],
  },
  {
    hour: '2026-10-21T20:00:00Z',
    entries: [
      { title: 'Your own home', body: 'Every player now has a 3D home. Furnish it with sofas, home cinemas, rugs, plants, lamps and wall art, pick your wall colour and floor, and move up from a studio flat to a sky penthouse. Anyone can visit from your profile.' },
      { title: 'Garage', body: 'Buy cars from the Pocket Hatch to the Fulmine Hyper, choose the paint, respray them and pick a favourite. Bigger homes have bigger garages.' },
      { title: 'The FootbalLife Cup', body: 'A knockout cup now runs alongside every season, with ties at 15:00 UTC. Drawn ties go to penalties. Winners get a trophy, 500 coins each and the final ball.' },
      { title: 'Memorabilia', body: 'After about one in three league and cup matches you swap shirts with an opponent, and hat-tricks earn the match ball. They hang on the walls of your home. Five new achievements too.' },
      { title: 'Transfer market', body: 'Clubs can post vacancies, and you can make yourself open to offers while staying at your club. Apply to vacancies, or invite players straight from the market.' },
    ],
  },
  {
    hour: '2026-10-21T19:00:00Z',
    entries: [
      { title: 'Shop & locker', body: 'Spend your coins on boots, headbands, chains, outfits, profile cards, titles and goal celebrations. Try anything on your 3D player before you buy. Four featured items rotate daily, one at 30% off.' },
      { title: 'Your style on the pitch', body: 'Gear shows on your player in live 3D matches, and when you score, you do your own celebration: knee slide, aeroplane, spin or backflip.' },
      { title: 'Achievements & trophies', body: '28 achievements pay coins and unlock exclusive items. Season awards (champions, Golden Boot, Playmaker, Golden Glove, Player of the Season) fill trophy cabinets on profiles and clubs.' },
      { title: 'Club chat & invites', body: 'Every club has its own chat with full-time results. Share an invite link, request to join invite-only clubs, and invite free agents straight from your club.' },
      { title: 'Profiles', body: 'Edit your look any time, add a motto, show off a title and a profile card, and track your achievement progress.' },
    ],
  },
  {
    hour: '2026-10-21T18:00:00Z',
    entries: [
      { title: 'Fullscreen', body: 'The game now goes fullscreen on your first tap. Installed on your home screen, it opens fullscreen straight away.' },
    ],
  },
  {
    hour: '2026-10-21T17:00:00Z',
    entries: [
      { title: 'Server update', body: 'The game server now runs on a newer platform so the site can go live.' },
    ],
  },
  {
    hour: '2026-10-21T16:00:00Z',
    entries: [
      { title: 'FootbalLife kicks off', body: 'Create an account and your own footballer: pick a name, one of eight positions and your look.' },
      { title: 'Clubs', body: 'Found a club with your colours and badge, invite friends with a code, and share roles: founder, president, coach, captain. AI players fill any empty spots.' },
      { title: 'The league', body: 'A ten-club league with a morning and an evening round every day, a live table, fixtures, and top scorer, assist and clean-sheet charts.' },
      { title: 'Live 3D matches', body: 'Every match is simulated on the server and plays out live in a 3D stadium for everyone at once, with commentary, stats and replays.' },
      { title: 'Training', body: 'Train an attribute or a category every four hours. Matches give XP and coins too.' },
    ],
  },
];
