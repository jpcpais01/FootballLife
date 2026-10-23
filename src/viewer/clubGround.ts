// The club's training ground, as one still: a few of the squad at work on a
// sunlit practice pitch, the head coach watching from the side. The stand,
// floodlights, balls and banner grow with the club's facilities. It is baked
// to an image once, so the club page carries no live 3D scene.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Appearance } from '../../shared/appearance.ts';
import type { Equipped } from '../../shared/cosmetics.ts';
import { loadCharacters } from './character/body.ts';
import { Figure, GK_KITS, type Kit } from './figures.ts';
import { loadMocap } from './rig/library.ts';

export interface GroundPlayer { app: Appearance; eq?: Equipped }

export interface GroundSpec {
  kit: Kit;
  players: GroundPlayer[];
  coach: Appearance;
  levels: { stadium: number; balls: number; coach: number };
  tifo: boolean;
  /** Varies who does what and where, so each visit looks a little different. */
  seed: number;
}

type Pose = 'juggle' | 'kick' | 'jog' | 'header' | 'idle';
const POSES: Pose[] = ['kick', 'juggle', 'jog', 'header', 'idle'];
// Spots on the practice pitch: [x, z, facing].
// The club's name sits bottom-left over the image, so the squad works centre-right.
const SPOTS: [number, number, number][] = [[1.6, 2.2, -0.7], [4.4, -0.6, -2.2], [7.2, 3.0, -2.6], [2.6, 5.2, 2.6], [9.4, 0.4, -1.4], [-1.6, -1.4, 0.9]];

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

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

/** Mown practice grass with a box and worn patches where the drills happen. */
function grass() {
  const S = 16;
  const W = 70;
  const H = 50;
  return canvasTex(W * S, H * S, (g) => {
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? '#3c9a3e' : '#45a646';
      g.fillRect((i * W * S) / 14, 0, (W * S) / 14 + 1, H * S);
    }
    const img = g.getImageData(0, 0, W * S, H * S);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      img.data[i] += n * 0.5;
      img.data[i + 1] += n;
      img.data[i + 2] += n * 0.4;
    }
    g.putImageData(img, 0, 0);
    const X = (x: number) => (x + W / 2) * S;
    const Z = (z: number) => (z + H / 2) * S;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 0.12 * S;
    g.strokeRect(X(-20), Z(-16), 40 * S, 16 * S);
    g.strokeRect(X(-9), Z(-16), 18 * S, 5.5 * S);
    g.beginPath();
    g.moveTo(X(-35), Z(-16));
    g.lineTo(X(35), Z(-16));
    g.stroke();
    for (const [x, z, r] of [[-4, 1, 2.6], [2, -2, 3], [6, 3, 2.2]]) {
      const grd = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * S);
      grd.addColorStop(0, 'rgba(150,128,72,0.3)');
      grd.addColorStop(1, 'rgba(150,128,72,0)');
      g.fillStyle = grd;
      g.fillRect(X(x - r), Z(z - r), r * 2 * S, r * 2 * S);
    }
  });
}

function skyTexture() {
  return canvasTex(8, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#2d5fb4');
    grd.addColorStop(0.55, '#9ec0e6');
    grd.addColorStop(0.8, '#ffd9a6');
    grd.addColorStop(1, '#f3b27a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 256);
  });
}

function ballTexture() {
  return canvasTex(128, 64, (g) => {
    g.fillStyle = '#f6f6f0';
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#17191c';
    for (let i = 0; i < 6; i++) {
      for (const [y, r] of [[32, 6], [12, 5], [52, 5]] as const) {
        const x = i * 22 + (y === 32 ? 5 : 16);
        g.beginPath();
        for (let k = 0; k < 5; k++) {
          const an = (k / 5) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
        }
        g.fill();
      }
    }
  });
}

