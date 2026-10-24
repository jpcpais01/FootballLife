// Player-facing patch notes. One group per hour (UTC), at most 5 entries per group.
// Newest group first. Add an entry with every merge to main.
export interface PatchGroup {
  hour: string; // ISO timestamp at the top of the hour, UTC
  entries: { title: string; body: string }[];
}

export const PATCH_NOTES: PatchGroup[] = [
  {
    hour: '2026-10-24T00:00:00Z',
    entries: [
      { title: 'Throw-ins come alive', body: 'Nobody stands still waiting for a throw-in any more. The four nearest team-mates each take an option: one comes short to feet, one runs down the line, one sits inside to switch the play and one drops back for a safe ball. Each drifts away from his marker, then darts into the space on his own rhythm, so there is always someone moving to take the throw. Defenders pick them up goal-side, tight on the ones closest to the ball.' },
    ],
  },
  {
    hour: '2026-10-23T23:00:00Z',
    entries: [
      { title: 'Awards night', body: 'When a season ends, the next time you open the game it gets its own ceremony. First comes where your club finished and the coins it earned. Then the champions are unveiled with their points and record, then the cup winners, then the Golden Boot, Playmaker, Golden Glove and Player of the Season, each with its trophy, the winner and their numbers. A big "That\'s you!" lights up if one of them is yours. It closes with your own season in numbers and any silverware you took home. Tap to move through it, or skip.' },
    ],
  },
  {
    hour: '2026-10-23T21:00:00Z',
    entries: [
      { title: 'Free kicks like the real thing', body: 'On a free kick swung in from deep, the defence now holds a line around the edge of the box to catch runners offside. The attackers stand level with it beside their markers, shuffling and waiting, then sprint in behind as the ball is struck, each to his own zone: near post, far post or the penalty spot. Two players wait outside the box for the second ball. On a shooting free kick, a second man stands over the ball with the taker to keep the keeper guessing, and an attacker joins the end of the wall to block his view.' },
    ],
  },
  {
    hour: '2026-10-23T20:00:00Z',
    entries: [
      { title: 'Your season, at a glance', body: 'The league has a new You tab, also on the home screen as My season. It shows your form as a line of every rating this season, with stars for player of the match. It shows your club\'s place and how it has moved round by round, how far you are off the top, and your next fixture. You can see where you stand in the Golden Boot, Playmaker and Player of the Season races and how far behind the leader you are. Milestones count up your appearances, goals, assists and big games, and every match you played is listed with your rating.' },
    ],
  },
  {
    hour: '2026-10-23T19:00:00Z',
    entries: [
      { title: 'A referee on the pitch', body: 'Every match now has a referee and two assistants. The referee runs the diagonal, staying close enough to see but out of the way of play, while the assistants move along the touchlines level with the last defender. He blows his whistle for fouls, goals and kick-offs, points the way for free kicks, points to the spot for penalties, jogs over and holds up a yellow or red card to the player he books, and points back to the centre after a goal. Assistants flag offsides and signal which way a throw-in goes. Players shown a red card now walk off the pitch instead of vanishing.' },
      { title: 'Corners with a plan', body: 'Attacking corners are now rehearsed moves. While the taker places the ball, the attackers shuffle in a pack around the penalty spot and one stands on the keeper\'s toes. As the ball is struck they burst out to their zones: some corners flood the near post, some overload the back post, others spread across the goal, and the best header in the team always takes the key run. Runs cross, markers get dragged, and the box finally looks like a real corner.' },
    ],
  },
  {
    hour: '2026-10-23T18:00:00Z',
    entries: [
      { title: 'Natural hands', body: 'Players\' hands no longer stick out with the palms facing forward. They now hang relaxed in line with the arm, palms towards the legs, at home, in the locker room, in training and in matches.' },
      { title: 'Season badge no longer hidden', body: 'On phones held sideways, the small Season badge with your league place on the home screen slid under the coins and profile bar in the top right. It now sits clear of it, a little further left.' },
    ],
  },
  {
    hour: '2026-10-23T17:00:00Z',
    entries: [
      { title: 'Your match, at full time', body: 'When the final whistle goes, a report card now tells the story of your own game: your rating counts up in a glowing ring, a gold star if you were player of the match, your goals, shots, passing and tackles, and one line on how it went. It shows the coins and fame you earned, any attributes that levelled up, and how the rating compares to your season average, so you know when you have just played your best game of the season.' },
    ],
  },
  {
    hour: '2026-10-23T16:30:00Z',
    entries: [
      { title: 'Defenders who read the game', body: 'Midfielders and forwards with nobody to mark now step into the passing lane between the ball and the most dangerous player near them, so the forward pass is cut off instead of left open. When a team is caught outnumbered on the break, defenders no longer dive in: the back line backs off and the nearest man stands the attacker up a few metres away, slowing him down until help gets back.' },
      { title: 'Corners set up like the pros', body: 'When defending a corner, teams now leave their striker up near halfway as an outlet for the counter, put one player on the near post and two on the six-yard line, and mark the rest man to man.' },
    ],
  },
  {
    hour: '2026-10-23T15:00:00Z',
    entries: [
      { title: 'Clever movement in attack', body: 'Attackers now make the runs real players make. As a pass travels, a team-mate further up reads where the next ball will go and runs into the space beyond the man receiving it, the classic third-man run. A player with a defender tight on him takes a couple of steps away to drag his marker, then darts back towards the ball, and the gap that opens is the pass. Players around the ball also stay out of the lane in front of the dribbler, so he has grass to run into.' },
      { title: 'Rotations and balance', body: 'When a full-back goes round the outside, his winger comes inside into the pocket between defenders instead of the two standing on top of each other. When too many players have gone forward, the deepest spare midfielder or full-back holds back, so a team always keeps three players behind the ball to stop the counter.' },
    ],
  },
  {
    hour: '2026-10-23T14:50:00Z',
    entries: [
      { title: 'A new training ground', body: 'Training now happens at the club academy at golden hour: real grass with mowing stripes and worn patches, a modern academy building, a covered stand, trees swaying in the breeze, floodlights, cones, ladders, hurdles, mannequins and a cart full of balls. The goal has a proper net that bulges when you score, and the light, shadows and colours match the stadium.' },
      { title: 'Your player, true to size', body: 'The round stand under your player is gone. He now stands on the grass at his real size, with the goal, targets and gates scaled around him, and between drills the camera circles him while he does keepy-ups.' },
      { title: 'Drills that feel great', body: 'Every shot and pass leaves a trail, the turf flies when you strike, and a perfect hit drops into slow motion as the camera pushes in on the target. Kicks, the net, saves, the countdown and the whistle all have their own sounds. The timing bar is new, with a glowing perfect zone, a ripple where you stopped it, and points and combos popping up after each rep.' },
      { title: 'Training menu on the pitch', body: 'Pick your drill from the list on the left of the training ground while your player waits on the right, then start from the big button in the corner. On a sideways phone the whole screen is the training ground. The results card counts your score up, stamps your grade and shows how each rep went.' },
    ],
  },
  {
    hour: '2026-10-23T14:40:00Z',
    entries: [
      { title: 'Streetwear', body: 'Your player now has a life off the pitch. Over a hundred new items to wear away from the club: tees, hoodies, puffers, jackets, jeans, cargos, shorts, sneakers, caps, beanies, glasses, chains and bracelets, all modelled on your 3D player. Your club kit stays for matchday. Your profile and home show your street look.' },
      { title: 'New shop and rarities', body: 'The shop is rebuilt with Streetwear, Accessories, Matchday and Profile sections, filters, a daily featured drop and five rarities: Common, Rare, Epic, Legendary and the new animated Mythic. Switch the stage between Street and Matchday to see your outfit or your kit, and tap Hold still to stop his idle and turn him around to look closely.' },
      { title: 'Daily box', body: 'Open a free box twice a day, once in the morning and once in the evening (UTC). It can hold coins, stars or an item, from Common up to Legendary. The odds are shown in the box tab. Duplicates turn into coins.' },
      { title: 'Stars', body: 'Stars are the new premium currency, shown next to your coins. The rarest items cost stars. Earn 2 stars by watching a short video, up to 5 times a day. Star packs are coming soon.' },
      { title: 'Name borders', body: 'Name borders now frame your name on your profile and in club chat, from Steel and Neon up to animated Fire, Galaxy and the crowned Legend border.' },
    ],
  },
  {
    hour: '2026-10-23T14:30:00Z',
    entries: [
      { title: 'Try before you buy', body: 'Tap any sofa, TV, rug or other piece you do not own yet and it appears in your home straight away, with the camera moving in and your player walking over to have a look. Buy it from the bar under the picture, or close the preview. You can also look inside any house before buying it, and see any car in your garage, in the paint you pick, before you pay. Respraying a car shows the new colour while you decide.' },
      { title: 'A better looking home', body: 'Rooms now have soft shadows in the corners and under every piece of furniture, the lighting is no longer washed out, the lawn has real texture, and lamps and windows glow in the penthouse at night. All cars have been remodelled with rounded bodywork, flared wheel arches, proper glass, brake discs and lights, in your garage and on the street. On slower phones the home lowers its quality by itself to stay smooth.' },
    ],
  },
  {
    hour: '2026-10-23T14:00:00Z',
    entries: [
      { title: 'Club facilities', body: 'Clubs now have a treasury and five facilities to build: Stadium (a bigger home edge in the league), Head coach (team chemistry), Match balls & kit (more training XP for every member), Academy (better AI teammates) and Sponsors lounge (more coins from matches). Each has five levels, and works take a few hours to finish. Every bonus is small, so a well-run club gets an edge without matches being decided off the pitch.' },
      { title: 'Donate to your club', body: 'Members can donate coins and stars from the new Facilities tab. Top donors are listed in the treasury, and every donation shows in the club chat. Levels 4 and 5 need stars, stars can finish works early, and three rare items are bought with stars only: the Golden crest, an Ultras tifo and the Team bus.' },
      { title: 'President and captain', body: 'The president (and the founder) now make every upgrade decision with the treasury. The captain picks the line-up and tactics; until a club names one, the president does. The head coach is no longer a player role: he is staff you hire and improve through upgrades. Members who were coach are now players.' },
      { title: 'Your training ground', body: 'The top of the club page now shows your training ground: a few of your squad at work, with the head coach watching. Who is out training changes through the day, and the stand, floodlights, balls and banner grow as you upgrade the club.' },
      { title: 'Your player leads the home screen', body: 'The home spotlight now opens on your own player in 3D, standing in a pool of light in his outfit and slowly turning. Tap him and he celebrates. Next to him are your overall rating, games, goals and average rating per game, plus your five key attributes as new glowing gauge bars that fill up when you arrive and change colour as you improve, from red through amber to your theme colour and gold for 80 and up.' },
    ],
  },
  {
    hour: '2026-10-23T13:30:00Z',
    entries: [
      { title: 'Players move like footballers', body: 'Players off the ball no longer jog everywhere all match. When they are where they need to be they stand and watch the play, small adjustments are walked, and they save their running for the moments that matter: closing down, getting back, attacking space. Walking time has nearly doubled, to about half the match like in real football, and the far side of the pitch is calm while the players near the ball stay on their toes. Every player also has his own work rate.' },
      { title: 'Smarter transitions', body: 'When the ball changes hands the teams no longer snap from one shape to the other. Forwards spring forward the moment the ball is won and defenders drop straight back when it is lost, while full-backs and holding midfielders wait a moment to see the ball kept before they push on. A scrappy spell of back-and-forth no longer sends everyone sprinting up and down the pitch.' },
      { title: 'Defending as a unit', body: 'The back four now steps up and drops off together in clear moves, instead of drifting with every touch. The man closing down the ball commits to it and slows to jockey in the last few metres instead of charging in, and markers stay with their man rather than swapping whenever someone runs past.' },
    ],
  },
  {
    hour: '2026-10-23T13:00:00Z',
    entries: [
      { title: 'Daily check-in streak', body: 'Open the game each day to claim a check-in reward. A week of rewards climbs from 50 coins on day 1 up to 400 coins and a gift on day 7, then the week starts again. Miss a day and the streak starts over, but you never lose anything you have earned.' },
      { title: 'Daily goals', body: 'Every day you get three new goals: a quick one, one on the training ground and one with your club, like changing your look, scoring 80 or more in a drill, or sending a message in club chat. Each one pays coins and fame, and finishing all three opens a bonus of 150 coins. Tap the target button in the top bar or the Today card on the home screen to see them. A banner tells you as soon as a goal is complete.' },
      { title: 'Fame and career levels', body: 'You now have a Fame level, shown on your avatar. Matches, training, achievements, check-ins and daily goals all earn fame. Every new level pays coins and moves you up a title, from Academy prospect through Fan favourite and Club legend to Icon.' },
      { title: 'No more surprise fullscreen on computer', body: 'On a computer the game no longer jumps into fullscreen and back out on its own as you click around. It now stays in a normal window; phones and tablets still go fullscreen and sideways on the first tap.' },
    ],
  },
  {
    hour: '2026-10-23T12:30:00Z',
    entries: [
      { title: 'Real wing play', body: 'Full-backs and wingers who are better crossers than shooters now take the ball down the line and cross from out wide, instead of everyone cutting inside. There are about twice as many crosses and more corners. Forwards make runs in behind far more often, so you see more through balls and the odd offside.' },
      { title: 'Clean half-time', body: 'Fixed a split-second flash where everyone jumped to the centre spot when a highlight ran right up to the half-time whistle.' },
    ],
  },
  {
    hour: '2026-10-23T12:00:00Z',
    entries: [
      { title: 'Instant player creator', body: 'Changing your look no longer freezes the screen. Faces and kits are now painted in the background, only the part you changed is rebuilt, and your player updates in place without restarting his pose. Trying hairstyles, eye colours or face sliders now feels immediate, and the option previews fill in without stalling the page. Players also load more smoothly in matches and at home.' },
      { title: 'Better look studio', body: 'The player stage in the Look tab is now much taller and fills the side of the screen, and the face close-up zooms in further. Your player now stands still on the turning stand instead of shuffling and crossing his legs, and pale skin tones have more natural warmth instead of looking white.' },
      { title: 'Training sessions save again', body: 'Finishing a training drill no longer fails with "Training already in progress" when the score is being banked. Every session after your first was being turned away by mistake; your XP and drill score now count every time you train.' },
    ],
  },
  {
    hour: '2026-10-23T11:30:00Z',
    entries: [
      { title: 'All-new players', body: 'Every footballer has been rebuilt from scratch on a realistic human body. Faces have real eyes that catch the light, lips, brows and skin with warmth and texture, and kits are proper fabric with collars, cuffs, stripes, socks and boots that shine. Your shirt number is printed on the back. Every player still moves with the same motion-captured animation.' },
      { title: 'A real player creator', body: 'Create your footballer with sliders for every part of the face: head and jaw shape, cheeks, eyes, nose, mouth and ears, plus build and muscle. Pick from 24 hairstyles with real volume, from buzz cuts and fades to curls, an afro, long hair, dreads, twists and a high top, along with beards, marks and accessories. Each group has a reset button, and the camera zooms in on the face while you work on it.' },
    ],
  },
  {
    hour: '2026-10-23T11:00:00Z',
    entries: [
      { title: 'A brand new home', body: 'Every home has been rebuilt from the ground up. Each one now has a real floor plan with separate rooms: from the studio with its kitchen corner, bed and shower room, up to a villa with its own gym and a penthouse with a roof terrace. Walls have proper doors and windows, and the walls nearest the camera drop down so you can always see inside. The outside is no longer a flat picture: you see the actual street, park, beach or city skyline around your home, with its own sky and lighting, from a sunny townhouse garden to the penthouse lit up at night. The villa has a pool over the beach and the penthouse a hot tub on the terrace.' },
      { title: 'Walk around your house', body: 'Your player now lives in his home. Tap anywhere to walk there: he finds his way through the doors and around the furniture, and jogs when it is far. Tap a sofa, the TV, the trophy cabinet or a bed and he walks over to it. Leave him alone and he wanders between rooms by himself. Drag to look around and pinch to zoom in close.' },
      { title: 'Cars and garage, rebuilt', body: 'Every car has been remodelled with a proper shape, glass, wheels and lights. The garage has marked bays, a workbench and tool wall, and your favourite car is parked outside your home in its own paint.' },
      { title: 'Home screen made for landscape', body: 'The house fills the screen on a sideways phone, with the furnish, move and garage options in a panel beside it. Many old glitches are gone: no more sky showing through walls, floating furniture or grass on top of the pool. It also runs much faster on phones.' },
      { title: 'Every player moves his own way', body: 'Players no longer all move like copies of each other. Each one has his own running style: a longer or shorter stride, how far he leans into his running, how wide he holds his arms and how he carries his head, and he keeps it every match. No two strikes look quite the same either: some players snap through the ball and others let the follow-through flow, first touches and headers come off either side, and keepers react in their own way. Celebrations run at each player\'s own tempo. Every replay of a moment still plays out exactly the same, and the foot still meets the ball just as before.' },
    ],
  },
  {
    hour: '2026-10-23T10:30:00Z',
    entries: [
      { title: 'Matches play like real football', body: 'The match AI has been retuned against real match data. Players now walk and jog to hold their shape and only sprint when the play needs it, instead of running everywhere. Teams keep the ball with more short passes from team-mates who come close to offer an option, and play far fewer hopeful long balls. The tempo is calmer. Attackers can no longer walk the ball through a defender standing in their way, so they have to take him on, pass or shoot. Players shoot from the edge of the box when they see the goal, and chances get harder to score the further out they are. A typical match now has about 28 shots and three goals, a bit over half of the shots from inside the box. Better teams still win most games, but upsets happen again.' },
      { title: 'No more surprise corners', body: 'When a defender heads a cross behind, a shot is blocked wide, or the keeper tips one round the post, you now see the ball fly over the goal line before the corner is given. Before, it just stopped in the box and the corner appeared.' },
    ],
  },
  {
    hour: '2026-10-23T10:00:00Z',
    entries: [
      { title: 'Training comes alive', body: 'Every drill now uses real motion capture. Your player runs in and strikes through the ball with his boot meeting it, side-foots passes after squaring up to the board, slides in to win the ball and gets back up, and keepers dive full stretch, land and get up again. Between reps he does real keepy-ups: knee to knee, catching the ball on his foot and flicking it back up, with the ball riding the touch. He walks back to his mark and turns on the spot properly instead of snapping round.' },
      { title: 'More motion in matches', body: 'Players running at an angle use real diagonal running instead of crossing their legs. Keepers organise their defence before a corner or free kick, bowl short balls out underarm, and turn away in despair after conceding. A ball dropping in the box can be met with an overhead scissor kick, team-mates jump for joy after a goal, and a player landing from a dive or a scissor kick gets up facing where he fell instead of spinning round.' },
      { title: 'Set pieces make sense', body: 'Corners and free kicks now show what led to them, like the cross that was headed behind or the foul, instead of the ball suddenly appearing by the corner flag. A shot that flies wide or is parried no longer jumps into the keeper\'s hands for a moment.' },
    ],
  },
  {
    hour: '2026-10-23T09:00:00Z',
    entries: [
      { title: 'No more ice skating', body: 'Players standing, waiting at a set piece or walking back now keep their feet planted on the grass instead of sliding around, and step to a new spot with a proper lift of the foot. A player who passes or shoots on the run keeps running with his standing leg while he strikes, instead of gliding across the grass mid-kick. Team-mates sprinting to the scorer after a goal run there, then celebrate once they arrive. Foot sliding across a match is down by about two thirds.' },
      { title: 'Clean cuts, no popping', body: 'When the players are reset for a kickoff, they appear on their new spots in a clean cut instead of gliding across the pitch. A player who takes a touch and then plays a pass straight away flows from one move into the next, instead of his body jumping back in a single frame.' },
      { title: 'No more ball popping into place', body: 'After the ball goes dead it now runs on, then is tossed back to the spot. For a throw-in it lands in the thrower\'s hands, and he lifts it over his head before throwing. After a goal it is booted back to the centre circle. The ball never vanishes or teleports, and every restart waits until the taker has walked up to it. Penalties are given straight away at the foul. The ball is placed on the spot and the box clears, then the taker steps back and runs up to strike it, about ten seconds later instead of twenty-five to thirty-five. Corners, free kicks, throw-ins and goal kicks are taken quicker too, and highlights no longer open on long stretches of players standing around.' },
      { title: 'Smoother, truer ball flight', body: 'Fixed a stutter on every kick: the ball used to jump forward on its first frame and pause for a frame when it arrived. Balls in the air now rise and fall under real gravity, ground passes roll at a more natural pace, throw-ins fly in a proper arc, shots that hit the net stay in the goal, keepers meet saves where they actually stand, and parried shots are pushed wide of the post. The second half now starts cleanly with no flash of players jumping into position, and sent-off players walk off instead of disappearing.' },
    ],
  },
  {
    hour: '2026-10-22T03:00:00Z',
    entries: [
      { title: 'Players think like footballers', body: 'Every time a player has the ball he now weighs up everything he could do: a safe pass to a free team-mate, a pass that breaks the lines, a switch of play to the open wing, a ball in behind for a runner, carrying it into space, taking his man on, crossing or shooting. Each is judged by the danger it creates against the risk of losing the ball there, and better decision makers pick the right one more often. No more passes into a crowd or shots from nowhere.' },
      { title: 'Teams move as a unit', body: 'Out of possession teams defend in compact lines that slide across with the ball, press when the moment is right, mark tightly in their own box and double up on the man on the ball. In possession they spread across the pitch, keep defenders back for the counter, and the players around the ball keep moving into pockets of space. Passers go again after a one-two, full-backs overlap, and teams break at speed after winning it back.' },
      { title: 'Smarter keepers', body: 'Keepers set themselves as the shot is struck, rush out to close down a striker clean through, sweep up balls played over their defence, and no longer dive at shots that are going well wide.' },
      { title: 'A cleaner fast-forward screen', body: 'The data screen you see while quiet spells are fast-forwarded has been redesigned for phones held sideways. The mini pitch and the key numbers (possession, shots and xG) are bigger and easier to read, the momentum strip now zooms to the match so far instead of sitting mostly empty, and only the data-screen switch stays on screen. Live matches lose the line of text under the pitch, so the stage fills the whole height, with a pulsing live dot on the match clock instead. Commentary beside the pitch wraps far less.' },
    ],
  },
  {
    hour: '2026-10-22T02:45:00Z',
    entries: [
      { title: 'Goalkeepers rebuilt', body: 'Keepers now read the real flight of the ball. They scoop low shots, gather them at the waist, catch at the chest, jump for high balls and dive low or high to the right side, timed so their hands meet the ball instead of diving early at thin air. After a dive they land, get back up and walk back to their spot, and after a save the ball stays in their hands until they throw it, drop-kick it or put it down.' },
    ],
  },
  {
    hour: '2026-10-22T02:30:00Z',
    entries: [
      { title: 'Real sizes, cleaner strikes', body: 'Players are now real size: about 1.8 m tall on a full 105 by 68 m pitch, next to 7.32 m goals and a proper 22 cm ball. Passes no longer look like shots: short passes get a compact pass with a proper wind-up, long balls and clearances a fuller kick, and chips, crosses and shots each have their own. Players step in and square up so the foot really meets the ball, first touches stop it with the sole, sliding tackles go in feet first, and every change of motion blends smoothly instead of snapping.' },
      { title: 'Shots that look like shots', body: 'Strikers now pick their shot: a side-foot finish into the far corner, a driven strike across the keeper, a curler that starts outside the post and bends in, a dipping free kick over the wall, or a chip when the keeper rushes out. The ball rises and dips with real weight, misses go just wide of the post or over the bar instead of miles off, and players only shoot when they can actually see the goal.' },
      { title: 'Clean first touches', body: 'Passes are now hit to where the team-mate can actually get to, and he runs onto the ball before taking his touch, so the ball never jumps to a player\'s feet. Every touch uses the right move: side-foot passes, chips, long balls, chest control, headers, keeper throws and kicks, throw-ins, and fouled players go down and get back up.' },
      { title: 'Headers at head height', body: 'Crosses now meet attackers and defenders right at head height, so headers connect cleanly instead of flying over the player.' },
      { title: 'See the build-up', body: 'Every live highlight now starts ten seconds before the big moment, so you see the move that led to the goal, the chance, the card or the corner.' },
    ],
  },
  {
    hour: '2026-10-22T02:00:00Z',
    entries: [
      { title: 'New menu icons', body: 'The side menu has a brand new set of icons drawn for FootbalLife: a training cone, a club crest with a star, a proper match ball, a kit for the shop and more. Each has its own colour detail, the resting tiles are cleaner glass, and the page you\'re on lights up in its colour. They match all three themes.' },
      { title: 'Sharper match camera', body: 'The broadcast camera now leads the play like a real camera operator, drifting ahead in the direction the ball is travelling, and every highlight opens straight on the action instead of swooping in from across the pitch.' },
      { title: 'Smarter defending', body: 'Teams now defend like a unit. The block drops deeper and slides across toward the ball, the second man shuts off the easiest pass while his team-mate presses, and anyone caught upfield sprints back goal-side instead of jogging. Wingers cut inside toward goal in the final third, and kick-offs line up properly.' },
    ],
  },
  {
    hour: '2026-10-22T01:00:00Z',
    entries: [
      { title: 'A new match engine', body: 'Matches are now played out on a real pitch. All 22 players run with their own pace and acceleration, the ball rolls, flies and bounces, and every pass, dribble, tackle and shot is decided from where everyone actually is. Teams hold a back line, press the ball, track runners and attack the box for crosses.' },
      { title: 'Highlights at true speed', body: 'When a big moment plays out live, it is now the real thing: you see exactly how the engine played it, at normal speed, with every player already in the right place. Strikes, headers, tackles and keeper dives are timed to the moment the ball is hit. Matches still last about ten and a half minutes, with the quiet spells fast-forwarded.' },
      { title: 'New player bodies', body: 'Every player has a brand new body: one smooth, athletic figure with longer legs, broader shoulders and real joints instead of stiff separate pieces. All your look studio choices carry over, and the new body is lighter for your phone to draw.' },
      { title: 'Real motion capture', body: 'Players now move with motion captured from real people. Walking, jogging, running, side-steps and backpedals blend smoothly with each player\'s actual speed, feet plant on the grass without sliding, and heads turn to follow the ball. Passes, shots, chips, crosses, traps, slide tackles, falls, keeper dives and catches are all captured too, timed so the foot meets the ball on the exact moment it\'s struck.' },
      { title: 'No more random flashing', body: 'Pages no longer flash or redraw themselves out of nowhere. The home screen, the top bar and the menu bar now only change when something actually changed, like a new result or more coins, and game updates install quietly while FootbalLife is in the background instead of reloading the screen while you play.' },
    ],
  },
  {
    hour: '2026-10-22T00:30:00Z',
    entries: [
      { title: 'Your real face, everywhere', body: 'Every portrait in the game is now a shot of your actual 3D player, in your club colours: the top bar, squad lists, the club chat, match line-ups and player pages. Change your look and every portrait follows.' },
      { title: 'A new look studio', body: 'Creating a player and the Look tab in the locker share a new studio. Pick a category (Face, Eyes, Nose and mouth, Hair, Facial hair, Extras) and the camera moves in on your face, with every option shown as a 3D preview of you wearing it. Randomise rolls a whole new look.' },
      { title: 'Many more options', body: 'Choose from 6 face shapes, 6 eye shapes, 6 eye colours, brows, noses, lips, freckles, moles and scars, 12 skin tones, 14 hair colours, 20 hairstyles (new: fade, slick back, side part, fringe, spiky, waves, dreads, cornrows, man bun and mullet) and 10 kinds of facial hair. Faces are rebuilt with real eyes, lids, ears and lips.' },
      { title: 'Music and crowd sound', body: 'FootbalLife now has its own soundtrack. The menus play a calm, endless lo-fi loop with warm pads, electric piano, soft bass and brushed drums that never repeats exactly the same way. Open a match and the music fades into a stadium crowd that murmurs, rises at big moments, claps along and roars when a goal goes in. Sound starts on your first tap. Turn the music or the crowd off, or change the volume, from the menu under your avatar.' },
    ],
  },
  {
    hour: '2026-10-22T00:00:00Z',
    entries: [
      { title: 'Emoji in the club chat', body: 'The club chat has an emoji button next to the message box. Pick from football, smileys, hands, hearts and flags, and the ones you use most wait for you under Recent. Send just one, two or three emoji on their own and they show up big.' },
      { title: 'Cleaner match screen', body: 'Commentary, stats and line-ups beside the pitch now share one button: tap it to move to the next one, and the dots show which of the three you are on. The back button no longer covers the corner of the pitch; use the menu on the left to leave a match.' },
      { title: 'Club badge studio', body: 'Club badges get a full editor. Pick from 16 shapes, 32 emblems (including a monogram of your short name), 16 patterns like stripes, hoops, checks and sunburst, and 6 border styles. Choose your own colour for the field, pattern, emblem, border, stars and text, resize, move and tilt the emblem, add up to five stars, and put your club name or founding year on a band, an arc or a ribbon. Shuffle gives you a random design to start from.' },
      { title: 'Edit your club any time', body: 'The founder and president can now change the badge, club name, short name and kit colours whenever they like, from Edit club on the club page or the Manage tab. The club chat lets everyone know when the name or badge changes.' },
      { title: 'Home fits the screen', body: 'On a sideways phone the home screen no longer starts with empty space at the top. Your name now sits beside the top pill, and the spotlight card fills the rest of the screen when you open the game.' },
      { title: 'Top pill on home only', body: 'Your coins, refresh, inbox and profile pill now only appear on the home screen, so every other page gets the full screen. Pages you open from another page still have their back button.' },
    ],
  },
  {
    hour: '2026-10-21T23:30:00Z',
    entries: [
      { title: 'A cleaner top bar', body: 'The big header is gone. Your coins, the refresh button, the inbox bell and your avatar now sit together in one floating glass pill in the corner, and pages you open from another page get a floating back button.' },
      { title: 'Home screen tidy-up', body: 'The row of page buttons under the home spotlight is gone (swipe or use the arrows), and so is the separate Live now box. The league table on the home screen is now twice as wide and shows goals for and against, goal difference, red cards and recent form.' },
      { title: 'Calmer Aero', body: 'The Aero theme no longer has floating bubbles in the background.' },
      { title: 'Refresh button', body: 'A new refresh button in the top bar reloads the whole game and picks up the latest update straight away, without waiting for the app to update itself in the background.' },
      { title: 'Colour themes', body: 'Pick a look from the menu under your avatar. Floodlight is the classic dark-and-lime look. Aero is a glossy tropical lagoon of sky blue and fresh green. Ballon d\'Or is black lacquer and warm gold, like an awards night. Your choice is remembered on this device.' },
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
