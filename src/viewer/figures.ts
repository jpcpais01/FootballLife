// Toy footballers: glossy plastic figures standing on Subbuteo-style bases.
import * as THREE from 'three';
import { BOOT_COLORS, HAIR_COLORS, SKIN_TONES, type Appearance } from '../../shared/appearance.ts';

export interface Kit {
  primary: string;
  secondary: string;
}

const SCALE = 1.45;

const geo = {
  base: new THREE.CylinderGeometry(0.55, 0.62, 0.12, 28),
  ring: new THREE.RingGeometry(0.72, 0.9, 40),
  torso: new THREE.CapsuleGeometry(0.27, 0.42, 6, 14),
  shorts: new THREE.CylinderGeometry(0.29, 0.31, 0.3, 14),
  leg: new THREE.CapsuleGeometry(0.095, 0.5, 4, 10),
  sock: new THREE.CylinderGeometry(0.105, 0.1, 0.32, 10),
  boot: new THREE.BoxGeometry(0.15, 0.1, 0.28),
  arm: new THREE.CapsuleGeometry(0.075, 0.42, 4, 10),
  head: new THREE.SphereGeometry(0.25, 24, 18),
  hair: new THREE.SphereGeometry(0.262, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
  hairLong: new THREE.SphereGeometry(0.27, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.72),
  afro: new THREE.SphereGeometry(0.34, 20, 14),
  nose: new THREE.SphereGeometry(0.045, 8, 6),
  eye: new THREE.SphereGeometry(0.03, 8, 6),
};
geo.ring.rotateX(-Math.PI / 2);

const matCache = new Map<string, THREE.Material>();
function plastic(color: string | number, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}): THREE.MeshPhysicalMaterial {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = matCache.get(key) as THREE.MeshPhysicalMaterial | undefined;
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.28, ...opts });
    matCache.set(key, m);
  }
  return m;
}

export class Figure {
  root = new THREE.Group();
  body = new THREE.Group();
  private legL: THREE.Group;
  private legR: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  ring: THREE.Mesh;
  phase = Math.random() * 10;
  pos = new THREE.Vector2();
  vel = new THREE.Vector2();
  heading = 0;
  visible = true;
  celebrate = 0;

  constructor(kit: Kit, app: Appearance, isKeeper: boolean, gkKit: Kit) {
    const k = isKeeper ? gkKit : kit;
    const shirt = plastic(k.primary);
    const trim = plastic(k.secondary);
    const skin = plastic(SKIN_TONES[app.skin] ?? SKIN_TONES[1], { clearcoat: 0.3, roughness: 0.55 });
    const hairM = plastic(HAIR_COLORS[app.hairColor] ?? HAIR_COLORS[0], { roughness: 0.7, clearcoat: 0.1 });
    const bootM = plastic(BOOT_COLORS[app.boots] ?? BOOT_COLORS[0], { roughness: 0.3, clearcoat: 1 });
    const dark = plastic(0x14110f, { clearcoat: 1, roughness: 0.2 });

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = true;
      return x;
    };

    // Base (team-coloured puck) and a selection ring.
    const base = mesh(geo.base, trim);
    base.position.y = 0.06;
    base.receiveShadow = true;
    this.root.add(base);
    this.ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: 0xc6ff3d, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.position.y = 0.03;
    this.root.add(this.ring);

    this.body.position.y = 0.12;
    this.root.add(this.body);