/** Stand behind the far goal: more tiers with each stadium level. */
function stand(scene: THREE.Scene, lv: number, kit: Kit, tifo: boolean, track: <T extends { dispose(): void }>(x: T) => T) {
  const concrete = track(new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.9 }));
  const seat = track(new THREE.MeshStandardMaterial({ color: kit.primary, roughness: 0.6 }));
  const seat2 = track(new THREE.MeshStandardMaterial({ color: kit.secondary, roughness: 0.6 }));
  const tiers = 1 + Math.ceil(lv / 1.5);
  const width = 34 + lv * 6;
  for (let i = 0; i < tiers; i++) {
    const step = new THREE.Mesh(track(new THREE.BoxGeometry(width, 0.9, 1.6)), i % 3 === 2 ? seat2 : seat);
    step.position.set(0, 0.45 + i * 0.9, -27 - i * 1.6);
    step.castShadow = step.receiveShadow = true;
    scene.add(step);
  }
  const back = new THREE.Mesh(track(new THREE.BoxGeometry(width, tiers * 0.9 + 1.4, 0.6)), concrete);
  back.position.set(0, (tiers * 0.9 + 1.4) / 2, -27.9 - tiers * 1.6);
  scene.add(back);
  if (lv >= 2) {
    // A roof over the stand.
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(width + 1, 0.25, tiers * 1.6 + 2.4)), track(new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.5, metalness: 0.4 })));
    roof.position.set(0, tiers * 0.9 + 2.4, -27.2 - (tiers * 1.6) / 2);
    roof.castShadow = true;
    scene.add(roof);
  }
  if (tifo) {
    const banner = new THREE.Mesh(track(new THREE.PlaneGeometry(16, Math.max(2.4, tiers * 0.8))), track(new THREE.MeshStandardMaterial({
      map: track(canvasTex(512, 96, (g) => {
        const grd = g.createLinearGradient(0, 0, 512, 0);
        grd.addColorStop(0, kit.primary);
        grd.addColorStop(0.5, kit.secondary);
        grd.addColorStop(1, kit.primary);
        g.fillStyle = grd;
        g.fillRect(0, 0, 512, 96);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        for (let x = -96; x < 512; x += 48) { g.beginPath(); g.moveTo(x, 96); g.lineTo(x + 48, 0); g.lineTo(x + 72, 0); g.lineTo(x + 24, 96); g.fill(); }
      })),
      roughness: 0.8,
    })));
    banner.position.set(0, 0.5 + tiers * 0.45, -26.9 - tiers * 0.8);
    banner.rotation.x = -0.5;
    scene.add(banner);
  }
  if (lv >= 3) {
    const pole = track(new THREE.MeshStandardMaterial({ color: 0x5b6168, roughness: 0.6, metalness: 0.5 }));
    const lamp = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 1.4 }));
    for (const x of [-width / 2 - 3, width / 2 + 3]) {
      const p = new THREE.Mesh(track(new THREE.CylinderGeometry(0.22, 0.32, 18, 8)), pole);
      p.position.set(x, 9, -25);
      p.castShadow = true;
      scene.add(p);
      const head = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 1.6, 0.4)), lamp);
      head.position.set(x, 18.4, -25);
      head.rotation.x = 0.35;
      scene.add(head);
    }
  }
}

function goal(scene: THREE.Scene, z: number, w: number, h: number, track: <T extends { dispose(): void }>(x: T) => T) {
  const white = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
  const r = w > 4 ? 0.06 : 0.04;
  const post = track(new THREE.CylinderGeometry(r, r, h, 10));
  for (const x of [-w / 2, w / 2]) {
    const m = new THREE.Mesh(post, white);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    scene.add(m);
  }
  const bar = new THREE.Mesh(track(new THREE.CylinderGeometry(r, r, w, 10)), white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, h, z);
  bar.castShadow = true;
  scene.add(bar);
  const net = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, h * 0.8)), track(new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 1, side: THREE.DoubleSide, depthWrite: false })));
  net.position.set(0, h / 2, z - h * 0.4);
  scene.add(net);
}

function trees(scene: THREE.Scene, rnd: () => number, track: <T extends { dispose(): void }>(x: T) => T) {
  const leaf = track(new THREE.MeshStandardMaterial({ color: 0x2f5a2a, roughness: 1 }));
  const leaf2 = track(new THREE.MeshStandardMaterial({ color: 0x3b6a2e, roughness: 1 }));
  const trunk = track(new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }));
  const crown = track(new THREE.IcosahedronGeometry(1, 1));
  const stem = track(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6));
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (26 + rnd() * 16);
    const z = -30 + rnd() * 34;
    const s = 2.2 + rnd() * 2;
    const t = new THREE.Mesh(stem, trunk);
    t.position.set(x, 1.2, z);
    scene.add(t);
    const c = new THREE.Mesh(crown, rnd() < 0.5 ? leaf : leaf2);
    c.scale.set(s, s * 1.25, s);
    c.position.set(x, 2.2 + s, z);
    c.castShadow = true;
    scene.add(c);
  }
}

/** Shapes one figure's frame: a pose, a jog stride, or simply standing. */
function settle(f: Figure, pose: Pose, rnd: () => number) {
  const dt = 1 / 30;
  if (pose === 'jog') {
    const h = f.root.rotation.y;
    f.walkTo(f.root.position.x + Math.sin(h) * 30, f.root.position.z + Math.cos(h) * 30, undefined, 4.2);
    const n = 40 + Math.floor(rnd() * 12);
    for (let i = 0; i < n; i++) f.animate(dt, f.stepWalk(dt));
    return;
  }
  if (pose === 'juggle' || pose === 'kick' || pose === 'header') f.pose = pose;
  f.poseK = pose === 'kick' ? 0.42 : pose === 'header' ? 0.5 : 0.3 + rnd() * 1.4;
  for (let i = 0; i < 24; i++) f.animate(dt, 0);
}

