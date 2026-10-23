// Footballers: athletic figures in club kits. The body is the MakeHuman-based
// character (character/): one skinned mesh over a Mixamo-named skeleton
// (rig/skeleton.ts) with a kit texture shared by the team and a painted face,
// plus eyes and hair riding on the head bone. Motion comes from
// rig/animator.ts: mocap or hand-made clips blended by velocity, timed
// actions, head tracking and foot IK.
import * as THREE from 'three';
import { BOOT_COLORS, sanitizeAppearance, type Appearance } from '../../shared/appearance.ts';
import { gear, ITEM_BY_ID, type Equipped, type Item } from '../../shared/cosmetics.ts';
import { type Pattern } from './character/bodyPaint.ts';
import { KEEPER_CUT, KIT_CUT, whenCharacterReady } from './character/body.ts';
import { casualCut } from './character/casual.ts';
import { buildHood, buildNeckwear, buildShoes, buildWristwear, shoeMaterial } from './character/wear.ts';
import { linear } from './character/paint.ts';
import { buildCharacter, prepareCharacter, type CharacterKit, type Detail } from './character/character.ts';
import { type ActOpts, type ActionKind, type AnimInput, Animator, seeded } from './rig/animator.ts';
import { duration } from './rig/clip.ts';
import { getClip, hasClip, loadMocap } from './rig/library.ts';
import { B, makeBones, setBindPose } from './rig/skeleton.ts';

export interface Kit {
  primary: string;
  secondary: string;
}

/**
 * World metres per body unit. The body is modelled about 2.2 units tall, so
 * this makes a 1.8 m player against the real 105 x 68 m pitch, 7.32 m goals
 * and 22 cm ball. Showcase scenes (portraits, the kit turntable) pass their own.
 */
export const LIFE_SCALE = 0.82;
/** The larger, closer-up size the drills, portraits and kit turntable are framed for. */
export const SHOWCASE_SCALE = 1.45;

// ---------- Looks ----------

function kitPattern(k: Kit): Pattern {
  let h = 0;
  for (const ch of k.primary + k.secondary) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = h % 10;
  return r < 6 ? 'plain' : r < 9 ? 'stripes' : 'hoops';
}

function mix(a: string, b: string, t: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** A colour that reads against `c`: white on dark, near-black on light. */
function contrast(c: string) {
  const col = new THREE.Color(c);
  return col.r * 0.3 + col.g * 0.59 + col.b * 0.11 > 0.5 ? '#141414' : '#f4f4f4';
}

const geo = {
  ring: new THREE.RingGeometry(0.72, 0.9, 40).rotateX(-Math.PI / 2),
  base: new THREE.CylinderGeometry(0.55, 0.62, 0.12, 36).translate(0, 0.06, 0),
  crest: (() => {
    // A small shield, stitched flat onto the chest.
    const s = new THREE.Shape();
    s.moveTo(-0.022, 0.024);
    s.lineTo(0.022, 0.024);
    s.lineTo(0.022, 0.0);
    s.quadraticCurveTo(0.02, -0.018, 0, -0.028);
    s.quadraticCurveTo(-0.02, -0.018, -0.022, 0.0);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1, curveSegments: 6 });
  })(),
};
/** Until the character bundle is in, a figure's body draws nothing. */
const EMPTY = new THREE.BufferGeometry();
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

const mats = new Map<string, THREE.MeshPhysicalMaterial>();
function gloss(color: string, metal = false) {
  const key = `${color}|${metal}`;
  let m = mats.get(key);
  if (!m) {
    m = metal
      ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 1, clearcoat: 0.6 })
      : new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    mats.set(key, m);
  }
  return m;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Builds wait their turn, one a frame, so a squad filling in never stalls the page. */
const builds: (() => void)[] = [];
let pumping = false;
function queueBuild(fn: () => void) {
  builds.push(fn);
  if (pumping) return;
  pumping = true;
  const step = () => {
    const t = performance.now();
    // A few per frame when they're quick (shared textures already painted).
    while (builds.length && performance.now() - t < 12) builds.shift()!();
    if (builds.length) requestAnimationFrame(step);
    else pumping = false;
  };
  requestAnimationFrame(step);
}


