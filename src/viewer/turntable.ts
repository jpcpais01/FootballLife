// Small 3D stage that shows your player on a podium, used by the locker
// and shop to preview gear, and standing on a lit floor in the home spotlight.
// Drag to spin; it slowly turns on its own.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Appearance } from '../../shared/appearance.ts';
import type { Equipped } from '../../shared/cosmetics.ts';
import { Figure, GK_KITS, SHOWCASE_SCALE, type Kit } from './figures.ts';

export interface Turntable {
  set(app: Appearance, eq: Equipped, kit: Kit, keeper?: boolean): void;
  celebrate(): void;
  /** Resolves once the first player is standing on the stage. */
  shown: Promise<void>;
  /** Frames the face (for the look studio) or the whole player. */
  focus(mode: 'face' | 'body'): void;
  /** Moves the canvas into a new container (after the page re-renders). */
  attach(host: HTMLElement): void;
  /** Stops rendering and takes the canvas off the page, keeping it ready for the next visit. */
  park(): void;
  dispose(): void;
}

export interface TurntableOpts {
  /** podium: the glossy shop stand. floor: he stands on the ground in a pool of light. */
  stage?: 'podium' | 'floor';
  /** Drag to spin. Off where the stage sits in a swipeable row; a tap celebrates instead. */
  drag?: boolean;
  /** Rim light and floor glow colour. */
  accent?: string;
  /** Off the pitch: he wears his casual outfit instead of the kit. */
  casual?: boolean;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createTurntable(initialHost: HTMLElement, opts: TurntableOpts = {}): Turntable {
  const floor = opts.stage === 'floor';
  const drag = opts.drag ?? true;
  const accent = new THREE.Color(opts.accent ?? '#c6ff3d');
  let host = initialHost;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.cssText = `width:100%;height:100%;display:block;${drag ? 'touch-action:pan-y;cursor:grab' : 'cursor:pointer'}`;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 2.9, 10.2);
  camera.lookAt(0, 1.55, 0);

  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(accent, 1.6);
  rim.position.set(-4, 3, -4);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1f24, 0.5));

  const stage = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  if (floor) {
    // No stand: his shadow falls on an invisible floor inside a soft pool of light.
    rim.intensity = 2.2;
    const kick = new THREE.DirectionalLight(accent, 1.1);
    kick.position.set(4, 2, -3);
    scene.add(kick);
    const catcher = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.ShadowMaterial({ opacity: 0.5 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.receiveShadow = true;
    const tex = glowTexture();
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshBasicMaterial({ map: tex, color: accent, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -0.002;
    stage.add(pool, catcher);
    disposables.push(tex, catcher.geometry, catcher.material, pool.geometry, pool.material);
  } else {
    // Podium: a glossy dark puck with a lime ring.
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.24, 64), new THREE.MeshPhysicalMaterial({ color: 0x15191d, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }));
    puck.position.y = -0.12;
    puck.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: accent }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    stage.add(puck, ring);
  }
  scene.add(stage);

  let markShown = () => {};
  const shown = new Promise<void>((r) => (markShown = r));
  let fig: Figure | null = null;
  let coming: Figure | null = null;
  let figKey = '';
  let spin = 0.4;
  let yaw = 0.35;
  let dragging = false;
  let lastX = 0;
  let celebrateUntil = 0;
  // Camera framing: 0 = whole player, 1 = close on the face.
  let zoom = 0;
  let zoomTo = 0;
  const camBody = { pos: new THREE.Vector3(0, 2.9, 10.2), look: new THREE.Vector3(0, 1.55, 0) };
  const eye = new THREE.Vector3();
  const eyeS = new THREE.Vector3();
  const camFace = { pos: new THREE.Vector3(0, 2.98, 2.75), look: new THREE.Vector3(0, 2.8, 0) };
  const look = new THREE.Vector3();

  const onDown = (e: PointerEvent) => {
    if (!drag) return;
    dragging = true;
    lastX = e.clientX;
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    yaw += dx * 0.012;
    spin = dx * 0.6;
  };
  const onUp = () => {
    dragging = false;
    renderer.domElement.style.cursor = 'grab';
  };
  const onTap = () => { celebrateUntil = clock.getElapsed() + 3.6; };
  if (!drag) renderer.domElement.addEventListener('click', onTap);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  const resize = () => {
    const w = host.clientWidth || 300;
    const h = host.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const clock = new THREE.Timer();
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.getElapsed();
    if (!dragging) {
      if (zoomTo > 0.5) {
        // Close up, ease back to a three-quarter view of the face with a gentle sway.
        spin *= 1 - Math.min(1, dt * 3);
        const target = 0.28 * Math.sin(time * 0.5);
        const d = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
        yaw += spin * dt + d * Math.min(1, dt * 2.2);
      } else {
        spin += (0.4 - spin) * Math.min(1, dt * 1.5);
        yaw += spin * dt;
      }
    }
    if (fig) {
      fig.root.rotation.y = yaw;
      const celebrating = time < celebrateUntil;
      fig.celebrate = celebrating ? 1 : 0;
      fig.star = celebrating;
      fig.animate(dt, 0, time);
      // The close-up follows the face as the idle sways it, gently.
      fig.eyes(eye);
      eyeS.lerp(eye.setY(eye.y - 0.02), eyeS.lengthSq() ? Math.min(1, dt * 3) : 1);
      camFace.look.copy(eyeS);
      camFace.pos.set(eyeS.x, eyeS.y + 0.12, eyeS.z + 1.95);
    }
    zoom += (zoomTo - zoom) * Math.min(1, dt * 4);
    const k = zoom * zoom * (3 - 2 * zoom);
    camera.position.lerpVectors(camBody.pos, camFace.pos, k);
    camera.lookAt(look.lerpVectors(camBody.look, camFace.look, k));
    renderer.render(scene, camera);
  };
  loop();

  return {
    shown,
    set(app, eq, kit, keeper = false) {
      // Same kit and gear: he changes his look in place, without a pause or a restart of his idle.
      const key = JSON.stringify([kit, eq ?? null, keeper]);
      const cur = coming ?? fig;
      if (cur && key === figKey) {
        void cur.restyle(app);
        return;
      }
      figKey = key;
      const fo = { scale: SHOWCASE_SCALE, detail: 'mid' as const, base: !floor, casual: opts.casual };
      const next = new Figure(kit, app, keeper, GK_KITS[0], eq, fo);
      next.onStand = true;
      coming = next;
      // The old player stays on the stand until the new one is ready.
      void next.ready.then(() => {
        if (coming !== next) return;
        coming = null;
        next.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        if (fig) {
          scene.remove(fig.root);
          next.root.rotation.y = yaw;
        }
        fig = next;
        scene.add(fig.root);
        markShown();
      });
    },
    attach(next) {
      if (next === host && raf) return;
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
      renderer.domElement.remove();
    },
    focus(mode) {
      zoomTo = mode === 'face' ? 1 : 0;
    },
    celebrate() {
      celebrateUntil = clock.getElapsed() + 3.6;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointerup', onUp);
      renderer.dispose();
      env.dispose();
      pmrem.dispose();
      for (const d of disposables) d.dispose();
      renderer.domElement.remove();
    },
  };
}
