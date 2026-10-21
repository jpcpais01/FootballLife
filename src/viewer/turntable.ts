// Small 3D stage that shows your toy figure on a podium, used by the locker
// and shop to preview gear. Drag to spin; it slowly turns on its own.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Appearance } from '../../shared/appearance.ts';
import type { Equipped } from '../../shared/cosmetics.ts';
import { Figure, GK_KITS, type Kit } from './figures.ts';

export interface Turntable {
  set(app: Appearance, eq: Equipped, kit: Kit, keeper?: boolean): void;
  celebrate(): void;
  /** Moves the canvas into a new container (after the page re-renders). */
  attach(host: HTMLElement): void;
  dispose(): void;
}

export function createTurntable(initialHost: HTMLElement): Turntable {
  let host = initialHost;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
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
  const rim = new THREE.DirectionalLight(0xc6ff3d, 1.6);
  rim.position.set(-4, 3, -4);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1f24, 0.5));

  // Podium: a glossy dark puck with a lime ring.
  const podium = new THREE.Group();
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.24, 64), new THREE.MeshPhysicalMaterial({ color: 0x15191d, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }));
  puck.position.y = -0.12;
  puck.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: 0xc6ff3d }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.005;
  podium.add(puck, ring);
  scene.add(podium);

  let fig: Figure | null = null;
  let spin = 0.4;
  let yaw = 0.35;
  let dragging = false;
  let lastX = 0;
  let celebrateUntil = 0;

  const onDown = (e: PointerEvent) => {
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
      spin += (0.4 - spin) * Math.min(1, dt * 1.5);
      yaw += spin * dt;
    }
    if (fig) {
      fig.root.rotation.y = yaw;
      const celebrating = time < celebrateUntil;
      fig.celebrate = celebrating ? 1 : 0;
      fig.star = celebrating;
      fig.animate(dt, 0, time);
    }
    renderer.render(scene, camera);
  };
  loop();

  return {
    set(app, eq, kit, keeper = false) {
      if (fig) scene.remove(fig.root);
      fig = new Figure(kit, app, keeper, GK_KITS[0], eq);
      fig.root.scale.setScalar(1.45);
      fig.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      scene.add(fig.root);
    },
    attach(next) {
      if (next === host) return;
      host = next;
      host.appendChild(renderer.domElement);
      ro.disconnect();
      ro.observe(host);
      resize();
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
      renderer.domElement.remove();
    },
  };
}