/**
 * Training pose names → clip, and where in the 0..1 progress the contact sits.
 * The drill dive stays hand-made: it springs back to the spot where the drill expects the keeper.
 */
const SCRUB: Record<string, [string, number]> = { kick: ['shot', 0.45], slide: ['slide', 0.3], dive: ['ph:dive', 0.45], header: ['header', 0.5] };

const tmpScale = new THREE.Vector3();
const tmpOff = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/** Where a timed action should meet the ball. */
export interface ActAim {
  /** The ball's position at contact (world, y up). */
  ball: THREE.Vector3;
  /** The player's ground position at contact (world x, z) and facing then. */
  x: number;
  z: number;
  heading: number;
}

export type { ActionKind, ActOpts };

export class Figure {
  root = new THREE.Group();
  /** Holds the skinned body; leans with acceleration. */
  body = new THREE.Group();
  /** Local velocity (m/s): forward and to the player's left. Set by the match viewer. */
  fwd = 0;
  side = 0;
  /** Lean from acceleration (radians), forward and into turns. */
  leanX = 0;
  leanZ = 0;
  ring: THREE.Mesh;
  pos = new THREE.Vector2();
  vel = new THREE.Vector2();
  heading = 0;
  visible = true;
  celebrate = 0;
  celStyle = '';
  /** Team-mates celebrate their own way: some jump for joy, some cheer. */
  private jumper = false;
  /** True for the goalscorer, who does their own celebration. */
  star = false;
  /** One-shot training pose held at progress `poseK` (0..1; juggling counts beats). */
  pose: '' | 'kick' | 'juggle' | 'slide' | 'dive' | 'header' = '';
  poseK = 0;
  poseSide = 1;
  /** A heading the match viewer holds the player to until game time `faceUntil` (lining up a strike). */
  faceTo: number | null = null;
  faceUntil = 0;
  /** A world point the head and chest turn toward (usually the ball). */
  look: THREE.Vector3 | null = null;
  readonly keeper: boolean;
  readonly bones: THREE.Bone[];
  private anim: Animator;
  private skin: THREE.SkinnedMesh;
  private kit: Kit;
  private gkKit: Kit;
  private eq: Equipped | undefined;
  private number: number | undefined;
  private detail: Detail;
  /** Off the pitch: his own clothes instead of the kit. */
  private casual: boolean;
  /** A match official: plain shirt, no number or crest. */
  private official: boolean;
  /** What dress() last added to the bones, to take off on a restyle. */
  private parts: THREE.Object3D[] = [];
  private styleRun = 0;
  /** Resolves once he is built and dressed. */
  readonly ready: Promise<void>;
  private markReady = () => {};
  /** Between the eyes, in bind space (refined once the body is built). */
  private eyeAt = new THREE.Vector3(0, 1.907, 0.1);
  /** Body height above the root: on a base, or standing on the grass. */
  private lift: number;
  /**
   * The body's offset from the root, in world metres: `carry` is travel an
   * action took it on (a dive) that eases back to the player's spot, `reach`
   * is the small step that puts the foot, head or hands on the ball at contact.
   */
  private carry = new THREE.Vector3();
  private reach = new THREE.Vector3();
  private reachT = 0;
  private reachLead = 0;
  private reachOn = false;
  /** The reach shown last frame, and what was left of it when a new action took over (eases out). */
  private reached = new THREE.Vector3();
  private reachRest = new THREE.Vector3();
  /** Height the body rises to meet the ball (a keeper's dive or jump), metres. */
  private reachY = 0;
  /** Keeper saves keep their reach: he lands where he stretched to and walks back from there. */
  private reachKeep = false;
  /** Standing on a stand that turns (the kit turntable): his feet turn with it. */
  onStand = false;
  /** A keeper with the ball in his hands. Set by the match viewer. */
  hold = false;

