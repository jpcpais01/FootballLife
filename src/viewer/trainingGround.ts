// The training ground: a sunlit practice pitch where your toy player runs the
// drills. The page drives the timing game; this scene plays each rep's outcome.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { randomAppearance, type Appearance } from '../../shared/appearance.ts';
import type { Equipped } from '../../shared/cosmetics.ts';
import { Figure, GK_KITS, SHOWCASE_SCALE, type Kit } from './figures.ts';
import type { ActionKind } from './rig/animator.ts';
import { B } from './rig/skeleton.ts';

export type DrillId = 'shooting' | 'passing' | 'sprint' | 'defending' | 'keeper';
export type Outcome = 'perfect' | 'good' | 'miss';

export interface TrainingGround {
  setPlayer(app: Appearance, eq: Equipped, kit: Kit, keeper: boolean): void;
  setDrill(d: DrillId): void;
  /** Lights up the target for the coming rep. */
  prepare(rep: number): void;
  /** Plays one rep; resolves when the scene is ready for the next. */
  play(o: Outcome): Promise<void>;
  /** Back to the start positions. */
  reset(): void;
  cheer(): void;
  /** Moves the canvas into a new container and resumes rendering. */
  attach(host: HTMLElement): void;
  /** Stops rendering and takes the canvas off the page, keeping everything loaded for the next visit. */
  park(): void;
  dispose(): void;
}

const LIME = 0xc6ff3d;
const GOAL_Z = -18;
const BALL_R = 0.3;
const SHOT_Z = -4;
const GATE_GAP = 5;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Practice pitch: mowing stripes, a penalty box and a centre circle stub. */
function groundTexture() {
  const S = 20; // px per metre
  const W = 80;
  const H = 80;
  return canvasTex(W * S, H * S, (g) => {
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#3a9a3c' : '#43a644';
      g.fillRect(0, (i * H * S) / 16, W * S, (H * S) / 16 + 1);
    }
    const img = g.getImageData(0, 0, W * S, H * S);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      img.data[i] += n * 0.5;
      img.data[i + 1] += n;
      img.data[i + 2] += n * 0.4;
    }
    g.putImageData(img, 0, 0);
    // World x → canvas x, world z → canvas y (centre of the texture is the origin).
    const X = (x: number) => (x + W / 2) * S;
    const Z = (z: number) => (z + H / 2) * S;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 0.13 * S;
    g.beginPath();
    g.moveTo(X(-30), Z(GOAL_Z));
    g.lineTo(X(30), Z(GOAL_Z));
    g.stroke();
    g.strokeRect(X(-20.16), Z(GOAL_Z), 40.32 * S, 16.5 * S);
    g.strokeRect(X(-9.16), Z(GOAL_Z), 18.32 * S, 5.5 * S);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(X(0), Z(GOAL_Z + 11), 0.22 * S, 0, Math.PI * 2);
    g.fill();
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    g.arc(X(0), Z(GOAL_Z + 11), 9.15 * S, Math.PI / 2 - (Math.PI / 2 - a), Math.PI / 2 + (Math.PI / 2 - a));
    g.stroke();
    // Worn patch where the shooting drill happens.
    const grd = g.createRadialGradient(X(0), Z(SHOT_Z), 0, X(0), Z(SHOT_Z), 3 * S);
    grd.addColorStop(0, 'rgba(140,120,70,0.35)');
    grd.addColorStop(1, 'rgba(140,120,70,0)');
    g.fillStyle = grd;
    g.fillRect(X(-4), Z(SHOT_Z - 4), 8 * S, 8 * S);
  });
}

