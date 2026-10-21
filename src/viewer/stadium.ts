// Procedural toy stadium: striped pitch, LED boards, goals with nets, stands
// packed with an instanced bouncing crowd, floodlight towers and a sky dome.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PL = 105;
export const PW = 68;

export interface StadiumOptions {
  night: boolean;
  home: { primary: string; secondary: string };
  away: { primary: string; secondary: string };
  homeName: string;
  awayName: string;
  crowd: number; // instance count
}

export interface Stadium {
  group: THREE.Group;
  update(time: number, excitement: number): void;
  setCheer(side: 0 | 1 | -1): void;
  dispose(): void;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Pitch surface: mowing stripes, subtle wear and crisp markings. */
function pitchTexture(): THREE.Texture {
  const M = 5; // margin metres
  const W = 2048;
  const s = W / (PL + 2 * M);
  const H = Math.round((PW + 2 * M) * s);
  return canvasTex(W, H, (g) => {
    const X = (m: number) => (m + PL / 2 + M) * s;
    const Y = (m: number) => (m + PW / 2 + M) * s;
    // Stripes.
    const stripes = 14;
    for (let i = 0; i < stripes + 2; i++) {
      g.fillStyle = i % 2 ? '#2c7f2f' : '#379336';
      g.fillRect(X(-PL / 2 - M + (i * (PL + 2 * M)) / (stripes + 2)), 0, ((PL + 2 * M) / (stripes + 2)) * s + 1, H);
    }
    // Cross-mow (subtle checker).
    g.globalAlpha = 0.06;
    for (let j = 0; j < 10; j++) {
      g.fillStyle = j % 2 ? '#000' : '#fff';
      g.fillRect(0, (j * H) / 10, W, H / 10);
    }
    g.globalAlpha = 1;
    // Speckle / wear.
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      d[i] += n * 0.6;
      d[i + 1] += n;
      d[i + 2] += n * 0.4;
    }
    g.putImageData(img, 0, 0);
    // Goalmouth wear.
    for (const side of [-1, 1]) {
      const grd = g.createRadialGradient(X(side * (PL / 2 - 4)), Y(0), 0, X(side * (PL / 2 - 4)), Y(0), 9 * s);
      grd.addColorStop(0, 'rgba(120,110,60,0.35)');
      grd.addColorStop(1, 'rgba(120,110,60,0)');
      g.fillStyle = grd;
      g.fillRect(X(side * (PL / 2 - 14)) - 20 * s, Y(-12), 40 * s, 24 * s);
    }
    // Lines.
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 0.13 * s;
    const rect = (x0: number, y0: number, x1: number, y1: number) => g.strokeRect(X(x0), Y(y0), (x1 - x0) * s, (y1 - y0) * s);
    rect(-PL / 2, -PW / 2, PL / 2, PW / 2);
    g.beginPath(); g.moveTo(X(0), Y(-PW / 2)); g.lineTo(X(0), Y(PW / 2)); g.stroke();
    g.beginPath(); g.arc(X(0), Y(0), 9.15 * s, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.92)';
    const dot = (x: number, y: number) => { g.beginPath(); g.arc(X(x), Y(y), 0.22 * s, 0, Math.PI * 2); g.fill(); };
    dot(0, 0);
    for (const sd of [-1, 1]) {
      const gl = (sd * PL) / 2;
      rect(Math.min(gl, gl - sd * 16.5), -20.16, Math.max(gl, gl - sd * 16.5), 20.16);
      rect(Math.min(gl, gl - sd * 5.5), -9.16, Math.max(gl, gl - sd * 5.5), 9.16);
      dot(gl - sd * 11, 0);
      // D arc.
      const a = Math.acos(5.5 / 9.15);
      g.beginPath();
      if (sd > 0) g.arc(X(gl - 11), Y(0), 9.15 * s, Math.PI - a, Math.PI + a);
      else g.arc(X(gl + 11), Y(0), 9.15 * s, -a, a);
      g.stroke();
      for (const cy of [-1, 1]) {
        g.beginPath();
        g.arc(X(gl), Y((cy * PW) / 2), 1 * s, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
}

function noiseTex(size = 256): THREE.Texture {
  const t = canvasTex(size, size, (g) => {
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function boardTexture(o: StadiumOptions) {
  const t = canvasTex(2048, 64, (g) => {
    const items = ['FOOTBALLIFE', o.homeName.toUpperCase(), 'LIVE', o.awayName.toUpperCase(), 'YOUR CAREER STARTS HERE'];
    const colors = ['#c6ff3d', o.home.primary, '#ffffff', o.away.primary, '#c6ff3d'];
    let x = 0;
    let k = 0;
    while (x < 2048) {
      const txt = items[k % items.length];
      const col = colors[k % colors.length];
      const w = 340;
      g.fillStyle = k % 2 ? '#0b0e10' : '#14181c';
      g.fillRect(x, 0, w, 64);
      g.fillStyle = col;
      g.font = 'italic 800 38px "Barlow Condensed", Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, x + w / 2, 34, w - 20);
      x += w;
      k++;
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function netTexture() {
  const t = canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
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

function goal(dir: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  const W = 7.32;
  const H = 2.44;
  const D = 2.2;
  const post = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const r = 0.07;
  const cyl = (len: number) => new THREE.CylinderGeometry(r, r, len, 14);
  const p1 = new THREE.Mesh(cyl(H), post); p1.position.set(0, H / 2, -W / 2);
  const p2 = new THREE.Mesh(cyl(H), post); p2.position.set(0, H / 2, W / 2);
  const bar = new THREE.Mesh(cyl(W + r * 2), post); bar.rotation.x = Math.PI / 2; bar.position.set(0, H, 0);
  for (const m of [p1, p2, bar]) { m.castShadow = true; g.add(m); }
  const netTex = netTexture();
  const netMat = new THREE.MeshStandardMaterial({ map: netTex, alphaMap: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, color: 0xf2f2f2 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), netMat.clone());
  (back.material as THREE.MeshStandardMaterial).map = netTex.clone();
  ((back.material as THREE.MeshStandardMaterial).map as THREE.Texture).repeat.set(W * 3, H * 3);
  (back.material as THREE.MeshStandardMaterial).alphaMap = (back.material as THREE.MeshStandardMaterial).map;
  back.rotation.y = Math.PI / 2;
  back.position.set(D, H / 2 - 0.25, 0);
  back.scale.y = 1.2;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(D, W), netMat.clone());
  ((top.material as THREE.MeshStandardMaterial).map = netTex.clone()).repeat.set(D * 3, W * 3);
  (top.material as THREE.MeshStandardMaterial).alphaMap = (top.material as THREE.MeshStandardMaterial).map;
  top.rotation.x = -Math.PI / 2;
  top.rotation.z = 0.25;
  top.position.set(D / 2, H - 0.12, 0);
  for (const sd of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), netMat.clone());
    ((side.material as THREE.MeshStandardMaterial).map = netTex.clone()).repeat.set(D * 3, H * 3);
    (side.material as THREE.MeshStandardMaterial).alphaMap = (side.material as THREE.MeshStandardMaterial).map;
    side.position.set(D / 2, H / 2, (sd * W) / 2);
    g.add(side);
  }
  g.add(back, top);
  g.position.x = (dir * PL) / 2;
  if (dir < 0) g.rotation.y = Math.PI;
  return g;
}

/** Stepped stand along X, `len` long, rising away from the pitch (toward -Z local). */
function standGeometry(len: number, rows: number, stepD: number, stepH: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let i = 0; i < rows; i++) {
    shape.lineTo(i * stepD, (i + 1) * stepH);
    shape.lineTo((i + 1) * stepD, (i + 1) * stepH);
  }
  shape.lineTo(rows * stepD, 0);
  shape.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  // Shape is in XY (x = depth away from the pitch, y = height), extruded along Z.
  // Rotate so the length runs along X and the depth goes toward -Z.
  geo.rotateY(Math.PI / 2);
  geo.translate(-len / 2, 0, 0);
  return geo;
}

function crowdGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.22, 0.28, 0.75, 6);
  body.translate(0, 0.38, 0);
  const head = new THREE.IcosahedronGeometry(0.17, 0);
  head.translate(0, 0.92, 0);
  // Mark head vertices via a color attribute so the shader can skin-tone them.
  const tag = (g: THREE.BufferGeometry, v: number) => {
    const n = g.attributes.position.count;
    g.setAttribute('part', new THREE.Float32BufferAttribute(new Array(n).fill(v), 1));
    return g;
  };
  const flat = (x: THREE.BufferGeometry) => (x.index ? x.toNonIndexed() : x);
  const g = mergeGeometries([tag(flat(body), 0), tag(flat(head), 1)])!;
  g.computeVertexNormals();
  return g;
}

export function buildStadium(o: StadiumOptions): Stadium {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // Ground around the pitch.
  const groundMat = track(new THREE.MeshStandardMaterial({ color: o.night ? 0x1b2a1a : 0x2c4a2a, roughness: 1 }));
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(180, 140)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // Pitch.
  const ptex = track(pitchTexture());
  const noise = track(noiseTex());
  noise.repeat.set(70, 46);
  const pitchMat = track(new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.92, bumpMap: noise, bumpScale: 0.6, roughnessMap: noise }));
  const pitch = new THREE.Mesh(track(new THREE.PlaneGeometry(PL + 10, PW + 10)), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  // LED boards.
  const btex = track(boardTexture(o));
  const boardMat = track(new THREE.MeshStandardMaterial({ map: btex, emissive: 0xffffff, emissiveMap: btex, emissiveIntensity: o.night ? 1.2 : 0.55, roughness: 0.4 }));
  const boardBack = track(new THREE.MeshStandardMaterial({ color: 0x0c0f12, roughness: 0.6 }));
  const boards: THREE.Texture[] = [];
  const addBoard = (len: number, x: number, z: number, rotY: number) => {
    const tex = btex.clone();
    tex.repeat.set(len / 30, 1);
    tex.needsUpdate = true;
    boards.push(track(tex));
    const mat = boardMat.clone();
    mat.map = tex;
    mat.emissiveMap = tex;
    track(mat);
    const geo = track(new THREE.BoxGeometry(len, 0.9, 0.12));
    const m = new THREE.Mesh(geo, [boardBack, boardBack, boardBack, boardBack, mat, boardBack]);
    m.position.set(x, 0.45, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    group.add(m);
  };
  addBoard(PL + 6, 0, -(PW / 2 + 4), 0);
  addBoard(PL + 6, 0, PW / 2 + 4, Math.PI);
  addBoard(PW - 10, -(PL / 2 + 4), 0, Math.PI / 2);
  addBoard(PW - 10, PL / 2 + 4, 0, -Math.PI / 2);

  // Goals.
  group.add(goal(1), goal(-1));

  // Corner flags.
  const flagMat = track(new THREE.MeshStandardMaterial({ color: 0xc6ff3d, emissive: 0x334400, side: THREE.DoubleSide }));
  const poleMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6)), poleMat);
    pole.position.set((sx * PL) / 2, 0.8, (sz * PW) / 2);
    const flag = new THREE.Mesh(track(new THREE.PlaneGeometry(0.5, 0.35)), flagMat);
    flag.position.set((sx * PL) / 2 + 0.25, 1.4, (sz * PW) / 2);
    pole.castShadow = true;
    group.add(pole, flag);
  }

  // Stands.
  const concrete = track(new THREE.MeshStandardMaterial({ color: o.night ? 0x2a2f36 : 0x9aa3ad, roughness: 0.85 }));
  const seatHome = new THREE.Color(o.home.primary);
  const crowdGeo = track(crowdGeometry());
  const stands: { len: number; rows: number; x: number; z: number; rot: number; cheer: 0 | 1 | -1 }[] = [
    { len: 118, rows: 22, x: 0, z: -(PW / 2 + 9), rot: 0, cheer: -1 },
    { len: 118, rows: 22, x: 0, z: PW / 2 + 9, rot: Math.PI, cheer: -1 },
    { len: 74, rows: 18, x: -(PL / 2 + 9), z: 0, rot: Math.PI / 2, cheer: 0 },
    { len: 74, rows: 18, x: PL / 2 + 9, z: 0, rot: -Math.PI / 2, cheer: 1 },
  ];
  const stepD = 0.85;
  const stepH = 0.48;
  const crowdPositions: { p: THREE.Vector3; rot: number; end: 0 | 1 | -1 }[] = [];
  for (const s of stands) {
    const g = track(standGeometry(s.len, s.rows, stepD, stepH));
    const m = new THREE.Mesh(g, concrete);
    m.position.set(s.x, 0, s.z);
    m.rotation.y = s.rot;
    m.receiveShadow = true;
    group.add(m);
    // Seat strip colour band on the front.
    const band = new THREE.Mesh(track(new THREE.BoxGeometry(s.len, 1.1, 0.2)), track(new THREE.MeshStandardMaterial({ color: seatHome, roughness: 0.5 })));
    band.position.set(0, 0.55, 0.1);
    m.add(band);
    // Roof.
    const roofH = s.rows * stepH + 7;
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(s.len + 4, 0.5, s.rows * stepD * 0.75)), track(new THREE.MeshStandardMaterial({ color: 0x15191d, roughness: 0.6, metalness: 0.3 })));
    roof.position.set(0, roofH, -s.rows * stepD * 0.62);
    roof.rotation.x = 0.12;
    m.add(roof);
    const strip = new THREE.Mesh(track(new THREE.BoxGeometry(s.len, 0.15, 0.4)), track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: o.night ? 0xf4f8ff : 0x222222, emissiveIntensity: o.night ? 3 : 1 })));
    strip.position.set(0, roofH - 0.6, -s.rows * stepD * 0.3);
    m.add(strip);
    // Back wall.
    const wall = new THREE.Mesh(track(new THREE.BoxGeometry(s.len, roofH, 0.6)), concrete);
    wall.position.set(0, roofH / 2, -(s.rows * stepD + 0.3));
    m.add(wall);
    // Crowd spots.
    const local = new THREE.Vector3();
    for (let r = 0; r < s.rows; r++) {
      for (let x = -s.len / 2 + 0.6; x < s.len / 2 - 0.6; x += 0.82) {
        local.set(x + (Math.random() - 0.5) * 0.2, (r + 1) * stepH, -(r * stepD + stepD * 0.5));
        local.applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
        crowdPositions.push({ p: local.clone().add(new THREE.Vector3(s.x, 0, s.z)), rot: s.rot, end: s.cheer });
      }
    }
  }

  // Crowd: instanced toy people, bouncing in a vertex shader.
  const n = Math.min(o.crowd, crowdPositions.length);
  // Shuffle-pick seats so density is even.
  for (let i = crowdPositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [crowdPositions[i], crowdPositions[j]] = [crowdPositions[j], crowdPositions[i]];
  }
  const crowdMat = track(new THREE.MeshStandardMaterial({ roughness: 0.7 }));
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 }, uCheer: { value: -1 } };
  crowdMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float part; attribute float aPhase; attribute float aEnd; attribute vec3 aSkin;
        uniform float uTime; uniform float uExcite; uniform float uCheer; varying float vPart; varying vec3 vSkin;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPart = part; vSkin = aSkin;
        float hype = uExcite * (uCheer < -0.5 || abs(aEnd - uCheer) < 0.1 || aEnd < -0.5 ? 1.0 : 0.25);
        float bob = max(0.0, sin(uTime * (3.0 + hype * 6.0) + aPhase * 6.28)) * (0.04 + hype * 0.45);
        transformed.y += bob;
        if (part > 0.5) transformed.x += sin(uTime * 1.3 + aPhase * 9.0) * 0.03;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vPart; varying vec3 vSkin;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vPart > 0.5) diffuseColor.rgb = vSkin;`);
  };
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, n);
  const phase = new Float32Array(n);
  const endA = new Float32Array(n);
  const skin = new Float32Array(n * 3);
  const SK = ['#f6d7c3', '#e9b994', '#d39a6a', '#b07548', '#8a5530', '#5e3a20'].map((c) => new THREE.Color(c));
  const homeC = new THREE.Color(o.home.primary);
  const awayC = new THREE.Color(o.away.primary);
  const homeS = new THREE.Color(o.home.secondary);
  const misc = [0xffffff, 0x2a2f36, 0x3b82f6, 0xe5e7eb, 0x111111].map((c) => new THREE.Color(c));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const c = crowdPositions[i];
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rot);
    const k = 0.9 + Math.random() * 0.25;
    sc.set(k, k, k);
    m4.compose(c.p, q, sc);
    crowd.setMatrixAt(i, m4);
    // Away fans pack one end; home fans everywhere else.
    const r = Math.random();
    let col: THREE.Color;
    if (c.end === 1) col = r < 0.75 ? awayC : misc[i % misc.length];
    else col = r < 0.55 ? homeC : r < 0.7 ? homeS : misc[i % misc.length];
    crowd.setColorAt(i, col.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
    phase[i] = Math.random();
    endA[i] = c.end === 1 ? 1 : 0;
    const s = SK[Math.floor(Math.random() * SK.length)];
    skin[i * 3] = s.r; skin[i * 3 + 1] = s.g; skin[i * 3 + 2] = s.b;
  }
  crowdGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  crowdGeo.setAttribute('aEnd', new THREE.InstancedBufferAttribute(endA, 1));
  crowdGeo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3));
  crowd.instanceMatrix.needsUpdate = true;
  crowd.frustumCulled = false;
  group.add(crowd);

  // Floodlight towers.
  const towerMat = track(new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.6, roughness: 0.4 }));
  const lampMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: o.night ? 6 : 0.4 }));
  const beams: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = new THREE.Group();
    const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.45, 0.8, 44, 8)), towerMat);
    mast.position.y = 22;
    t.add(mast);
    const head = new THREE.Group();
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(7, 4.5, 0.5)), towerMat);
    head.add(frame);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const lamp = new THREE.Mesh(track(new THREE.BoxGeometry(1.4, 1.1, 0.2)), lampMat);
      lamp.position.set(-2.55 + i * 1.7, -1.4 + j * 1.4, 0.3);
      head.add(lamp);
    }
    head.position.y = 45;
    t.add(head);
    t.position.set(sx * (PL / 2 + 22), 0, sz * (PW / 2 + 20));
    group.add(t);
    t.updateMatrixWorld(true);
    head.lookAt(new THREE.Vector3(0, 0, 0));
    if (o.night) {
      // Fake volumetric beam.
      const beamGeo = track(new THREE.ConeGeometry(16, 58, 24, 1, true));
      beamGeo.translate(0, -29, 0);
      const beamMat = track(new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.copy(t.position).setY(45);
      beam.lookAt(new THREE.Vector3(0, 0, 0));
      beam.rotateX(-Math.PI / 2);
      beams.push(beam);
      group.add(beam);
    }
  }

  // Sky dome.
  const skyMat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(o.night ? 0x050a18 : 0x3d7fd9) },
      mid: { value: new THREE.Color(o.night ? 0x0c1830 : 0x9cc8f2) },
      bot: { value: new THREE.Color(o.night ? 0x1a2238 : 0xe8d8b8) },
      stars: { value: o.night ? 1 : 0 },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform float stars; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){ float y = vP.y; vec3 c = y > 0.15 ? mix(mid, top, smoothstep(0.15, 0.8, y)) : mix(bot, mid, smoothstep(-0.1, 0.15, y));
        if (stars > 0.5 && y > 0.2) { vec3 q = floor(vP * 380.0); float s = step(0.9975, h(q)); c += s * 0.8 * smoothstep(0.2, 0.6, y); }
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(400, 32, 16)), skyMat);
  group.add(sky);

  let boardOffset = 0;
  return {
    group,
    update(time, excitement) {
      uniforms.uTime.value = time;
      uniforms.uExcite.value = excitement;
      boardOffset += 0.0006 + excitement * 0.003;
      for (const b of boards) b.offset.x = boardOffset;
      for (const b of beams) (b.material as THREE.MeshBasicMaterial).opacity = 0.03 + Math.sin(time * 0.7 + b.position.x) * 0.006;
    },
    setCheer(side) {
      uniforms.uCheer.value = side;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      crowd.dispose();
    },
  };
}