/** Renders the training ground still and returns it as an image URL. */
export async function renderClubGround(spec: GroundSpec, w: number, h: number): Promise<string> {
  await Promise.all([loadCharacters(), loadMocap(`${import.meta.env.BASE_URL}anims/mocap.json`)]);
  const rnd = rand(spec.seed);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = track(skyTexture());
  const pmrem = track(new THREE.PMREMGenerator(renderer));
  scene.environment = track(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
  scene.environmentIntensity = 0.4;
  scene.fog = new THREE.Fog(0xf0d4b0, 40, 120);

  const sun = new THREE.DirectionalLight(0xffe0b0, 3.1);
  sun.position.set(-18, 16, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 18, bottom: -18, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x3a5a2a, 0.75));

  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(70, 50)), track(new THREE.MeshStandardMaterial({ map: track(grass()), roughness: 0.95 })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -8;
  ground.receiveShadow = true;
  scene.add(ground);
  const outer = new THREE.Mesh(track(new THREE.PlaneGeometry(400, 400)), track(new THREE.MeshStandardMaterial({ color: 0x4d7a38, roughness: 1 })));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  outer.receiveShadow = true;
  scene.add(outer);

  stand(scene, spec.levels.stadium, spec.kit, spec.tifo, track);
  trees(scene, rnd, track);
  goal(scene, -24, 7.32, 2.44, track);
  goal(scene, -3.5, 2.4, 1.1, track);

  // Cones and poles laid out for the drills.
  const coneMat = track(new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.55 }));
  const coneGeo = track(new THREE.ConeGeometry(0.16, 0.34, 12));
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(coneGeo, coneMat);
    c.position.set(-4 + i * 1.6, 0.17, 7.4 + (i % 2) * 0.5);
    c.castShadow = true;
    scene.add(c);
  }
  const poleMat = track(new THREE.MeshStandardMaterial({ color: spec.kit.secondary, roughness: 0.5 }));
  const poleGeo = track(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6));
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(poleGeo, poleMat);
    p.position.set(11.5 + (i % 2) * 0.8, 0.8, -5 + i * 1.6);
    p.castShadow = true;
    scene.add(p);
  }
  // Balls: more of them, and a proper cart, as the kit room improves.
  const ballMat = track(new THREE.MeshStandardMaterial({ map: track(ballTexture()), roughness: 0.4 }));
  const ballGeo = track(new THREE.SphereGeometry(0.11, 16, 12));
  const balls = 4 + spec.levels.balls * 3;
  for (let i = 0; i < balls; i++) {
    const b = new THREE.Mesh(ballGeo, ballMat);
    b.position.set(-6 + rnd() * 20, 0.11, -6 + rnd() * 13);
    b.rotation.set(rnd() * 6, rnd() * 6, 0);
    b.castShadow = true;
    scene.add(b);
  }
  if (spec.levels.balls >= 2) {
    const cart = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.5, 0.6)), track(new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.6, metalness: 0.4 })));
    cart.position.set(-3.4, 0.45, 4.2);
    cart.castShadow = true;
    scene.add(cart);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(ballGeo, ballMat);
      b.position.set(-3.7 + (i % 3) * 0.28, 0.78, 4.06 + Math.floor(i / 3) * 0.28);
      scene.add(b);
    }
  }

  // The squad at work.
  const figs: Figure[] = [];
  const order = [...POSES].sort(() => rnd() - 0.5);
  const spots = [...SPOTS].sort(() => rnd() - 0.5);
  spec.players.slice(0, 5).forEach((p, i) => {
    const f = new Figure(spec.kit, p.app, false, GK_KITS[0], p.eq, { base: false, detail: 'mid', seed: spec.seed + i });
    const [x, z, yaw] = spots[i];
    f.root.position.set(x, 0, z);
    f.root.rotation.y = yaw;
    f.heading = yaw;
    figs.push(f);
    (f as Figure & { _pose: Pose })._pose = order[i % order.length];
  });
  // The head coach watches from the touchline in the club's training top.
  const coach = new Figure({ primary: '#1f252d', secondary: spec.kit.primary }, spec.coach, false, GK_KITS[0], undefined, { base: false, detail: 'mid', seed: spec.seed ^ 77 });
  coach.root.position.set(-2.4, 0, 6.4);
  coach.root.rotation.y = 2.4;
  coach.heading = 2.4;
  await Promise.all([...figs, coach].map((f) => f.ready));
  for (const f of figs) {
    settle(f, (f as Figure & { _pose: Pose })._pose, rnd);
    scene.add(f.root);
  }
  settle(coach, 'idle', rnd);
  scene.add(coach.root);
  // A ball at the feet of whoever is juggling or shooting.
  for (const f of figs) {
    const pose = (f as Figure & { _pose: Pose })._pose;
    if (pose !== 'juggle' && pose !== 'kick' && pose !== 'header') continue;
    const b = new THREE.Mesh(ballGeo, ballMat);
    const hgt = pose === 'header' ? 1.95 : pose === 'juggle' ? 0.7 + rnd() * 0.5 : 0.12;
    const h0 = f.root.rotation.y;
    b.position.set(f.root.position.x + Math.sin(h0) * 0.45, hgt, f.root.position.z + Math.cos(h0) * 0.45);
    b.castShadow = true;
    scene.add(b);
  }

  const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 400);
  camera.position.set(3.6, 2.6, 13.5);
  camera.lookAt(3.4, 1.2, -1);
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/jpeg', 0.86);

  for (const f of [...figs, coach]) scene.remove(f.root);
  for (const d of disposables) d.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}
