// The 3D match renderer. Owns the three.js scene, post-processing stack and
// camera director; the page drives it with a clock value each frame.
import * as THREE from 'three';
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
import { Figure, GK_KITS, type Kit } from './figures.ts';
import { Playback } from './playback.ts';
import { buildStadium, PL, PW, type Stadium } from './stadium.ts';

export type CameraMode = 'broadcast' | 'tactical' | 'orbit';
export type Quality = 'high' | 'low';

export interface ViewerTeam {
  name: string;
  short: string;
  colors: Kit;
  formation: string;
  tactics: Tactics;
  players: { name: string; number: number; app: Record<string, number> }[];
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
  private camPos = new THREE.Vector3(0, 40, 70);
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
    this.scene.fog = new THREE.Fog(opts.night ? 0x070b16 : 0xb8d4ec, 160, 420);

    // Key light: the sun by day, the floodlight rig by night.
    this.sun = new THREE.DirectionalLight(opts.night ? 0xeef4ff : 0xffeacc, opts.night ? 2.0 : 2.4);
    this.sun.position.set(opts.night ? 18 : -45, opts.night ? 90 : 70, opts.night ? 30 : 40);
    this.sun.castShadow = true;
    const sz = this.quality === 'high' ? 4096 : 1024;
    this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 220;
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
      crowd: opts.crowd ?? (this.quality === 'high' ? 9000 : 3500),
    });
    this.scene.add(this.stadium.group);

    // Players. Away team switches to its secondary kit if colours clash.
    const awayKit = clash(teams[0].colors.primary, teams[1].colors.primary) ? { primary: teams[1].colors.secondary, secondary: teams[1].colors.primary } : teams[1].colors;
    const kits: [Kit, Kit] = [teams[0].colors, awayKit];
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < 11; k++) {
        const p = teams[side].players[k];
        const f = new Figure(kits[side], sanitizeAppearance(p?.app), k === 0, GK_KITS[side]);
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
    this.sun.shadow.mapSize.set(q === 'high' ? 4096 : 1024, q === 'high' ? 4096 : 1024);
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

  setEvents(events: MatchEvent[]) {
    this.playback.setEvents(events);
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
  render(t: number, rate = 1) {
    if (this.disposed) return;
    const now = performance.now();
    const realDt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += realDt;
    let gameDt = this.lastClock < 0 ? 0 : t - this.lastClock;
    const jumped = gameDt < -0.5 || gameDt > 30 || this.first;
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

    // Players: chase their targets with a speed limit, face where they're going.
    const maxSpeed = 8.5;
    for (let i = 0; i < 22; i++) {
      const f = this.figures[i];
      const tgt = fr.targets[i];
      if (fr.sentOff[i]) {
        f.root.visible = false;
        continue;
      }
      f.root.visible = true;
      const dx = tgt.x - f.pos.x;
      const dy = tgt.y - f.pos.y;
      const d = Math.hypot(dx, dy);
      const step = Math.min(d, (i === fr.holder ? maxSpeed * 1.3 : maxSpeed) * Math.max(gameDt, 0));
      if (jumped || d > 40) f.pos.set(tgt.x, tgt.y);
      else if (d > 0.001) f.pos.set(f.pos.x + (dx / d) * step, f.pos.y + (dy / d) * step);
      const speed = gameDt > 0 ? step / gameDt : 0;
      f.vel.set(dx, dy);
      // Facing: movement if running, else the ball.
      const face = speed > 0.6 ? Math.atan2(dx, dy) : Math.atan2(fr.ball.x - f.pos.x, fr.ball.y - f.pos.y);
      f.heading = lerpAngle(f.heading, face, Math.min(1, realDt * 8));
      f.root.position.set(f.pos.x, 0, f.pos.y);
      f.root.rotation.y = f.heading;
      f.celebrate = fr.celebrating >= 0 && (i < 11) === (fr.celebrating < 11) ? 1 : 0;
      // Visual speed: real-time-feel animation even when fast-forwarding.
      f.animate(realDt, Math.min(9, speed), this.elapsed);
      const ringMat = f.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity += ((i === fr.holder ? 0.9 : 0) - ringMat.opacity) * Math.min(1, realDt * 10);
    }

    // Holder label.
    this.updateLabel(fr.holder);
    if (fr.holder >= 0) {
      const f = this.figures[fr.holder];
      this.labelSprite.position.set(f.pos.x, 3.6, f.pos.y);
    }

    this.updateCamera(fr, realDt, rate);
    this.excitement = Math.max(0, this.excitement - realDt * 0.12);
    if (this.excitement < 0.05) this.stadium.setCheer(-1);
    this.stadium.update(this.elapsed, this.excitement);
    this.updateConfetti(realDt);
    this.composer.render(realDt);
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

  private updateCamera(fr: ReturnType<Playback['frame']>, dt: number, rate: number) {
    const bx = fr.ball.x;
    const by = fr.ball.y;
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
      const dist = (aspect < 1 ? 58 : 48) * tight;
      const height = (aspect < 1 ? 34 : 27) * tight;
      const followX = bx * (aspect < 1 ? 0.92 : 0.8);
      pos = new THREE.Vector3(followX, height, by * 0.25 + dist);
      look = new THREE.Vector3(bx * 0.92, 0, by * 0.55);
      fov = aspect < 1 ? 46 : 26 + (1.78 - Math.min(1.78, aspect)) * 18;
      if (slow && attacking) fov *= 0.92;
    }
    const k = Math.min(1, dt * (this.mode === 'tactical' ? 3 : 1.6));
    this.camPos.lerp(pos, k);
    this.camTarget.lerp(look, Math.min(1, dt * 2.4));
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
