// Player-facing patch notes. One group per hour (UTC), at most 5 entries per group.
// Newest group first. Add an entry with every merge to main.
export interface PatchGroup {
  hour: string; // ISO timestamp at the top of the hour, UTC
  entries: { title: string; body: string }[];
}

export const PATCH_NOTES: PatchGroup[] = [
  {
    hour: '2026-10-21T23:30:00Z',
    entries: [
      { title: 'Colour themes', body: 'Pick a look from the menu under your avatar. Floodlight is the classic dark-and-lime look. Aero is a glossy tropical lagoon of sky blue and fresh green, with floating bubbles. Ballon d\'Or is black lacquer and warm gold, like an awards night. Your choice is remembered on this device.' },
    ],
  },
  {
    hour: '2026-10-21T23:00:00Z',
    entries: [
      { title: 'Your live rating', body: 'When you play in a match, your own rating now sits at the end of the scorebug and updates live as you pass, tackle, shoot and score. It glows red, amber, green or lime as your game goes, flashes the change each time it moves, and shows a star if you finish as player of the match.' },
      { title: 'More breathing room', body: 'In landscape, pages are a little smaller with more space around them so everything reads at a glance. The game now uses the whole screen, including the status bar area, with an even margin on both sides. Pages you open from another page, such as another club or player, get a small back button in the top bar, and the match screen has one in the corner.' },
      { title: 'New match icons', body: 'The commentary, the live ticker and the match data screen now use a custom set of match icons (goals, saves, cards, corners, offsides, free kicks and more) instead of emoji, so they look the same on every phone.' },
      { title: 'Made for landscape', body: 'FootbalLife is now built to be played sideways. Your first tap goes fullscreen and turns the screen to landscape, and if you hold your phone upright you get a reminder to turn it (or stay in portrait if you prefer). There is now one menu instead of two: the icon dock, which runs down the left edge in landscape. The home screen is a swipeable spotlight with a card for your match, club, training and more. Matches and training fill the whole screen, with the commentary beside the pitch.' },
      { title: 'Feels like an app', body: 'The inbox bell now opens your notifications on phones too, with links straight to your matches. The page no longer zooms when you pinch or double-tap, scrollbars are gone, the screen does not bounce or pull to refresh, and long-presses no longer select text or pop up menus.' },
    ],
  },
  {
    hour: '2026-10-21T22:30:00Z',
    entries: [
      { title: 'Matches, reworked', body: 'Penalties now play out properly: everyone waits outside the box, the keeper sets on the line and the taker steps back and runs up, with no more drifting back into open play first. Free kicks, corners and throw-ins hold their shape until the ball is struck, the wall and markers set up in the box, throw-ins come from the hands, and the camera frames the ball and the goal. Balls now go out for throw-ins and corners as often as in real football. Players no longer skate around after a fast-forward, short skips cut away with a quick broadcast wipe instead of a jittery time-lapse, and live matches load a few seconds ahead so they never stall.' },
      { title: 'A new app icon', body: 'FootbalLife has a new icon: a bold italic FL in lime on black, with speed lines. It shows on your home screen, in the app switcher and in your browser tab. If you installed the game before, the new icon may take a day to appear, or reinstall it to see it straight away.' },
    ],
  },
  {
    hour: '2026-10-21T22:00:00Z',
    entries: [
      { title: 'A new menu dock', body: 'On phones, the menu is now a floating glass dock of icon tiles at the bottom of the screen, matching the home screen rail, with the page behind it fading darker toward the bottom. Your live or next match has its own tile (with a LIVE badge when it is on), Training glows when you are ready for a session, and the page you are on lights up. Every home screen tile is now labelled too.' },
      { title: 'Match data screen', body: 'When a match fast-forwards through build-up play, and at half-time, the 3D view now gives way to a live data screen: an attack momentum graph with every goal marked, a mini pitch with a heatmap and the ball\'s path, field tilt, and possession, xG, shots and passes counting up as they happen, plus the key moments so far. The pitch comes back just before the next chance. Turn it off with the chart button on the match screen. Replays also get a single speed button: tap it to step through 1×, 2×, 4× and 8×.' },
      { title: 'True fullscreen', body: 'The game now hides the phone\'s status bar and navigation bar, and stays fullscreen: if you swipe out of it, your next tap brings it back. Installed on Android, it opens fullscreen straight away.' },
      { title: 'Brand-new players', body: 'Every footballer has been rebuilt from scratch: athletic proportions, real kits with side panels, stripes or hoops, cuffs, sock bands and shirt numbers, shaped boots with soles, and faces with eyes, brows and your chosen expression. Beards and earrings now show, every hairstyle has been redone, and players pump their arms and twist through the shoulders when they run.' },
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