  constructor(kit: Kit, look: Appearance, isKeeper: boolean, gkKit: Kit, eq?: Equipped, opts: { base?: boolean; number?: number; scale?: number; detail?: Detail; sync?: boolean; seed?: number; casual?: boolean; official?: boolean } = {}) {
    loadMocap(`${import.meta.env.BASE_URL}anims/mocap.json`);
    // Older and bot looks may lack newer features; fill them in consistently.
    const app = sanitizeAppearance(look);
    const withBase = opts.base !== false;
    this.keeper = isKeeper;
    this.lift = withBase ? 0.12 : 0;
    const g = gear(eq);
    this.celStyle = g.celebration?.style ?? '';
    const k = isKeeper ? gkKit : kit;
    this.kit = kit;
    this.gkKit = gkKit;
    this.eq = eq;
    this.number = opts.number;
    this.casual = !!opts.casual;
    this.official = !!opts.official;
    // Base (team-coloured puck) and a selection ring.
    if (withBase) {
      const base = new THREE.Mesh(geo.base, gloss(k.secondary));
      base.castShadow = base.receiveShadow = true;
      this.root.add(base);
    }
    this.ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: 0xc6ff3d, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.position.y = 0.03;
    this.root.add(this.ring);

    // One skinned mesh for the whole player, bound with the arms lowered. It fills in once
    // the character bundle has loaded and its turn to build comes.
    this.bones = makeBones();
    setBindPose(this.bones);
    const mesh = new THREE.SkinnedMesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>(EMPTY, HIDDEN);
    mesh.add(this.bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    this.skin = mesh;
    // Dives and slides reach well beyond the standing pose.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 2.6);
    mesh.castShadow = true;
    this.body.position.y = this.lift;
    this.body.add(mesh);
    this.root.add(this.body);
    const scale = opts.scale ?? LIFE_SCALE;
    this.detail = opts.detail ?? (scale > LIFE_SCALE ? 'mid' : 'low');
    const ck = this.kitFor(app);
    this.ready = new Promise((r) => (this.markReady = r));
    // A restyle that came in first has the newer look.
    const build = () => {
      if (!this.styleRun) this.dress(app, ck);
    };
    if (opts.sync) whenCharacterReady(build);
    // Textures paint on a worker first, so the build itself is quick.
    else whenCharacterReady(() => queueBuild(() => void prepareCharacter(app, isKeeper, ck, this.detail).then(() => queueBuild(build))));
    // Who he is decides how he moves: the same player carries himself the same way every match.
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.anim = new Animator(this.bones, this.root, seed);
    this.jumper = seeded(seed ^ 0x5bd1e995)() < 0.4;
    this.root.scale.setScalar(scale);
  }


  /** What the character wears for a look: the kit, with his boots and accessories. */
  private kitFor(app: Appearance): CharacterKit {
    const isKeeper = this.keeper;
    const g = gear(this.eq);
    if (this.casual) return casualKit(app, this.eq, this.kit);
    const k = isKeeper ? this.gkKit : this.kit;
    const boot = g.boots?.c1 ?? BOOT_COLORS[app.boots] ?? BOOT_COLORS[0];
    const pattern = isKeeper || this.official ? 'plain' : kitPattern(this.kit);
    return {
      primary: k.primary,
      secondary: k.secondary,
      shorts: isKeeper ? '#1b1d21' : k.secondary,
      pattern,
      boot,
      bootAccent: g.boots?.c2 ?? contrast(boot),
      sole: g.boots?.c2 ?? mix(boot, '#101010', 0.55),
      glove: '#eef2f4',
      wrist: g.sweat ? g.sweat.c1 ?? k.secondary : app.accessory === 3 ? k.secondary : null,
      band: g.band ? g.band.c1 ?? k.secondary : app.accessory === 1 ? k.secondary : null,
      earring: app.accessory === 2,
      number: this.number,
      numberColor: isKeeper ? '#111111' : contrast(k.primary) === '#141414' && pattern === 'plain' ? k.secondary : contrast(k.primary),
      cut: isKeeper ? KEEPER_CUT : KIT_CUT,
    };
  }

  /** Builds the character into the skinned mesh, replacing whatever it wore before. */
  private dress(app: Appearance, ck: CharacterKit) {
    const isKeeper = this.keeper;
    const mesh = this.skin;
    const g = gear(this.eq);
    const k = isKeeper ? this.gkKit : this.kit;
    const ch = buildCharacter(app, isKeeper, ck, this.detail);
    for (const o of this.parts.splice(0)) o.removeFromParent();
    mesh.geometry = ch.geometry;
    mesh.material = ch.materials;
    this.bones[B.Head].add(ch.head);
    this.parts.push(ch.head);
    this.eyeAt.set(0, ch.body.headC.y, ch.body.headC.z + 0.075);
    // Kit extras ride on the chest and neck bones, placed from the fitted body.
    const toBone = (b: number, o: THREE.Object3D) => {
      o.applyMatrix4(mesh.skeleton.boneInverses[b]);
      o.castShadow = true;
      this.bones[b].add(o);
      this.parts.push(o);
    };
    if (this.casual) {
      // Chains, wrists and a hood, draped over his own clothes.
      const hi = this.detail !== 'low';
      const cas = ck.casual!;
      const top = cas.top;
      // Modelled shoes, skinned to the feet.
      const sh = cas.shoes;
      const piece = { style: sh.style, print: sh.print ?? '', c1: linear(sh.c1), c2: linear(sh.c2), c3: linear(sh.c3) };
      const shoeGeo = buildShoes(piece, linear(cas.sock), ch.body, ck.cut, JSON.stringify([ch.body.feet[0].z0, ch.body.feet[0].x1[3], ch.body.feet[1].x0[3], sh, cas.sock, ck.cut.sole, ck.cut.shoe]), hi);
      const shoes = new THREE.SkinnedMesh(shoeGeo, shoeMaterial(sh.style, !!g.shoes?.metal));
      shoes.bind(mesh.skeleton, mesh.bindMatrix);
      shoes.castShadow = true;
      shoes.frustumCulled = false;
      this.body.add(shoes);
      this.parts.push(shoes);
      if (top.style === 'hoodie') toBone(B.Spine2, buildHood(top.c1, ch.body, hi));
      const neck = g.neck ?? (app.accessory === 4 ? ITEM_BY_ID['neck-chain-gold'] : undefined);
      if (neck) toBone(B.Spine2, buildNeckwear(neck.style ?? 'chain', neck.c1 ?? '#ffcf3d', neck.c2, ch.body, hi));
      const w = g.wrist;
      if (w) {
        // Watches go on the left wrist, bracelets on the right.
        const watch = /watch/.test(w.style ?? '');
        const side = watch ? 0 : 1;
        toBone(side ? B.RightForeArm : B.LeftForeArm, buildWristwear(w.style ?? 'cuff', w.c1 ?? '#ffcf3d', w.c2, ch.body, side, 0, hi));
      }
    } else if (!isKeeper && !this.official) {
      const crest = new THREE.Mesh(geo.crest, gloss(k.secondary));
      crest.position.copy(ch.body.crestAt);
      toBone(B.Spine2, crest);
    }
    this.markReady();
  }

  /**
   * Changes his look in place, keeping his pose and motion. Anything new to
   * paint is painted off the main thread first; until then he keeps his old look.
   */
  restyle(look: Appearance): Promise<void> {
    const app = sanitizeAppearance(look);
    const ck = this.kitFor(app);
    const run = ++this.styleRun;
    return new Promise((done) => whenCharacterReady(() => {
      void prepareCharacter(app, this.keeper, ck, this.detail).then(() => {
        if (run === this.styleRun) this.dress(app, ck);
        done();
      });
    }));
  }

  /**
   * Plays a one-shot action (kick, trap, header, tackle, keeper set, dive,
   * catch…), warped so its contact lands `contactIn` real seconds from now.
   * `side` -1 is the left foot, or a dive to the player's right.
   */
  act(kind: ActionKind, opts?: ActOpts, aim?: ActAim) {
    const eff = this.anim.act(kind, opts);
    // A new action never snaps the body off the step the last one took toward the ball.
    this.reachRest.copy(this.reached);
    this.reachOn = false;
    if (!eff || !aim) return;
    // Where that body part will be at contact, if the player is where the game puts him.
    const s = this.root.scale.x;
    tmpQ.setFromAxisAngle(UP, aim.heading);
    eff.multiplyScalar(s).applyQuaternion(tmpQ);
    this.reach.set(aim.ball.x - aim.x - eff.x, 0, aim.ball.z - aim.z - eff.z);
    // Only small corrections: a gap wider than a stride (a keeper's extra lunge) is the play's, not the animation's.
    const save = KEEPER_SAVES.has(kind);
    const len = this.reach.length();
    const most = kind === 'dive' || kind === 'diveHigh' ? 1.6 : save ? 1.1 : 0.9;
    if (len > most) this.reach.multiplyScalar(most / len);
    // Keepers also rise to a high ball (a spring in the dive, a jump for the catch), or get down to a low one.
    this.reachY = save ? Math.max(-0.25, Math.min(0.75, aim.ball.y - (eff.y + this.lift * s))) : 0;
    this.reachKeep = save;
    this.reachLead = Math.max(0.2, opts?.contactIn ?? 0.3);
    this.reachT = opts?.contactIn ?? 0;
    this.reachOn = true;
  }

  get acting() {
    return this.anim.acting;
  }

  /** Mid-dive, mid-slide or on the ground: the body can't turn. */
  get committed() {
    return this.anim.committed;
  }

  /** Put straight onto a new spot (a reset between phases): whatever he was doing ends there. */
  teleport(heading: number) {
    this.anim.reset();
    this.carry.set(0, 0, 0);
    this.reachOn = false;
    this.reachRest.set(0, 0, 0);
    this.reached.set(0, 0, 0);
    this.faceTo = null;
    this.heading = heading;
  }

  /**
   * Where bone `b` will be in the world at clip time `t` of an action, if he
   * plays it from where he stands now (for putting the ball on a knee or a foot).
   */
  partAt(kind: ActionKind, b: number, t: number, side: 1 | -1 = 1) {
    const p = this.anim.pointOf(kind, b, t, side);
    p.y += this.lift;
    return this.root.localToWorld(p);
  }

  /** Length of an action's clip, seconds. */
  actLength(kind: ActionKind, side: 1 | -1 = 1) {
    return this.anim.lengthOf(kind, side);
  }

  // ---- Moving under its own steam (training, the house) ----
  private lastPos = new THREE.Vector3();
  private hasLastPos = false;
  private path: { x: number; z: number }[] = [];
  private arrive: (() => void) | null = null;
  private walkV = 0;
  private walkTop = 1.4;

  /**
   * Reads how far the root moved since the last call and sets the gait to
   * match (speed, forward and sideways), so whatever moves the player, the
   * feet keep pace with the ground. Returns the speed in m/s for `animate`.
   */
  follow(dt: number) {
    const p = this.root.position;
    let speed = 0;
    if (this.hasLastPos && dt > 0) {
      const vx = (p.x - this.lastPos.x) / dt;
      const vz = (p.z - this.lastPos.z) / dt;
      const h = this.root.rotation.y;
      // Teleports (a reset between reps) are not running.
      if (Math.hypot(vx, vz) < 14) {
        this.fwd = vx * Math.sin(h) + vz * Math.cos(h);
        this.side = vx * Math.cos(h) - vz * Math.sin(h);
        speed = Math.hypot(vx, vz);
      } else this.fwd = this.side = 0;
    }
    this.lastPos.copy(p);
    this.hasLastPos = true;
    return speed;
  }

  /**
   * Walks through `points` (world x/z, metres) and calls `onArrive` at the last
   * one. He turns on the spot first if the way is well behind him, rounds the
   * corners on the way, and slows to a stop. `speed` is the walking pace in m/s.
   */
  walkPath(points: { x: number; z: number }[], onArrive?: () => void, speed = 1.4) {
    this.path = points.slice();
    this.faceTarget = null;
    this.arrive = onArrive ?? null;
    this.walkTop = speed;
  }

  walkTo(x: number, z: number, onArrive?: () => void, speed = 1.4) {
    this.walkPath([{ x, z }], onArrive, speed);
  }

  /** Turns on the spot to face `heading` (radians), with a proper turning step when it's a big turn. */
  turnTo(heading: number) {
    this.faceTarget = heading;
  }

  /** Still walking or turning to face somewhere. */
  get busyMoving() {
    return this.path.length > 0 || this.faceTarget !== null;
  }

  private faceTarget: number | null = null;

  /** Stops where he is (no arrive call). */
  stopWalk() {
    this.path.length = 0;
    this.arrive = null;
  }

  get walking() {
    return this.path.length > 0;
  }

  /**
   * Advances a walk started with walkPath. Call once a frame before `animate`,
   * and pass the speed it returns to `animate`.
   */
  stepWalk(dt: number): number {
    const p = this.root.position;
    if (!this.path.length) {
      this.walkV = 0;
      if (this.faceTarget !== null && !this.anim.acting) {
        let turn = this.faceTarget - this.root.rotation.y;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        if (Math.abs(turn) > 1.1) this.act(turn > 0 ? (turn > 2.3 ? 'turnL' : 'turnL90') : turn < -2.3 ? 'turnR' : 'turnR90');
        else if (Math.abs(turn) < 0.02) this.faceTarget = null;
        else this.root.rotation.y += Math.max(-4 * dt, Math.min(4 * dt, turn));
        this.heading = this.root.rotation.y;
      }
      return this.follow(dt);
    }
    // Mid-turn on the spot: the clip turns him.
    if (this.anim.acting) return this.follow(dt);
    const next = this.path[0];
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const d = Math.hypot(dx, dz);
    let rest = d;
    for (let k = 1; k < this.path.length; k++) rest += Math.hypot(this.path[k].x - this.path[k - 1].x, this.path[k].z - this.path[k - 1].z);
    const last = this.path.length === 1;
    if (last && d < 0.04) {
      this.path.length = 0;
      this.walkV = 0;
      const cb = this.arrive;
      this.arrive = null;
      cb?.();
      return this.follow(dt);
    }
    if (!last && d < Math.max(0.3, this.walkV * 0.45)) {
      this.path.shift();
      return this.stepWalk(dt);
    }
    let turn = Math.atan2(dx, dz) - this.root.rotation.y;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    // Standing and the way is well round: a proper turn on the spot first.
    if (this.walkV < 0.3 && Math.abs(turn) > 1.1 && d > 0.6) {
      const big = Math.abs(turn) > 2.3;
      this.act(turn > 0 ? (big ? 'turnL' : 'turnL90') : big ? 'turnR' : 'turnR90');
      return this.follow(dt);
    }
    // Round the corner, easing into the new line.
    const rate = 3.2 + (this.walkV < 0.5 ? 2 : 0);
    const step = Math.max(-rate * dt, Math.min(rate * dt, turn));
    this.root.rotation.y += step;
    this.heading = this.root.rotation.y;
    // Speed: build up, and brake in time to stop on the spot.
    const want = Math.min(this.walkTop, Math.sqrt(2 * 1.6 * rest)) * Math.max(0.25, Math.cos(turn));
    this.walkV += Math.max(-2.5 * dt, Math.min(1.8 * dt, want - this.walkV));
    const v = Math.min(this.walkV, d / Math.max(dt, 1e-3));
    if (last && d < 0.5) {
      // The last half metre goes straight onto the spot.
      p.x += (dx / d) * v * dt;
      p.z += (dz / d) * v * dt;
    } else {
      p.x += Math.sin(this.root.rotation.y) * v * dt;
      p.z += Math.cos(this.root.rotation.y) * v * dt;
    }
    return this.follow(dt);
  }

  /** Seconds an action takes from its start to the moment it meets the ball, at natural speed. */
  contactTime(kind: ActionKind, side: 1 | -1 = 1) {
    return this.anim.contactOf(kind, side);
  }

  /** Advances the animation. `speed` in m/s. */
  /** The point between the eyes in world space, as posed now (to frame close-ups on). */
  eyes(out: THREE.Vector3) {
    this.root.updateMatrixWorld(true);
    return out.copy(this.eyeAt).applyMatrix4(this.skin.skeleton.boneInverses[B.Head]).applyMatrix4(this.bones[B.Head].matrixWorld);
  }

  animate(dt: number, speed: number, _time = 0) {
    this.body.position.y = this.lift;
    this.body.rotation.set(this.leanX, 0, this.leanZ);
    let scrub: AnimInput['scrub'] = null;
    if (this.pose === 'juggle') {
      scrub = { name: 'juggle', t: (((this.poseK / 2) % 1) + 1) % 1, mirror: false };
    } else if (this.pose) {
      const [name, at] = SCRUB[this.pose];
      const clip = getClip(name, this.pose === 'dive' && this.poseSide < 0);
      const dur = duration(clip);
      const c = clip.contact ?? dur * 0.4;
      const k = Math.min(1, Math.max(0, this.poseK));
      scrub = { name, t: k < at ? (k / at) * c : c + ((k - at) / (1 - at)) * (dur - c), mirror: this.pose === 'dive' && this.poseSide < 0 };
    }
    // Walking back after a dive: the body's way home drives the legs.
    let fwd = this.fwd;
    let side = this.side;
    let speed2 = speed;
    if (!this.anim.acting && this.carry.lengthSq() > 0.01) {
      const vx = -this.carry.x / CARRY_T;
      const vz = -this.carry.z / CARRY_T;
      const h = this.root.rotation.y;
      fwd += vx * Math.sin(h) + vz * Math.cos(h);
      side += vx * Math.cos(h) - vz * Math.sin(h);
      speed2 = Math.hypot(fwd, side);
    }
    let cel: string | null = null;
    if (this.celebrate > 0) {
      const style = this.star && this.celStyle ? `cel_${this.celStyle}` : this.jumper && hasClip('jump') ? 'jump' : 'cel_cheer';
      cel = hasClip(style) ? style : 'cel_cheer';
    }
    this.root.getWorldScale(tmpScale);
    this.anim.update(dt, {
      speed: speed2,
      fwd,
      side,
      scale: tmpScale.x,
      keeper: this.keeper,
      celebrate: cel,
      scrub,
      look: this.look,
      lift: this.lift,
      hold: this.hold,
      onStand: this.onStand,
    });
    const sh = this.anim.shift;
    if (sh.lengthSq() > 0) {
      // Keep the body where an action's travel (a dive) took it, then ease it back once it's up.
      sh.applyQuaternion(this.root.quaternion).multiplyScalar(this.root.scale.x);
      this.carry.add(sh);
      sh.set(0, 0, 0);
    }
    if (this.anim.shiftYaw) {
      // He now faces where the action turned him (a turn on the spot, landing from a dive or a scissor kick).
      this.heading += this.anim.shiftYaw;
      this.root.rotation.y += this.anim.shiftYaw;
      this.root.updateMatrixWorld();
      this.anim.shiftYaw = 0;
    }
    if (!this.anim.acting && this.carry.lengthSq() > 1e-6) this.carry.multiplyScalar(Math.exp(-dt / CARRY_T));
    tmpOff.copy(this.carry);
    let up = 0;
    if (this.reachOn) {
      this.reachT -= dt;
      // Step into it on the way to contact, then let go (a keeper keeps the ground he covered).
      const into = smoothstep(0, 1, 1 - this.reachT / this.reachLead);
      const out = 1 - smoothstep(0, 1, -this.reachT / 0.45);
      if (this.reachT > 0) {
        tmpOff.addScaledVector(this.reach, into);
        up = this.reachY * into;
      } else if (this.reachKeep) {
        this.carry.add(this.reach);
        tmpOff.add(this.reach);
        this.reach.set(0, 0, 0);
        this.reachKeep = false;
      } else tmpOff.addScaledVector(this.reach, out);
      if (this.reachT <= 0) up = this.reachY * out;
      if (this.reachT < -0.45) this.reachOn = false;
    }
    this.reached.set(tmpOff.x - this.carry.x, up, tmpOff.z - this.carry.z);
    if (this.reachRest.lengthSq() > 1e-6) {
      this.reachRest.multiplyScalar(Math.exp(-dt / 0.15));
      this.reached.add(this.reachRest);
      tmpOff.x += this.reachRest.x;
      tmpOff.z += this.reachRest.z;
      up += this.reachRest.y;
    }
    // Into the root's own frame.
    tmpOff.y = up;
    tmpOff.applyQuaternion(tmpQ.copy(this.root.quaternion).invert()).divideScalar(this.root.scale.x || 1);
    this.body.position.set(tmpOff.x, this.lift + tmpOff.y, tmpOff.z);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
/** Seconds for a keeper to walk back to his spot after a dive (time constant). */
const CARRY_T = 0.8;
const KEEPER_SAVES = new Set<ActionKind>(['dive', 'diveHigh', 'catch', 'keeperGather', 'keeperScoop', 'keeperHigh']);

export const GK_KITS: Kit[] = [
  { primary: '#ffb020', secondary: '#1b1b1b' },
  { primary: '#3dd6ff', secondary: '#0b2540' },
];

/** A chain, snood or medal round the neck, in bind space. */

/** Pieces worn when nothing is equipped in a casual slot. */
const CASUAL_DEFAULTS = { top: 'outfit-tee', bottom: 'bot-joggers-black', shoes: 'shoe-court-white' } as const;

/** What he wears off the pitch: his equipped clothes and accessories, or plain basics. */
function casualKit(app: Appearance, eq: Equipped | undefined, kit: Kit): CharacterKit {
  const g = gear(eq);
  const pick = (s: 'top' | 'bottom' | 'shoes'): Item => g[s] ?? ITEM_BY_ID[CASUAL_DEFAULTS[s]];
  const top = pick('top'), bottom = pick('bottom'), shoes = pick('shoes');
  const piece = (it: Item) => ({ style: it.style ?? 'tee', print: it.print, c1: it.c1 ?? '#888888', c2: it.c2 ?? it.c1 ?? '#888888', c3: it.c3 ?? it.c2 ?? it.c1 ?? '#888888' });
  const cut = casualCut({ top: top.style ?? 'tee', bottom: bottom.style ?? 'joggers', shoes: shoes.style ?? 'court' });
  const dark = shoes.style === 'loafer' || bottom.style === 'suit';
  return {
    primary: kit.primary,
    secondary: kit.secondary,
    shorts: bottom.c1 ?? '#222222',
    pattern: 'plain',
    boot: shoes.c1 ?? '#f4f4f0',
    bootAccent: shoes.c2 ?? '#888888',
    sole: shoes.c3 ?? '#f4f4f0',
    glove: '#eef2f4',
    wrist: null,
    band: null,
    earring: app.accessory === 2,
    numberColor: '#ffffff',
    cut,
    casual: { top: piece(top), bottom: piece(bottom), shoes: piece(shoes), sock: dark ? '#16181b' : shoes.style === 'slide' ? shoes.c2 ?? '#f4f4f0' : '#eeeeea' },
    hat: g.head ? { style: g.head.style ?? 'cap', c1: g.head.c1 ?? '#222222', c2: g.head.c2 ?? g.head.c1 ?? '#222222', print: g.head.print, metal: g.head.metal } : null,
    glasses: g.eyes ? { style: g.eyes.style ?? 'round', c1: g.eyes.c1 ?? '#222222', c2: g.eyes.c2 ?? '#222222', metal: g.eyes.metal } : null,
  };
}