    const hip = 0.92;
    const mkLeg = (side: number) => {
      const g = new THREE.Group();
      g.position.set(side * 0.13, hip, 0);
      const leg = mesh(geo.leg, skin);
      leg.position.y = -0.36;
      const sock = mesh(geo.sock, trim);
      sock.position.y = -0.58;
      const boot = mesh(geo.boot, bootM);
      boot.position.set(0, -0.82, 0.05);
      g.add(leg, sock, boot);
      this.body.add(g);
      return g;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    const shorts = mesh(geo.shorts, isKeeper ? plastic(0x1b1b1b) : trim);
    shorts.position.y = hip + 0.05;
    this.body.add(shorts);
    const torso = mesh(geo.torso, shirt);
    torso.position.y = hip + 0.46;
    torso.scale.set(1.08, 1, 0.78);
    this.body.add(torso);
    // Collar trim.
    const collar = mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 20), trim);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = hip + 0.79;
    this.body.add(collar);

    const mkArm = (side: number) => {
      const g = new THREE.Group();
      g.position.set(side * 0.36, hip + 0.68, 0);
      const arm = mesh(geo.arm, isKeeper ? shirt : skin);
      arm.position.y = -0.24;
      const sleeve = mesh(new THREE.CapsuleGeometry(0.09, 0.12, 4, 10), shirt);
      sleeve.position.y = -0.06;
      g.add(arm, sleeve);
      g.rotation.z = side * 0.12;
      this.body.add(g);
      return g;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    const head = new THREE.Group();
    head.position.y = hip + 1.07;
    const skull = mesh(geo.head, skin);
    skull.scale.set(1, 1.06, 1);
    head.add(skull);
    const nose = mesh(geo.nose, skin);
    nose.position.set(0, -0.02, 0.245);
    head.add(nose);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(geo.eye, dark);
      eye.position.set(sx * 0.085, 0.04, 0.225);
      head.add(eye);
    }
    // Hair styles: 0 buzz,1 short,2 crop,3 quiff,4 curls,5 afro,6 long,7 bun,8 mohawk,9 bald
    const h = app.hair;
    if (h === 5) {
      const af = mesh(geo.afro, hairM);
      af.position.set(0, 0.1, -0.03);
      head.add(af);
    } else if (h === 6) {
      const hl = mesh(geo.hairLong, hairM);
      hl.position.y = 0.02;
      hl.rotation.x = -0.35;
      head.add(hl);
    } else if (h === 8) {
      const mo = mesh(new THREE.BoxGeometry(0.08, 0.14, 0.42), hairM);
      mo.position.set(0, 0.25, -0.02);
      head.add(mo);
    } else if (h !== 9) {
      const hs = mesh(geo.hair, hairM);
      hs.position.y = h === 0 ? 0.0 : 0.02;
      hs.rotation.x = -0.25;
      hs.scale.setScalar(h === 0 ? 1 : h === 3 ? 1.06 : 1.03);
      head.add(hs);
      if (h === 3) {
        const q = mesh(new THREE.SphereGeometry(0.11, 12, 8), hairM);
        q.position.set(0, 0.24, 0.12);
        head.add(q);
      }
      if (h === 7) {
        const bun = mesh(new THREE.SphereGeometry(0.1, 12, 8), hairM);
        bun.position.set(0, 0.27, -0.1);
        head.add(bun);
      }
      if (h === 4) {
        for (let i = 0; i < 9; i++) {
          const c = mesh(new THREE.SphereGeometry(0.075, 8, 6), hairM);
          const a = (i / 9) * Math.PI * 2;
          c.position.set(Math.cos(a) * 0.18, 0.18, Math.sin(a) * 0.18 - 0.02);
          head.add(c);
        }
      }
    }
    this.body.add(head);
    this.root.scale.setScalar(SCALE);
  }

  /** Advances the run cycle. `speed` in m/s. */
  animate(dt: number, speed: number, time: number) {
    const run = Math.min(1, speed / 7);
    this.phase += dt * (4 + speed * 1.15);
    const sw = Math.sin(this.phase) * (0.15 + run * 0.85);
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.8;
    this.armR.rotation.x = sw * 0.8;
    this.body.position.y = 0.12 + Math.abs(Math.cos(this.phase)) * 0.07 * run;
    this.body.rotation.x = run * 0.16;
    if (this.celebrate > 0) {
      // Arms up, little hops.
      this.armL.rotation.x = -2.6 + Math.sin(time * 9) * 0.25;
      this.armR.rotation.x = -2.6 + Math.cos(time * 9) * 0.25;
      this.body.position.y = 0.12 + Math.abs(Math.sin(time * 7 + this.phase)) * 0.25;
    } else {
      // Idle breathing.
      this.body.rotation.z = Math.sin(time * 1.7 + this.phase) * 0.015;
    }
  }
}

export const GK_KITS: Kit[] = [
  { primary: '#ffb020', secondary: '#1b1b1b' },
  { primary: '#3dd6ff', secondary: '#0b2540' },
];
