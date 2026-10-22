// The 3D match renderer. Owns the three.js scene, post-processing stack and
// camera director; the page drives it with a clock value each frame.
import * as THREE from 'three';
import type { Equipped } from '../../shared/cosmetics.ts';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { sanitizeAppearance } from '../../shared/appearance.ts';
import type { Tactics } from '../../shared/formations.ts';
import type { MatchEvent } from '../../shared/sim/types.ts';
import { type ActionKind, Figure, GK_KITS, type Kit } from './figures.ts';
import { Playback } from './playback.ts';
import type { Track } from '../../shared/sim/tracks.ts';
import { buildStadium, PL, PW, type Stadium } from './stadium.ts';

export type CameraMode = 'broadcast' | 'tactical' | 'orbit';
export type Quality = 'high' | 'low';

export interface ViewerTeam {
  name: string;
  short: string;
  colors: Kit;
  formation: string;
  tactics: Tactics;
  players: { name: string; number: number; app: Record<string, number>; eq?: Equipped }[];
}

export interface ViewerOptions {
  night: boolean;
  quality?: Quality;
  crowd?: number;
}

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.32 }, uSat: { value: 1.08 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; uniform float uSat; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * uStrength * 2.2; c.rgb *= v; gl_FragColor = c; }`,
};

export function defaultQuality(): Quality {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  return coarse || small ? 'low' : 'high';
}

export class MatchViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private gtao?: GTAOPass;
  private bloom!: UnrealBloomPass;
  private controls?: OrbitControls;
  private stadium: Stadium;
  private sun: THREE.DirectionalLight;
  private figures: Figure[] = [];
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private trail: THREE.Mesh;
  private trailPts: THREE.Vector3[] = [];
  private confetti?: THREE.InstancedMesh;
  private confettiState: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; c: THREE.Color }[] = [];
  private labelSprite: THREE.Sprite;
  private labelCanvas = document.createElement('canvas');
  private labelFor = -2;
  private playback: Playback;
  private teams: [ViewerTeam, ViewerTeam];
  private resizeObs: ResizeObserver;
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3(0, 22, 50);
  private lastClock = -1;
  private lastTime = performance.now();
  private elapsed = 0;
  private excitement = 0;
  private shake = 0;
  private disposed = false;
  private first = true;
  mode: CameraMode = 'broadcast';
  quality: Quality;
  private container: HTMLElement;

  constructor(container: HTMLElement, teams: [ViewerTeam, ViewerTeam], halftimeAt: number, opts: ViewerOptions) {
    this.container = container;
    this.teams = teams;
    this.halftimeAt = halftimeAt;
    this.quality = opts.quality ?? defaultQuality();
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.25));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = opts.night ? 0.95 : 0.9;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 1200);

    // Image-based lighting for the glossy plastic look.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = opts.night ? 0.3 : 0.4;
    pmrem.dispose();
    this.scene.fog = new THREE.Fog(opts.night ? 0x070b16 : 0xb8d4ec, 180, 560);

    // Key light: the sun by day, the floodlight rig by night.
    this.sun = new THREE.DirectionalLight(opts.night ? 0xeef4ff : 0xffeacc, opts.night ? 2.0 : 2.4);
    // By day the sun sits low behind the camera-side roof, so its shadow falls
    // across the near touchline like a real afternoon broadcast.
    if (opts.night) this.sun.position.set(18, 90, 30).multiplyScalar(1.6);
    else this.sun.position.set(-40, 55, 60).multiplyScalar(1.6);
    this.sun.castShadow = true;
    const sz = this.quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera;
    sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 5; sc.far = 340;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    if (opts.night) {
      // Secondary floodlight fill from the opposite corner (no shadow).
      const fill = new THREE.DirectionalLight(0xfff4e2, 1.0);
      fill.position.set(-30, 60, -40);
      this.scene.add(fill);
    }
    this.scene.add(new THREE.HemisphereLight(opts.night ? 0x3a4a78 : 0xbfdcff, opts.night ? 0x0e1a0c : 0x2a4a22, opts.night ? 0.45 : 0.55));

    this.stadium = buildStadium({
      night: opts.night,
      home: teams[0].colors,
      away: teams[1].colors,
      homeName: teams[0].name,
      awayName: teams[1].name,
      homeShort: teams[0].short,
      awayShort: teams[1].short,
      crowd: opts.crowd ?? (this.quality === 'high' ? 13000 : 5000),
    });
    this.scene.add(this.stadium.group);

    // Players. Away team switches to its secondary kit if colours clash.
    const awayKit = clash(teams[0].colors.primary, teams[1].colors.primary) ? { primary: teams[1].colors.secondary, secondary: teams[1].colors.primary } : teams[1].colors;
    const kits: [Kit, Kit] = [teams[0].colors, awayKit];
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < 11; k++) {
        const p = teams[side].players[k];
        const f = new Figure(kits[side], sanitizeAppearance(p?.app), k === 0, GK_KITS[side], p?.eq, { base: false, number: p?.number });
        this.figures.push(f);
        this.scene.add(f.root);
      }
    }

    // Ball.
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 20), new THREE.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    this.trail = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xc6ff3d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);

    // Name tag above the ball carrier.
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 96;
    const lt = new THREE.CanvasTexture(this.labelCanvas);
    lt.colorSpace = THREE.SRGBColorSpace;
    this.labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, depthTest: false, transparent: true }));
    this.labelSprite.scale.set(6.4, 1.2, 1);
    this.labelSprite.renderOrder = 10;
    this.scene.add(this.labelSprite);

    this.playback = new Playback([teams[0], teams[1]], halftimeAt);
    this.buildComposer(opts.night);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    // Start roughly at kick-off framing.
    this.camTarget.set(0, 0, 0);
  }

  private buildComposer(night: boolean) {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 450;
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality === 'high') {
      this.gtao = new GTAOPass(this.scene, this.camera, w, h);
      this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.6, thickness: 1.2, scale: 1.25, samples: 16 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), night ? 0.55 : 0.22, 0.6, night ? 0.82 : 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(VignetteShader));
    if (this.quality === 'high') this.composer.addPass(new SMAAPass());
  }

  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.25));
    this.sun.shadow.mapSize.set(q === 'high' ? 4096 : 2048, q === 'high' ? 4096 : 2048);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.composer.dispose();
    this.gtao?.dispose();
    this.gtao = undefined;
    this.buildComposer(this.scene.environmentIntensity < 0.5);
    this.resize();
  }

  setMode(m: CameraMode) {
    this.mode = m;
    if (m === 'orbit') {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.copy(this.camTarget);
      this.controls.enableDamping = true;
      this.controls.maxPolarAngle = Math.PI * 0.47;
      this.controls.minDistance = 8;
      this.controls.maxDistance = 160;
    } else if (this.controls) {
      this.controls.dispose();
      this.controls = undefined;
    }
  }

  setTracks(tracks: Track[]) {
    this.playback.setTracks(tracks);
  }

  setEvents(events: MatchEvent[]) {
    this.playback.setEvents(events);
    this.goals = events.filter((e) => e.k === 'goal');
    this.fullTimeAt = events.find((e) => e.k === 'fulltime')?.t ?? Infinity;
  }

  private goals: MatchEvent[] = [];
  private fullTimeAt = Infinity;
  private halftimeAt: number;

  /** Score and minute for the stadium's big screens. */
  private updateScoreboard(t: number) {
    let sc: [number, number] = [0, 0];
    for (const g of this.goals) if (g.t <= t && g.sc) sc = g.sc;
    const ht = this.halftimeAt;
    const min = t < ht ? Math.min(45, Math.floor(t / 60) + 1) : Math.min(90, 45 + Math.floor((t - ht) / 60) + 1);
    const label = t <= 0 ? 'KICK-OFF' : Math.abs(t - ht) < 1 ? 'HALF-TIME' : t >= this.fullTimeAt ? 'FULL-TIME' : `${min}'`;
    this.stadium.setScoreboard(sc[0], sc[1], label);
  }

  /** Celebration burst + crowd roar. */
  goal(side: 0 | 1) {
    this.excitement = 1;
    this.shake = 0.6;
    this.stadium.setCheer(side);
    const kit = this.teams[side].colors;
    this.spawnConfetti(side, [kit.primary, kit.secondary, '#c6ff3d']);
  }

  private spawnConfetti(side: 0 | 1, colors: string[]) {
    const n = this.quality === 'high' ? 700 : 260;
    if (!this.confetti) {
      const g = new THREE.PlaneGeometry(0.35, 0.22);
      this.confetti = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 700);
      this.confetti.frustumCulled = false;
      this.scene.add(this.confetti);
    }
    this.confettiState = [];
    const x = (this.lastBallX >= 0 ? 1 : -1) * (PL / 2 + 6);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Color(colors[i % colors.length]);
      this.confettiState.push({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 10, 8 + Math.random() * 10, (Math.random() - 0.5) * 50),
        v: new THREE.Vector3(-Math.sign(x) * (4 + Math.random() * 8), 6 + Math.random() * 8, (Math.random() - 0.5) * 8),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        c,
      });
    }
    void side;
    this.confetti.count = n;
    this.confettiState.forEach((s, i) => this.confetti!.setColorAt(i, s.c));
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
  }

  private lastBallX = 0;

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Renders the match at game clock `t` (seconds). `rate` is game s per real s. */
  /** `draw` false updates the simulation without drawing, while something covers the pitch. */
  /** `snap` puts every player straight onto their spot (while a transition hides the pitch). */
  render(t: number, rate = 1, draw = true, snap = false) {
    if (this.disposed) return;
    const now = performance.now();
    const realDt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += realDt;
    let gameDt = this.lastClock < 0 ? 0 : t - this.lastClock;
    const jumped = gameDt < -0.5 || gameDt > 30 || this.first || snap;
    this.first = false;
    if (gameDt < 0 || gameDt > 30) gameDt = 0;
    this.lastClock = t;

    const fr = this.playback.frame(t);
    // Ball.
    this.ball.position.set(fr.ball.x, fr.ball.z + 0.18, fr.ball.y);
    const bv = new THREE.Vector2(fr.ball.x - this.lastBallX, 0);
    this.ball.rotation.z -= bv.x * 0.9;
    this.ball.rotation.x += gameDt * 2;
    this.lastBallX = fr.ball.x;
    this.ballShadow.position.set(fr.ball.x, 0.02, fr.ball.y);
    const sh = Math.max(0.15, 1 - fr.ball.z / 8);
    this.ballShadow.scale.setScalar(0.7 + (1 - sh) * 1.5);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = 0.35 * sh;
    this.updateTrail(fr.phase === 'flight' && rate < 6, jumped);

    // Players: steered bodies with acceleration limits, arrival, separation and ball-watching.
    if (jumped) this.fired.clear();
    if (fr.tracked && fr.vel) {
      // Recorded motion: bodies are exactly where the engine had them.
      for (let i = 0; i < 22; i++) {
        const f = this.figures[i];
        const v = fr.vel[i];
        const ax = gameDt > 0 ? (v.x - f.vel.x) / Math.max(gameDt, 1e-3) : 0;
        const ay = gameDt > 0 ? (v.y - f.vel.y) / Math.max(gameDt, 1e-3) : 0;
        this.accel[i].x += (Math.max(-12, Math.min(12, ax)) - this.accel[i].x) * 0.2;
        this.accel[i].y += (Math.max(-12, Math.min(12, ay)) - this.accel[i].y) * 0.2;
        f.pos.set(fr.targets[i].x, fr.targets[i].y);
        f.vel.set(v.x, v.y);
      }
      this.trackedActions(fr, t, rate);
    } else {
      this.steer(fr, Math.max(0, gameDt), jumped, rate);
      this.triggerActions(fr, t, rate);
    }
    for (let i = 0; i < 22; i++) {
      const f = this.figures[i];
      if (fr.sentOff[i]) {
        f.root.visible = false;
        continue;
      }
      f.root.visible = true;
      const speed = gameDt > 0 ? f.vel.length() / Math.max(1, Math.pow(rate, 0.85)) : 0;
      const toBall = Math.atan2(fr.ball.x - f.pos.x, fr.ball.y - f.pos.y);
      const velAng = Math.atan2(f.vel.x, f.vel.y);
      let face: number;
      if (i === fr.holder && fr.aim && speed < 3) face = Math.atan2(fr.aim.x - f.pos.x, fr.aim.y - f.pos.y);
      else if (speed > 2.6) {
        // Running: face the run, unless dropping back while watching the ball (backpedal).
        const away = Math.cos(velAng - toBall) < -0.25;
        face = away && speed < 5.5 && i !== fr.holder ? toBall : velAng;
      } else face = toBall;
      f.heading = lerpAngle(f.heading, face, Math.min(1, realDt * (speed > 5 ? 6 : 9)));
      f.root.position.set(f.pos.x, 0, f.pos.y);
      f.root.rotation.y = f.heading;
      // Local velocity and lean for the animation rig.
      const sh = Math.sin(f.heading);
      const ch = Math.cos(f.heading);
      const vs = speed / Math.max(0.001, f.vel.length());
      f.fwd = gameDt > 0 ? (f.vel.x * sh + f.vel.y * ch) * vs : 0;
      f.side = gameDt > 0 ? (f.vel.x * ch - f.vel.y * sh) * vs : 0;
      const acc = this.accel[i];
      f.leanX += (Math.max(-0.16, Math.min(0.16, (acc.x * sh + acc.y * ch) * 0.025)) - f.leanX) * Math.min(1, realDt * 6);
      f.leanZ += (Math.max(-0.14, Math.min(0.14, -(acc.x * ch - acc.y * sh) * 0.02)) - f.leanZ) * Math.min(1, realDt * 6);
      f.celebrate = fr.celebrating >= 0 && (i < 11) === (fr.celebrating < 11) ? 1 : 0;
      f.star = fr.celebrating === i;
      // Eyes on the ball, unless the time-lapse is too fast to follow.
      f.look = rate < 6 ? this.ball.position : null;
      f.animate(realDt, Math.min(9.5, speed), this.elapsed);
      const ringMat = f.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity += ((i === fr.holder ? 0.9 : 0) - ringMat.opacity) * Math.min(1, realDt * 10);
    }

    // Holder label.
    this.updateLabel(fr.holder);
    if (fr.holder >= 0) {
      const f = this.figures[fr.holder];
      this.labelSprite.position.set(f.pos.x, 3.6, f.pos.y);
    }

    this.updateCamera(fr, realDt, rate, jumped);
    this.excitement = Math.max(0, this.excitement - realDt * 0.12);
    if (this.excitement < 0.05) this.stadium.setCheer(-1);
    this.stadium.update(this.elapsed, this.excitement);
    this.updateScoreboard(t);
    this.updateConfetti(realDt);
    if (draw) this.composer.render(realDt);
  }

  private accel = Array.from({ length: 22 }, () => new THREE.Vector2());
  private fired = new Set<string>();

  /**
   * Moves every player toward their target like a body, not a cursor: speed
   * builds and bleeds off with limited acceleration, players ease into
   * position, sprint when far or involved, and keep a little personal space.
   * Integrated in game time with small substeps so fast-forward stays stable;
   * while fast-forwarding, limits scale up so the time-lapse keeps its shape.
   */
  private steer(fr: ReturnType<Playback['frame']>, gameDt: number, jumped: boolean, rate: number) {
    const figs = this.figures;
    const steps = Math.max(1, Math.ceil(gameDt / 0.04));
    const h = gameDt / steps;
    const B = Math.max(1, Math.pow(rate, 0.85));
    for (const a of this.accel) a.set(0, 0);
    for (let s = 0; s < steps && h > 0; s++) {
      for (let i = 0; i < 22; i++) {
        const f = figs[i];
        if (fr.sentOff[i]) continue;
        const tgt = fr.targets[i];
        const dx = tgt.x - f.pos.x;
        const dy = tgt.y - f.pos.y;
        const d = Math.hypot(dx, dy);
        if (jumped || d > 60) {
          f.pos.set(tgt.x, tgt.y);
          f.vel.set(0, 0);
          continue;
        }
        const involved = i === fr.holder || i === fr.kicker;
        const top = (involved ? 8.8 : d > 14 ? 7.8 : 3.4 + d * 0.3) * B;
        const want = Math.min(top, d * (involved ? 3 : 1.5) * B);
        const wx = d > 0.03 ? (dx / d) * want : 0;
        const wy = d > 0.03 ? (dy / d) * want : 0;
        let ax = wx - f.vel.x;
        let ay = wy - f.vel.y;
        const al = Math.hypot(ax, ay);
        const speeding = f.vel.x * ax + f.vel.y * ay >= 0;
        const amax = (speeding ? (involved ? 8 : 6) : 10) * h * B * B;
        if (al > amax) {
          ax *= amax / al;
          ay *= amax / al;
        }
        f.vel.x += ax;
        f.vel.y += ay;
        // When fast-forward hands back to normal speed, shed the time-lapse velocity at once
        // instead of letting players skate across the pitch for seconds.
        const vl = Math.hypot(f.vel.x, f.vel.y);
        const vmax = 9.6 * B;
        if (vl > vmax) {
          f.vel.x *= vmax / vl;
          f.vel.y *= vmax / vl;
        }
        this.accel[i].set(ax / h / (B * B), ay / h / (B * B));
      }
      // Personal space: overlapping players ease apart (the ball carrier holds his line).
      for (let i = 0; i < 22; i++) {
        if (fr.sentOff[i]) continue;
        for (let j = i + 1; j < 22; j++) {
          if (fr.sentOff[j]) continue;
          const a = figs[i].pos;
          const b = figs[j].pos;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > 1.25 || d < 1e-4) continue;
          const push = ((1.25 - d) / d) * 0.25;
          const wi = i === fr.holder ? 0.15 : 1;
          const wj = j === fr.holder ? 0.15 : 1;
          a.x -= dx * push * wi;
          a.y -= dy * push * wi;
          b.x += dx * push * wj;
          b.y += dy * push * wj;
        }
      }
      for (let i = 0; i < 22; i++) {
        const f = figs[i];
        f.pos.x += f.vel.x * h;
        f.pos.y += f.vel.y * h;
      }
    }
  }

  /** One-shot actions from the engine's recording, warped so contact lands on the recorded moment. */
  private trackedActions(fr: ReturnType<Playback['frame']>, t: number, rate: number) {
    if (rate > 3) return;
    const map: Partial<Record<string, ActionKind>> = {
      pass: 'pass', drive: 'shot', shot: 'shot', cross: 'cross', header: 'header', trap: 'trap',
      tackle: 'tackle', slide: 'slide', dive: 'dive', catch: 'catch', throw: 'keeperThrow', fall: 'fall',
    };
    for (const [at, i, kind, detail] of fr.acts) {
      const act = map[kind];
      const key = `a${at}:${i}:${kind}`;
      if (!act || this.fired.has(key) || fr.sentOff[i]) continue;
      // Start about half a second of real time ahead of the contact.
      const lead = (at - t) / Math.max(0.05, rate);
      if (lead > 0.5 || lead < -0.15) continue;
      this.fired.add(key);
      // Dives carry their side; strikes use the left foot now and then.
      const side: 1 | -1 = kind === 'dive' ? (detail >= 0 ? 1 : -1) : i % 5 === 3 ? -1 : 1;
      this.figures[i].act(act, { contactIn: Math.max(0, lead), side });
    }
  }

  /**
   * One-shot actions: strikes, headers, tackles and keeper saves, each timed
   * so the contact frame lands when the ball is actually played.
   */
  private triggerActions(fr: ReturnType<Playback['frame']>, t: number, rate: number) {
    if (rate > 3) return;
    // Real seconds until a game-clock moment.
    const until = (at: number) => Math.max(0, (at - t) / Math.max(0.05, rate));
    const fire = (key: string, idx: number, kind: ActionKind, at: number, side: 1 | -1 = 1) => {
      if (idx < 0 || idx > 21 || this.fired.has(key) || fr.sentOff[idx]) return;
      this.fired.add(key);
      this.figures[idx].act(kind, { contactIn: until(at), side });
    };
    const ev = this.playback.events;
    const next = ev[fr.index + 1];
    if (fr.kicker >= 0 && until(fr.kickAt) < 0.5 && t < fr.kickAt + 0.2) {
      const header = next && next.k === 'clear' && (next.z ?? 0) > 0 && fr.ball.z > 1.2;
      const kind: ActionKind = header ? 'header'
        : next?.k === 'shot' ? 'shot'
        : next?.k === 'cross' ? 'cross'
        : (next?.z ?? 0) > 2.5 ? 'chip'
        : next?.k === 'clear' ? 'shot'
        : 'pass';
      fire(`k${fr.index}`, fr.kicker, kind, fr.kickAt, fr.kicker % 5 === 3 ? -1 : 1);
    }
    if (!next) return;
    if (next.k === 'cross' && next.q !== undefined && fr.phase === 'flight' && until(next.t) < 0.6 && (next.o === 'won' || next.o === 'cleared')) {
      fire(`h${fr.index}`, next.q, 'header', next.t);
    }
    if ((next.k === 'tackle' || next.k === 'foul') && next.p !== undefined && until(next.t) < 0.6 && next.t >= t) {
      fire(`t${fr.index}`, next.p, (fr.index * 7) % 5 < 3 ? 'slide' : 'tackle', next.t);
      if (next.k === 'foul' && next.q !== undefined) fire(`f${fr.index}`, next.q, 'fall', next.t + 0.1);
    }
    if (next.k === 'shot' && next.q !== undefined && fr.phase === 'flight' && ['saved', 'parried', 'goal'].includes(next.o ?? '')) {
      const gk = this.figures[next.q];
      const dx = next.x - gk.pos.x;
      const dz = next.y - gk.pos.y;
      const side = dx * Math.cos(gk.heading) - dz * Math.sin(gk.heading) >= 0 ? 1 : -1;
      fire(`s${fr.index}`, next.q, 'keeperSet', next.t - 0.2);
      if (until(next.t) < 0.7) {
        if (Math.abs(next.y - gk.pos.y) > 1.2) fire(`d${fr.index}`, next.q, 'dive', next.t, side);
        else if (next.o === 'saved') fire(`c${fr.index}`, next.q, 'catch', next.t);
      }
    }
  }

  private updateTrail(on: boolean, reset: boolean) {
    if (reset || !on) {
      this.trailPts.length = 0;
    } else {
      this.trailPts.push(this.ball.position.clone());
      if (this.trailPts.length > 14) this.trailPts.shift();
    }
    const pts = this.trailPts;
    if (pts.length < 2) {
      this.trail.visible = false;
      return;
    }
    this.trail.visible = true;
    const pos: number[] = [];
    const camDir = new THREE.Vector3().subVectors(this.camera.position, this.ball.position).normalize();
    for (let i = 0; i < pts.length; i++) {
      const w = (i / pts.length) * 0.22;
      const a = pts[Math.max(0, i - 1)];
      const b = pts[i];
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const side = new THREE.Vector3().crossVectors(dir, camDir).normalize().multiplyScalar(w);
      pos.push(b.x + side.x, b.y + side.y, b.z + side.z, b.x - side.x, b.y - side.y, b.z - side.z);
    }
    const idx: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    const g = this.trail.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
  }

  private updateLabel(holder: number) {
    if (holder === this.labelFor) return;
    this.labelFor = holder;
    this.labelSprite.visible = holder >= 0;
    if (holder < 0) return;
    const team = this.teams[holder < 11 ? 0 : 1];
    const p = team.players[holder % 11];
    const g = this.labelCanvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 96);
    const text = `${p?.number ?? ''}  ${(p?.name ?? '').toUpperCase()}`;
    g.font = '800 54px "Barlow Condensed", Impact, sans-serif';
    const w = Math.min(500, g.measureText(text).width + 44);
    const x = (512 - w) / 2;
    g.fillStyle = 'rgba(10,12,14,0.82)';
    roundRect(g, x, 14, w, 68, 16);
    g.fill();
    g.fillStyle = team.colors.primary;
    roundRect(g, x, 14, 10, 68, 5);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256 + 4, 50, 470);
    (this.labelSprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
  }

  private camBall = new THREE.Vector2();
  private camLead = new THREE.Vector2();

  private updateCamera(fr: ReturnType<Playback['frame']>, dt: number, rate: number, cut = false) {
    // Like a camera operator, lead the play a little in the direction the ball is going.
    if (cut || dt <= 0) this.camLead.set(0, 0);
    else if (rate < 4) {
      const vx = (fr.ball.x - this.camBall.x) / dt / Math.max(1, rate);
      const vy = (fr.ball.y - this.camBall.y) / dt / Math.max(1, rate);
      const k = Math.min(1, dt * 1.5);
      this.camLead.x += (Math.max(-8, Math.min(8, vx * 0.45)) - this.camLead.x) * k;
      this.camLead.y += (Math.max(-5, Math.min(5, vy * 0.3)) - this.camLead.y) * k;
    } else this.camLead.multiplyScalar(0.9);
    this.camBall.set(fr.ball.x, fr.ball.y);
    let bx = fr.ball.x + this.camLead.x;
    let by = fr.ball.y + this.camLead.y;
    // Dangerous set pieces: frame the ball and the goal together.
    const sp = fr.restart;
    if (sp && (sp.k === 'penalty' || sp.k === 'corner' || (sp.k === 'freekick' && (sp.o === 'direct' || sp.o === 'cross')))) {
      const gx = this.playback.dir(sp.s, this.lastClock) * PL / 2;
      const k = sp.k === 'corner' ? 0.3 : 0.42;
      bx += (gx - bx) * k;
      by += (0 - by) * k * 0.6;
    }
    if (this.mode === 'orbit' && this.controls) {
      this.controls.target.lerp(new THREE.Vector3(bx, 0, by), Math.min(1, dt * 2));
      this.controls.update();
      return;
    }
    const aspect = this.camera.aspect;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let fov: number;
    if (this.mode === 'tactical') {
      const portrait = aspect < 1.1;
      if (portrait) {
        // Rotate the pitch so it runs top-to-bottom on phones.
        pos = new THREE.Vector3(0, 120 / Math.max(0.55, aspect), 0.01);
        look = new THREE.Vector3(0, 0, 0);
        this.camera.up.set(1, 0, 0);
      } else {
        pos = new THREE.Vector3(0, 78, 46);
        look = new THREE.Vector3(0, 0, 2);
        this.camera.up.set(0, 1, 0);
      }
      fov = portrait ? 40 : 42 / Math.min(1.6, aspect / 1.4);
    } else {
      this.camera.up.set(0, 1, 0);
      // Broadcast gantry: follows the ball along the touchline, pushes in on big moments.
      const slow = rate < 4;
      const attacking = Math.abs(bx) > PL / 2 - 26;
      const tight = slow && attacking ? 0.72 : 1;
      // Hung under the near roof, low enough that the far stand fills the top of the frame.
      const dist = 50 * tight;
      const height = 21.5 * tight;
      const followX = bx * (aspect < 1 ? 0.92 : 0.8);
      pos = new THREE.Vector3(followX, height, by * 0.25 + dist);
      look = new THREE.Vector3(bx * 0.92, 0, by * 0.82 - 2);
      fov = aspect < 1 ? 46 + (1 - aspect) * 20 : 26 + (1.78 - Math.min(1.78, aspect)) * 18;
      if (slow && attacking) fov *= 0.92;
    }
    const k = Math.min(1, dt * (this.mode === 'tactical' ? 3 : 1.6));
    if (cut) {
      // A cut into a highlight: start on the action, don't swoop in from wherever we were.
      this.camPos.copy(pos);
      this.camTarget.copy(look);
      this.camera.fov = fov;
    } else {
      this.camPos.lerp(pos, k);
      this.camTarget.lerp(look, Math.min(1, dt * 2.4));
    }
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 0.8);
    }
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 2);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.camTarget);
  }

  private updateConfetti(dt: number) {
    if (!this.confetti || !this.confettiState.length) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let alive = 0;
    this.confettiState.forEach((s, i) => {
      s.v.y -= 9.8 * dt * 0.35;
      s.v.multiplyScalar(1 - dt * 0.8);
      s.p.addScaledVector(s.v, dt);
      s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
      if (s.p.y > 0) alive++;
      q.setFromEuler(s.r);
      m.compose(s.p, q, s.p.y > 0 ? one : new THREE.Vector3(0, 0, 0));
      this.confetti!.setMatrixAt(i, m);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
    if (!alive) this.confettiState = [];
  }

  /** Real-world position of the scene canvas for screenshots etc. */
  get canvas() {
    return this.renderer.domElement;
  }

  dispose() {
    this.disposed = true;
    this.resizeObs.disconnect();
    this.controls?.dispose();
    this.stadium.dispose();
    this.composer.dispose();
    this.gtao?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rough perceptual colour distance check for kit clashes. */
function clash(a: string, b: string) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < 110;
}

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f7f2';
  g.fillRect(0, 0, 512, 256);
  // Panels: dark pentagons scattered in an equirect layout.
  g.fillStyle = '#16181b';
  const pent = (x: number, y: number, r: number, sx = 1) => {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * r * sx, y + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  };
  for (let i = 0; i < 6; i++) pent(i * 85 + 20, 128, 22);
  for (let i = 0; i < 6; i++) pent(i * 85 + 62, 55, 18, 1.4);
  for (let i = 0; i < 6; i++) pent(i * 85 + 62, 200, 18, 1.4);
  g.fillStyle = '#c6ff3d';
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 246, 512, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { PW };