function netTexture() {
  const t = canvasTex(128, 128, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    for (let i = 0; i <= 128; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ballTexture() {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#f7f7f2';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#16181b';
    for (let i = 0; i < 6; i++) {
      for (const [y, r] of [[64, 11], [26, 9], [102, 9]] as const) {
        const x = i * 43 + (y === 64 ? 10 : 31);
        g.beginPath();
        for (let k = 0; k < 5; k++) {
          const an = (k / 5) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
        }
        g.fill();
      }
    }
    g.fillStyle = '#c6ff3d';
    g.fillRect(0, 0, 256, 5);
    g.fillRect(0, 123, 256, 5);
  });
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

export function createTrainingGround(initialHost: HTMLElement): TrainingGround {
  let host = initialHost;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;
  scene.fog = new THREE.Fog(0xe8d6b8, 60, 170);
  const disposables: { dispose(): void }[] = [env, pmrem];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 600);

  // Golden-hour light.
  const sun = new THREE.DirectionalLight(0xffe2b8, 3.0);
  sun.position.set(-26, 22, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x3a5a2a, 0.7));

  // Sky.
  const sky = new THREE.Mesh(
    track(new THREE.SphereGeometry(400, 32, 16)),
    track(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { sunDir: { value: sun.position.clone().normalize() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sunDir; varying vec3 vP;
        void main(){ float y = vP.y; vec3 top = vec3(0.16,0.38,0.78); vec3 mid = vec3(0.62,0.74,0.9); vec3 bot = vec3(1.0,0.82,0.6);
          vec3 c = y > 0.1 ? mix(mid, top, smoothstep(0.1, 0.7, y)) : mix(bot, mid, smoothstep(-0.05, 0.1, y));
          float s = max(0.0, dot(normalize(vP), sunDir)); c += vec3(1.0,0.75,0.45) * (pow(s, 5.0) * 0.35 + pow(s, 300.0) * 1.5);
          gl_FragColor = vec4(c, 1.0); }`,
    })),
  );
  scene.add(sky);

  // Ground and pitch.
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(80, 80)), track(new THREE.MeshStandardMaterial({ map: track(groundTexture()), roughness: 0.95 })));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const outer = new THREE.Mesh(track(new THREE.PlaneGeometry(600, 600)), track(new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 1 })));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.03;
  outer.receiveShadow = true;
  scene.add(outer);

  // Surroundings: fence, trees, the academy building and light poles.
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x1e2a24, roughness: 0.8 }));
  const fenceMat = track(new THREE.MeshStandardMaterial({ color: 0x24402e, roughness: 0.9, transparent: true, opacity: 0.85 }));
  for (const [x, z, w, r] of [[0, -40, 80, 0], [0, 40, 80, 0], [-40, 0, 80, Math.PI / 2], [40, 0, 80, Math.PI / 2]] as const) {
    const f = new THREE.Mesh(track(new THREE.BoxGeometry(w, 2.4, 0.08)), fenceMat);
    f.position.set(x, 1.2, z);
    f.rotation.y = r;
    scene.add(f);
  }
  const trunkGeo = track(new THREE.CylinderGeometry(0.25, 0.35, 3, 6));
  const crownGeo = track(new THREE.IcosahedronGeometry(2.6, 1));
  const trunks = new THREE.InstancedMesh(trunkGeo, track(new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 })), 70);
  const crowns = new THREE.InstancedMesh(crownGeo, track(new THREE.MeshStandardMaterial({ color: 0x3f6b33, roughness: 0.9, flatShading: true })), 70);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + Math.random() * 0.05;
      const r = 50 + Math.random() * 30;
      const x = Math.cos(a) * r * 1.1;
      const z = Math.sin(a) * r;
      const s = 0.8 + Math.random() * 0.8;
      m.compose(new THREE.Vector3(x, 1.5 * s, z), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 4.4 * s, z), q.setFromEuler(new THREE.Euler(0, Math.random() * 3, 0)), new THREE.Vector3(s, s * (1 + Math.random() * 0.4), s));
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, c.setHSL(0.24 + Math.random() * 0.08, 0.45, 0.25 + Math.random() * 0.12));
    }
    crowns.castShadow = true;
  }
  scene.add(trunks, crowns);
  const building = new THREE.Group();
  const shell = new THREE.Mesh(track(new THREE.BoxGeometry(46, 7, 12)), track(new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.7 })));
  shell.position.y = 3.5;
  const glass = new THREE.Mesh(track(new THREE.BoxGeometry(40, 3.4, 0.2)), track(new THREE.MeshPhysicalMaterial({ color: 0x8fb7d8, roughness: 0.05, metalness: 0.2, emissive: 0x1a2a3a })));
  glass.position.set(0, 3.8, 6.05);
  const stripe = new THREE.Mesh(track(new THREE.BoxGeometry(46.2, 0.5, 12.2)), track(new THREE.MeshStandardMaterial({ color: LIME, emissive: 0x2c3a00 })));
  stripe.position.y = 6.6;
  building.add(shell, glass, stripe);
  building.position.set(8, 0, -66);
  building.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  scene.add(building);
  for (const [x, z] of [[-38, -38], [38, -38], [-38, 38], [38, 38]]) {
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.28, 18, 8)), dark);
    pole.position.set(x, 9, z);
    const head = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 1.2, 0.4)), track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 0.4 })));
    head.position.set(x, 18.2, z);
    head.lookAt(0, 0, 0);
    scene.add(pole, head);
  }

  // Decorative kit: cone slalom, a mannequin wall, ball bag, mini goals.
  const coneGeo = track(new THREE.ConeGeometry(0.28, 0.6, 14));
  coneGeo.translate(0, 0.3, 0);
  const coneMat = track(new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 }));
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, 12);
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) {
      m.makeTranslation(-20 + (i % 2) * 1.2, 0, 14 - i * 2.4);
      cones.setMatrixAt(i, m);
    }
    cones.castShadow = true;
  }
  scene.add(cones);
  const mannequinMat = track(new THREE.MeshStandardMaterial({ color: 0x2b6cff, roughness: 0.4 }));
  const mannequinGeo = track(new THREE.CapsuleGeometry(0.32, 1.4, 4, 12));
  for (let i = 0; i < 4; i++) {
    const mq = new THREE.Mesh(mannequinGeo, mannequinMat);
    mq.position.set(12 + i * 0.75, 1.0, -9);
    mq.castShadow = true;
    scene.add(mq);
  }

  // Goal.
  const postMat = track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 }));
  const net = track(netTexture());
  const goalGroup = new THREE.Group();
  {
    const W = 7.32;
    const H = 2.44;
    const D = 2.2;
    const r = 0.07;
    const cyl = (len: number) => track(new THREE.CylinderGeometry(r, r, len, 14));
    const p1 = new THREE.Mesh(cyl(H), postMat); p1.position.set(-W / 2, H / 2, 0);
    const p2 = new THREE.Mesh(cyl(H), postMat); p2.position.set(W / 2, H / 2, 0);
    const bar = new THREE.Mesh(cyl(W + 2 * r), postMat); bar.rotation.z = Math.PI / 2; bar.position.set(0, H, 0);
    for (const m of [p1, p2, bar]) { m.castShadow = true; goalGroup.add(m); }
    const netMat = (rx: number, ry: number) => {
      const t = net.clone();
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      track(t);
      return track(new THREE.MeshStandardMaterial({ map: t, alphaMap: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
    };
    const back = new THREE.Mesh(track(new THREE.PlaneGeometry(W, H * 1.15)), netMat(W * 3, H * 3));
    back.position.set(0, H / 2 - 0.2, -D);
    const top = new THREE.Mesh(track(new THREE.PlaneGeometry(W, D)), netMat(W * 3, D * 3));
    top.rotation.x = -Math.PI / 2 + 0.25;
    top.position.set(0, H - 0.1, -D / 2);
    goalGroup.add(back, top);
    for (const sd of [-1, 1]) {
      const side = new THREE.Mesh(track(new THREE.PlaneGeometry(D, H)), netMat(D * 3, H * 3));
      side.rotation.y = Math.PI / 2;
      side.position.set((sd * W) / 2, H / 2, -D / 2);
      goalGroup.add(side);
    }
  }
  goalGroup.position.z = GOAL_Z;
  scene.add(goalGroup);

  // Shooting targets in the four corners.
  const targetPts = [new THREE.Vector3(-2.75, 1.8, GOAL_Z + 0.05), new THREE.Vector3(2.75, 0.62, GOAL_Z + 0.05), new THREE.Vector3(2.75, 1.8, GOAL_Z + 0.05), new THREE.Vector3(-2.75, 0.62, GOAL_Z + 0.05)];
  const targetGeo = track(new THREE.TorusGeometry(0.55, 0.07, 10, 40));
  const targets = targetPts.map((p) => {
    const m = new THREE.Mesh(targetGeo, track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: LIME, emissiveIntensity: 0, roughness: 0.4 })));
    m.position.copy(p);
    goalGroup.parent!.add(m);
    return m;
  });

  // Rebound boards for passing.
  const boardPts = [new THREE.Vector3(-9, 0, -12), new THREE.Vector3(0, 0, -15), new THREE.Vector3(9, 0, -12)];
  const boards = boardPts.map((p) => {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(2.4, 1.0, 0.18)), track(new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.5 })));
    frame.position.y = 0.5;
    frame.rotation.x = -0.15;
    const face = new THREE.Mesh(track(new THREE.PlaneGeometry(2.1, 0.75)), track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: LIME, emissiveIntensity: 0, roughness: 0.4 })));
    face.position.set(0, 0.5, 0.1);
    face.rotation.x = -0.15;
    g.add(frame, face);
    g.position.copy(p);
    g.lookAt(0, 0, 0);
    g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    scene.add(g);
    return { g, face };
  });

  // Sprint gates.
  const gateMat = track(new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: LIME, emissiveIntensity: 0, roughness: 0.4 }));
  const gates: THREE.Group[] = [];
  for (let i = 1; i <= 6; i++) {
    const g = new THREE.Group();
    for (const sx of [-1.5, 1.5]) {
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8)), gateMat.clone());
      track(pole.material as THREE.Material);
      pole.position.set(sx, 0.85, 0);
      pole.castShadow = true;
      g.add(pole);
    }
    g.position.set(0, 0, 2 - i * GATE_GAP);
    scene.add(g);
    gates.push(g);
  }

  // Ball.
  const ball = new THREE.Mesh(track(new THREE.SphereGeometry(BALL_R, 28, 20)), track(new THREE.MeshPhysicalMaterial({ map: track(ballTexture()), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 })));
  ball.castShadow = true;
  scene.add(ball);

  // Effects: a ring shockwave and a burst of confetti chips.
  const shock = new THREE.Mesh(track(new THREE.RingGeometry(0.8, 1, 48)), track(new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
  scene.add(shock);
  const CHIPS = 160;
  const chips = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(0.16, 0.1)), track(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), CHIPS);
  chips.frustumCulled = false;
  chips.count = 0;
  scene.add(chips);
  const chipState: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; life: number }[] = [];

  // Characters.
  let me: Figure | null = null;
  let keeper = false;
  let kit: Kit = { primary: '#1d2329', secondary: '#c6ff3d' };
  const dummy = new Figure({ primary: '#ff7a1a', secondary: '#1b1b1b' }, randomAppearance(Math.random), false, GK_KITS[0], undefined, { scale: SHOWCASE_SCALE });
  dummy.root.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  scene.add(dummy.root);

  // ---- State and animation plumbing ----
  let drill: DrillId = 'shooting';
  let rep = 0;
  let mode: 'idle' | 'busy' = 'idle';
  let cheerUntil = 0;
  const tasks: ((dt: number) => boolean)[] = [];
  const tween = (sec: number, fn: (u: number) => void) =>
    new Promise<void>((res) => {
      let t = 0;
      tasks.push((dt) => {
        t += dt;
        const u = Math.min(1, t / sec);
        fn(u);
        if (u >= 1) res();
        return u >= 1;
      });
    });
  const wait = (sec: number) => tween(sec, () => {});
  let juggling = true;
  const camPos = new THREE.Vector3(0, 3, 8);
  const camLook = new THREE.Vector3(0, 1, -10);
  const camPosT = camPos.clone();
  const camLookT = camLook.clone();
  let elapsed = 0;

  const burst = (at: THREE.Vector3, colors: number[], n = 80) => {
    for (let i = 0; i < n; i++) {
      if (chipState.length >= CHIPS) chipState.shift();
      chipState.push({
        p: at.clone(),
        v: new THREE.Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 5, (Math.random() - 0.5) * 7),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        life: 1.4 + Math.random() * 0.6,
      });
      chips.setColorAt(chipState.length - 1, new THREE.Color(colors[i % colors.length]));
    }
    if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
  };
  const ring = (at: THREE.Vector3, up = true) => {
    shock.position.copy(at);
    shock.rotation.set(up ? -Math.PI / 2 : 0, 0, 0);
    void tween(0.6, (u) => {
      shock.scale.setScalar(0.4 + u * 3);
      (shock.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.9;
    });
  };
  const flash = (m: THREE.MeshStandardMaterial, base = 0) =>
    tween(0.9, (u) => {
      m.emissiveIntensity = base + (1 - u) * 2.2;
    });

  const faceTo = (f: Figure, x: number, z: number) => {
    f.root.rotation.y = Math.atan2(x - f.root.position.x, z - f.root.position.z);
  };
  const flight = (from: THREE.Vector3, to: THREE.Vector3, h: number, sec: number, spin = 12) =>
    tween(sec, (u) => {
      ball.position.lerpVectors(from, to, u);
      ball.position.y += 4 * h * u * (1 - u);
      ball.rotation.x -= spin * 0.016;
    });
  /** Where the root must stand, facing `heading`, for bone `b` to meet `at` at the contact of `kind`. */
  const standFor = (f: Figure, kind: ActionKind, b: number, at: THREE.Vector3, heading: number) => {
    const keep = f.root.rotation.y;
    const pos = f.root.position.clone();
    f.root.rotation.y = heading;
    f.root.position.set(0, 0, 0);
    f.root.updateMatrixWorld();
    const off = f.partAt(kind, b, f.contactTime(kind));
    f.root.rotation.y = keep;
    f.root.position.copy(pos);
    f.root.updateMatrixWorld();
    return new THREE.Vector3(at.x - off.x, 0, at.z - off.z);
  };
  /** Waits for a walk or a turn on the spot to finish, at most `max` seconds. */
  const moved = (f: Figure, max = 3) =>
    new Promise<void>((res) => {
      let t = 0;
      tasks.push((dt) => {
        t += dt;
        const done = (!f.busyMoving && !f.acting) || t >= max;
        if (done) res();
        return done;
      });
    });
  /** Waits for the body to finish what it's doing (a dive and getting back up), at most `max` seconds. */
  const settle = (f: Figure, max = 3) =>
    new Promise<void>((res) => {
      let t = 0;
      tasks.push((dt) => {
        t += dt;
        const done = !f.acting || t >= max;
        if (done) res();
        return done;
      });
    });

  const startPositions = () => {
    tasks.length = 0;
    juggling = drill !== 'keeper';
    if (me) {
      me.pose = '';
      me.root.visible = true;
    }
    dummy.root.visible = drill === 'defending' || drill === 'keeper';
    dummy.pose = '';
    goalGroup.visible = drill === 'shooting' || drill === 'keeper';
    for (const t of targets) {
      t.visible = drill === 'shooting';
      (t.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    }
    for (const b of boards) {
      b.g.visible = drill === 'passing';
      (b.face.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    }
    for (const g of gates) g.visible = drill === 'sprint';
    const at = (x: number, z: number, faceX: number, faceZ: number) => {
      if (!me) return;
      me.root.position.set(x, 0, z);
      faceTo(me, faceX, faceZ);
    };
    switch (drill) {
      case 'shooting':
        at(-1.1, SHOT_Z + 1.6, 0, GOAL_Z);
        ball.position.set(0, BALL_R, SHOT_Z);
        camPosT.set(4.2, 4.4, SHOT_Z + 13);
        camLookT.set(0, 1.2, GOAL_Z + 3);
        break;
      case 'passing':
        at(0, 0.6, 0, -10);
        camPosT.set(0, 11, 15);
        camLookT.set(0, 0, -6);
        break;
      case 'sprint':
        at(0, 3, 0, -10);
        camPosT.set(11, 4, 1);
        camLookT.set(0, 1, -2);
        break;
      case 'defending':
        at(0, -2, 0, -10);
        dummy.root.position.set(0, 0, -14);
        faceTo(dummy, 0, 0);
        camPosT.set(8, 5, 6);
        camLookT.set(0, 1, -7);
        break;
      case 'keeper':
        at(0, GOAL_Z + 0.8, 0, 0);
        dummy.root.position.set(1.1, 0, GOAL_Z + 12.2);
        faceTo(dummy, 0, GOAL_Z);
        ball.position.set(0, BALL_R, GOAL_Z + 11);
        camPosT.set(-5, 3.8, GOAL_Z + 21);
        camLookT.set(0, 1.2, GOAL_Z);
        break;
    }
    if (drill === 'defending') juggling = false;
  };

  // ---- Reps ----
  async function playShooting(o: Outcome) {
    if (!me) return;
    const t = targetPts[rep % 4];
    juggling = false;
    ball.position.set(0, BALL_R, SHOT_Z);
    // A couple of strides in, timed so the boot meets the ball on the spot.
    const heading = Math.atan2(t.x - ball.position.x, t.z - ball.position.z);
    const spot = standFor(me, 'shot', B.RightToeBase, ball.position, heading);
    const from = me.root.position.clone();
    const run = 0.6;
    me.act('shot', { contactIn: run });
    const h0 = me.root.rotation.y;
    await tween(run, (u) => {
      me!.root.position.lerpVectors(from, spot, u);
      me!.root.rotation.y = h0 + (heading - h0) * Math.min(1, u * 2);
    });
    const start = ball.position.clone();
    let to: THREE.Vector3;
    if (o === 'perfect') to = t.clone();
    else if (o === 'good') to = new THREE.Vector3(-t.x * 0.35 + (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 1.2, GOAL_Z - 1.4);
    else to = Math.random() < 0.5 ? new THREE.Vector3(Math.sign(Math.random() - 0.5) * 5.2, 1 + Math.random(), GOAL_Z - 3) : new THREE.Vector3((Math.random() - 0.5) * 4, 3.8, GOAL_Z - 4);
    await flight(start, to, o === 'miss' ? 1.2 : 0.6, 0.55);
    if (o === 'perfect') {
      const m = targets[rep % 4].material as THREE.MeshStandardMaterial;
      void flash(m, 0.35);
      burst(to, [LIME, 0xffffff, new THREE.Color(kit.primary).getHex()]);
      ring(to, false);
    }
    // Ball drops into the net or rolls away, then a fresh one appears on the spot.
    const end = to.clone().setY(BALL_R);
    if (o !== 'miss') end.z = GOAL_Z - 1.9;
    await flight(to, end, 0.2, 0.4, 4);
    ball.position.set(0, BALL_R, SHOT_Z);
    // Walk back to the mark and turn to face the goal again.
    me.walkPath([{ x: -1.1, z: SHOT_Z + 1.6 }], () => me?.turnTo(Math.PI), 2.2);
    await moved(me, 2.5);
  }

  async function playPassing(o: Outcome) {
    if (!me) return;
    juggling = false;
    const b = boards[[1, 0, 2, 1, 2, 0][rep % 6]];
    // Square up to the board (a proper turning step when it's well round), then side-foot it.
    me.turnTo(Math.atan2(b.g.position.x - me.root.position.x, b.g.position.z - me.root.position.z));
    const rolled = ball.position.clone();
    await moved(me, 1.6);
    const h = me.root.rotation.y;
    const foot = me.partAt('pass', B.RightToeBase, me.contactTime('pass')).add(new THREE.Vector3(Math.sin(h), 0, Math.cos(h)).multiplyScalar(BALL_R * 0.7)).setY(BALL_R);
    // The ball rolls over to his foot while he turns.
    if (rolled.distanceTo(foot) > 0.1) await flight(rolled, foot, 0, 0.3, 6);
    ball.position.copy(foot);
    me.act('pass', { contactIn: 0.32 });
    await wait(0.32);
    const target = b.g.position.clone().setY(BALL_R);
    const speed = o === 'perfect' ? 0.55 : o === 'good' ? 0.75 : 0.8;
    if (o === 'miss') {
      const wide = target.clone().add(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * 3.5, 0, -2));
      await flight(foot, wide, 0, speed, 18);
      await wait(0.25);
      ball.position.copy(foot);
    } else {
      const hit = o === 'perfect' ? target.clone() : target.clone().add(new THREE.Vector3(0.8, 0, 0));
      await flight(foot, hit, 0, speed, 18);
      void flash(b.face.material as THREE.MeshStandardMaterial, 0);
      if (o === 'perfect') {
        burst(hit.clone().setY(0.8), [LIME, 0xffffff]);
        ring(hit.clone().setY(0.05));
      }
      // Back off the board toward him.
      await flight(hit, foot, 0, o === 'perfect' ? 0.55 : 0.8, -18);
    }
  }

  async function playSprint(o: Outcome) {
    if (!me) return;
    juggling = false;
    const from = me.root.position.clone();
    const gate = gates[rep % gates.length];
    const to = new THREE.Vector3(0, 0, gate.position.z - 1.5);
    const sec = o === 'perfect' ? 0.55 : o === 'good' ? 0.8 : 1.2;
    await tween(sec, (u) => {
      me!.root.position.lerpVectors(from, to, o === 'miss' ? ease(u) : u);
      ball.position.copy(me!.root.position).add(new THREE.Vector3(0, BALL_R, -0.7));
    });
    if (o !== 'miss') {
      for (const p of gate.children) void flash((p as THREE.Mesh).material as THREE.MeshStandardMaterial, 0);
      if (o === 'perfect') ring(gate.position.clone().setY(0.05));
    }
    // Pull up over a few strides instead of stopping dead.
    const brake = me.root.position.clone();
    const stop = brake.clone().add(new THREE.Vector3(0, 0, -(to.z - from.z === 0 ? 0 : 1.1)));
    await tween(0.45, (u) => {
      me!.root.position.lerpVectors(brake, stop, 1 - (1 - u) * (1 - u));
      ball.position.copy(me!.root.position).add(new THREE.Vector3(0, BALL_R, -0.7));
    });
  }

  async function playDefending(o: Outcome) {
    if (!me) return;
    juggling = false;
    const start = new THREE.Vector3(0, 0, -14);
    dummy.root.position.copy(start);
    faceTo(dummy, 0, 0);
    const meet = new THREE.Vector3(0, 0, -5.2);
    // The attacker runs at him, and he goes to ground just as the ball arrives.
    const ballMeet = meet.clone().add(new THREE.Vector3(0, BALL_R, 0.9));
    const heading = Math.PI;
    const slideTo = standFor(me, 'slide', B.RightToeBase, ballMeet, heading);
    if (o === 'miss') slideTo.x += 0.9;
    const contact = 0.35;
    const meFrom = me.root.position.clone();
    await tween(0.9 - contact, (u) => {
      dummy.root.position.lerpVectors(start, meet, (u * (0.9 - contact)) / 0.9);
      ball.position.copy(dummy.root.position).add(new THREE.Vector3(0, BALL_R, 0.9));
    });
    me.act('slide', { contactIn: contact });
    const dFrom = dummy.root.position.clone();
    void tween(contact + 0.25, (u) => {
      me!.root.position.lerpVectors(meFrom, slideTo, Math.min(1, (u * (contact + 0.25)) / contact));
    });
    await tween(contact, (u) => {
      dummy.root.position.lerpVectors(dFrom, meet, u);
      ball.position.copy(dummy.root.position).add(new THREE.Vector3(0, BALL_R, 0.9));
    });
    const ballFrom = ball.position.clone();
    if (o === 'miss') {
      // The attacker skips past.
      const past = new THREE.Vector3(1.8, 0, 2);
      await tween(0.8, (u) => {
        dummy.root.position.lerpVectors(meet, past, u);
        ball.position.copy(dummy.root.position).add(new THREE.Vector3(0, BALL_R, 0.9));
      });
    } else {
      const away = o === 'perfect' ? new THREE.Vector3(6, BALL_R, -6) : new THREE.Vector3(-0.5, BALL_R, -3.6);
      if (o === 'perfect') {
        burst(ballFrom, [LIME, 0xffffff, 0xff7a1a], 60);
        ring(ballFrom.clone().setY(0.05));
      }
      await flight(ballFrom, away, o === 'perfect' ? 1.2 : 0.2, o === 'perfect' ? 0.7 : 0.4);
    }
    // Back on his feet and back to his mark for the next attack.
    await settle(me, 1.6);
    me.walkPath([{ x: 0, z: -2 }], () => me?.turnTo(Math.PI), 2.4);
    dummy.root.position.copy(start);
    faceTo(dummy, 0, 0);
    ball.position.copy(start).add(new THREE.Vector3(0, BALL_R, 0.9));
    await moved(me, 2.5);
  }

  async function playKeeper(o: Outcome) {
    if (!me) return;
    const side: 1 | -1 = Math.random() < 0.5 ? -1 : 1;
    const high = Math.random() < 0.5;
    const spot = new THREE.Vector3(0, BALL_R, GOAL_Z + 11);
    ball.position.copy(spot);
    // The shooter runs in from his mark and strikes it.
    const dh = Math.atan2(-spot.x, GOAL_Z - spot.z);
    const dSpot = standFor(dummy, 'shot', B.RightToeBase, spot, dh);
    const dFrom = dummy.root.position.clone();
    const run = 0.55;
    const flightT = 0.42;
    dummy.act('shot', { contactIn: run });
    // The keeper reads it and dives, his hands meeting the ball at full stretch.
    const kind: ActionKind = high ? 'diveHigh' : 'dive';
    const ct = me.contactTime(kind, side);
    const hands = me.partAt(kind, B.LeftHand, ct, side).add(me.partAt(kind, B.RightHand, ct, side)).multiplyScalar(0.5);
    me.act(kind, { contactIn: run + flightT, side });
    const d0 = dummy.root.rotation.y;
    await tween(run, (u) => {
      dummy.root.position.lerpVectors(dFrom, dSpot, u);
      dummy.root.rotation.y = d0 + (dh - d0) * Math.min(1, u * 2);
    });
    if (o === 'miss') {
      const past = hands.clone().add(new THREE.Vector3(Math.sign(hands.x - me.root.position.x || side) * 1.1, -0.2, -1.6));
      await flight(spot, past, 0.15, flightT + 0.08, 14);
      await wait(0.4);
    } else {
      await flight(spot, hands, 0.12, flightT, 14);
      if (o === 'perfect') {
        burst(hands, [LIME, 0xffffff, new THREE.Color(kit.primary).getHex()]);
        ring(hands, false);
        // Held: the ball stays in his hands as he lands and gets up.
        const l = new THREE.Vector3();
        const r = new THREE.Vector3();
        await tween(1.6, () => {
          me!.bones[B.LeftHand].getWorldPosition(l);
          me!.bones[B.RightHand].getWorldPosition(r);
          ball.position.copy(l).add(r).multiplyScalar(0.5);
          ball.position.y = Math.max(BALL_R, ball.position.y);
        });
      } else {
        await flight(hands, new THREE.Vector3(hands.x + Math.sign(hands.x - me.root.position.x || side) * 4, 0.5, GOAL_Z + 3), 1.4, 0.6, -10);
      }
    }
    // Up again; the shooter jogs back to his mark.
    dummy.walkPath([{ x: dFrom.x, z: dFrom.z }], () => dummy.turnTo(dh), 2.6);
    await settle(me, 2.6);
    ball.position.copy(spot);
    await moved(dummy, 2);
  }

  // ---- Keepy-ups between reps ----
  // Each touch is a mocap take; the ball rides the knee or the foot through
  // the touch and flies between touches on a true arc to where the next one meets it.
  interface Touch { kind: ActionKind; bone: number; at: number; until: number; up: number; flight: number }
  const FLICK: Touch = { kind: 'kickUp', bone: B.LeftToeBase, at: 1.0, until: 1.13, up: BALL_R, flight: 0.8 };
  const TOUCHES: Touch[] = [
    { kind: 'kneeB', bone: B.RightLeg, at: 0.24, until: 0.24, up: BALL_R + 0.12, flight: 0.72 },
    { kind: 'kneeA', bone: B.LeftLeg, at: 0.5, until: 0.5, up: BALL_R + 0.12, flight: 0.72 },
    { kind: 'stallB', bone: B.RightToeBase, at: 0.42, until: 1.48, up: BALL_R + 0.05, flight: 1 },
    { kind: 'stallD', bone: B.RightToeBase, at: 0.5, until: 1.18, up: BALL_R + 0.05, flight: 1 },
  ];
  const G = 17;
  let jug: {
    touch: Touch;
    start: number;
    fly: { a: THREE.Vector3; v: THREE.Vector3; t0: number; t1: number } | null;
    next: { touch: Touch; at: number } | null;
    rest: THREE.Vector3;
  } | null = null;
  const boneAt = (f: Figure, b: number, out: THREE.Vector3) => f.bones[b].getWorldPosition(out);
  const juggle = (f: Figure, dt: number) => {
    if (!jug) {
      // Flick it up off the grass.
      f.act(FLICK.kind);
      const rest = f.partAt(FLICK.kind, FLICK.bone, FLICK.at).setY(BALL_R);
      jug = { touch: FLICK, start: elapsed, fly: null, next: null, rest };
    }
    const j = jug;
    if (j.next && elapsed >= j.next.at) {
      f.act(j.next.touch.kind);
      j.touch = j.next.touch;
      j.start = j.next.at;
      j.next = null;
    }
    ball.rotation.x += dt * 5;
    if (j.fly && elapsed < j.fly.t1) {
      const u = elapsed - j.fly.t0;
      ball.position.copy(j.fly.a).addScaledVector(j.fly.v, u);
      ball.position.y -= 0.5 * G * u * u;
      return;
    }
    j.fly = null;
    const tr = elapsed - j.start;
    const tc = j.touch;
    if (tr < tc.at) {
      if (tc === FLICK) ball.position.copy(j.rest);
      return;
    }
    boneAt(f, tc.bone, ball.position);
    ball.position.y += tc.up;
    if (tr <= tc.until) return;
    // Released: on to the next touch, mostly knee to knee, now and then a catch on the foot.
    const knees = TOUCHES.slice(0, 2);
    const nt = Math.random() < 0.22 ? TOUCHES[2 + Math.floor(Math.random() * 2)] : tc.kind === 'kneeB' ? knees[1] : tc.kind === 'kneeA' ? knees[0] : knees[Math.floor(Math.random() * 2)];
    const T = Math.max(tc.flight, nt.at + 0.05);
    const a = ball.position.clone();
    const b = f.partAt(nt.kind, nt.bone, nt.at);
    b.y += nt.up;
    const v = b.sub(a).divideScalar(T);
    v.y += 0.5 * G * T;
    j.fly = { a, v, t0: elapsed, t1: elapsed + T };
    j.next = { touch: nt, at: elapsed + T - nt.at };
  };

  // ---- Loop ----
  const resize = () => {
    const w = host.clientWidth || 640;
    const h = host.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 52 : 38;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const clock = new THREE.Timer();
  let raf = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const tmpV = new THREE.Vector3();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    elapsed += dt;
    for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i](dt)) tasks.splice(i, 1);
    if (me) {
      const cheering = elapsed < cheerUntil;
      me.celebrate = cheering ? 1 : 0;
      me.star = cheering;
      if (juggling && mode === 'idle' && !cheering && !me.busyMoving) juggle(me, dt);
      else jug = null;
      me.animate(dt, me.stepWalk(dt), elapsed);
    }
    if (dummy.root.visible) dummy.animate(dt, dummy.stepWalk(dt), elapsed);
    // Effects.
    let alive = 0;
    chipState.forEach((c, i) => {
      c.life -= dt;
      c.v.y -= 9.8 * dt * 0.6;
      c.v.multiplyScalar(1 - dt * 0.9);
      c.p.addScaledVector(c.v, dt);
      c.r.x += dt * 7;
      c.r.y += dt * 5;
      if (c.p.y < 0.02) { c.p.y = 0.02; c.v.set(0, 0, 0); }
      q.setFromEuler(c.r);
      m4.compose(c.p, q, c.life > 0 ? one : new THREE.Vector3(0, 0, 0));
      chips.setMatrixAt(i, m4);
      if (c.life > 0) alive++;
    });
    chips.count = chipState.length;
    chips.instanceMatrix.needsUpdate = true;
    if (!alive && chipState.length) chipState.length = 0;
    // Camera: eases to the drill's framing with a gentle handheld drift; tracks the sprinter.
    if (drill === 'sprint' && me) {
      camPosT.set(11, 4, me.root.position.z - 1);
      camLookT.set(0, 1, me.root.position.z - 4);
    }
    const k = Math.min(1, dt * 2.2);
    // Portrait screens pull the camera back so the whole drill stays in frame.
    const far = camera.aspect < 1 ? 1.25 : 1;
    camPos.lerp(tmpV.subVectors(camPosT, camLookT).multiplyScalar(far).add(camLookT), k);
    camLook.lerp(camLookT, k);
    camera.position.copy(camPos);
    camera.position.x += Math.sin(elapsed * 0.4) * 0.15;
    camera.position.y += Math.sin(elapsed * 0.33) * 0.08;
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  };
  startPositions();
  camPos.copy(camPosT).sub(camLookT).multiplyScalar(camera.aspect < 1 ? 1.25 : 1).add(camLookT);
  camLook.copy(camLookT);
  loop();

  return {
    setPlayer(app, eq, k, isKeeper) {
      kit = k;
      keeper = isKeeper;
      if (me) scene.remove(me.root);
      me = new Figure(k, app, keeper, GK_KITS[0], eq, { scale: SHOWCASE_SCALE });
      me.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      scene.add(me.root);
      startPositions();
    },
    setDrill(d) {
      drill = d;
      rep = 0;
      mode = 'idle';
      startPositions();
    },
    prepare(i) {
      rep = i;
      if (drill === 'shooting') targets.forEach((t, j) => ((t.material as THREE.MeshStandardMaterial).emissiveIntensity = j === i % 4 ? 0.9 : 0));
      if (drill === 'passing') boards.forEach((b, j) => ((b.face.material as THREE.MeshStandardMaterial).emissiveIntensity = j === [1, 0, 2, 1, 2, 0][i % 6] ? 0.9 : 0));
    },
    async play(o) {
      mode = 'busy';
      try {
        if (drill === 'shooting') await playShooting(o);
        else if (drill === 'passing') await playPassing(o);
        else if (drill === 'sprint') await playSprint(o);
        else if (drill === 'defending') await playDefending(o);
        else await playKeeper(o);
      } catch {
        // A disposed scene mid-rep: nothing to finish.
      }
    },
    reset() {
      mode = 'idle';
      rep = 0;
      startPositions();
    },
    cheer() {
      cheerUntil = elapsed + 3.4;
      if (me) burst(me.root.position.clone().setY(2.4), [LIME, 0xffffff, new THREE.Color(kit.primary).getHex()], 140);
    },
    attach(next) {
      host = next;
      host.appendChild(renderer.domElement);
      ro.disconnect();
      ro.observe(host);
      resize();
      if (!raf) loop();
    },
    park() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      tasks.length = 0;
      renderer.domElement.remove();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const d of disposables) d.dispose();
      trunks.dispose();
      crowns.dispose();
      cones.dispose();
      chips.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
