// Renders head-and-shoulders shots of the 3D player for every portrait in the
// UI. One small offscreen renderer is shared; each shot is baked to an image.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Appearance } from '../../shared/appearance.ts';
import type { Equipped } from '../../shared/cosmetics.ts';
import { loadCharacters } from './character/body.ts';
import { Figure, GK_KITS, SHOWCASE_SCALE, type Kit } from './figures.ts';

/** Portraits wait for the character bundle. */
export const portraitsReady = loadCharacters;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let rim: THREE.DirectionalLight;
const out = document.createElement('canvas');

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  // Neutral keeps darker skin tones rich instead of crushing them.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.1;
  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.2, 4.5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 1.1);
  fill.position.set(-3, 2, 3);
  scene.add(fill);
  rim = new THREE.DirectionalLight(0xffffff, 1.2);
  rim.position.set(-2, 3.5, -3.5);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xeef3ff, 0x6a6a6a, 1.0));
  camera = new THREE.PerspectiveCamera(22, 1, 0.1, 20);
}

const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

const eye = new THREE.Vector3();

export interface PortraitOpts { yaw?: number; keeper?: boolean; full?: boolean; casual?: boolean }

/**
 * Renders one portrait and returns it as an image URL. The player is painted
 * off the main thread and built between frames, so the page never stalls on it.
 */
export async function renderPortrait(app: Appearance, kit: Kit, eq: Equipped | undefined, px: number, opts: PortraitOpts = {}): Promise<string> {
  const fig = new Figure(kit, app, !!opts.keeper, GK_KITS[0], eq, { base: false, scale: SHOWCASE_SCALE, detail: px > 200 ? 'mid' : 'low', casual: !!opts.casual });
  await fig.ready;
  if (!renderer) setup();
  const r = renderer!;
  r.setSize(px, px, false);
  fig.root.rotation.y = opts.yaw ?? 0.32;
  fig.animate(0, 0, 0);
  scene.add(fig.root);
  rim.color.set(kit.secondary);
  if (opts.full) {
    camera.position.set(0, 2.1, 9.4);
    camera.lookAt(0, 1.62, 0);
  } else {
    // Head and shoulders, framed on the eyes wherever the pose puts them.
    const e = fig.eyes(eye);
    camera.position.set(e.x, e.y + 0.08, e.z + 2.2);
    camera.lookAt(e.x, e.y - 0.07, e.z);
  }
  r.render(scene, camera);
  scene.remove(fig.root);

  // Bake onto a backdrop in the club's colours.
  out.width = out.height = px;
  const g = out.getContext('2d')!;
  const bg = g.createRadialGradient(px * 0.5, px * 0.3, px * 0.05, px * 0.5, px * 0.45, px * 0.75);
  bg.addColorStop(0, shade(kit.primary, 1.25));
  bg.addColorStop(1, shade(kit.primary, 0.42));
  g.fillStyle = bg;
  g.fillRect(0, 0, px, px);
  g.drawImage(r.domElement, 0, 0, px, px);
  return out.toDataURL('image/jpeg', 0.9);
}
