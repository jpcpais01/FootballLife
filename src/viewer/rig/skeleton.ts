// The player skeleton: Mixamo's bone names (so mocap retargets by name) on our
// own proportions. Every bone's rest frame is aligned with the body, in a
// T-pose, so a clip is just one local rotation per bone plus a hips offset.
import * as THREE from 'three';

export const BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
] as const;
export type BoneName = (typeof BONES)[number];
export const NB = BONES.length;
export const B = Object.fromEntries(BONES.map((n, i) => [n, i])) as Record<BoneName, number>;
export const PARENT = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 8, 3, 10, 11, 12, 0, 14, 15, 16, 0, 18, 19, 20];
/** The same bone on the other side (for mirroring clips). */
export const MIRROR = BONES.map((n) => B[(n.startsWith('Left') ? n.replace('Left', 'Right') : n.startsWith('Right') ? n.replace('Right', 'Left') : n) as BoneName]);

/**
 * Joint positions in body space (metres before the figure's scale): feet on
 * y = 0, facing +z, the player's left at +x. Long legs, a tapered torso and
 * broad shoulders; the head centre stays where portraits expect it (2.03).
 */
export const REST: [number, number, number][] = [
  [0, 1.12, 0], // Hips
  [0, 1.22, -0.005], // Spine
  [0, 1.36, -0.01], // Spine1
  [0, 1.5, -0.01], // Spine2
  [0, 1.745, -0.005], // Neck
  [0, 1.86, 0], // Head
  [0.05, 1.655, -0.01], // LeftShoulder
  [0.25, 1.675, -0.01], // LeftArm
  [0.56, 1.675, -0.01], // LeftForeArm
  [0.83, 1.675, -0.01], // LeftHand
  [-0.05, 1.655, -0.01],
  [-0.25, 1.675, -0.01],
  [-0.56, 1.675, -0.01],
  [-0.83, 1.675, -0.01],
  [0.1, 1.06, 0], // LeftUpLeg
  [0.1, 0.575, 0.004], // LeftLeg (knee)
  [0.1, 0.1, -0.012], // LeftFoot (ankle)
  [0.1, 0.022, 0.13], // LeftToeBase
  [-0.1, 1.06, 0],
  [-0.1, 0.575, 0.004],
  [-0.1, 0.1, -0.012],
  [-0.1, 0.022, 0.13],
];
export const ANKLE_Y = REST[B.LeftFoot][1];
export const HIP_Y = REST[B.Hips][1];
/** Arms are skinned hanging at this angle below the T-pose (radians), so the shoulders deform well. */
export const ARM_BIND = 1.0;

/** Builds a fresh bone hierarchy at the T-pose rest. Returns [bones, root bone]. */
export function makeBones(): THREE.Bone[] {
  const bones = BONES.map((name) => {
    const b = new THREE.Bone();
    b.name = name;
    return b;
  });
  bones.forEach((b, i) => {
    const p = PARENT[i];
    const r = REST[i];
    if (p < 0) b.position.set(r[0], r[1], r[2]);
    else {
      const pr = REST[p];
      b.position.set(r[0] - pr[0], r[1] - pr[1], r[2] - pr[2]);
      bones[p].add(b);
    }
  });
  return bones;
}

/** The pose the mesh is skinned in: T-pose with the arms lowered to ARM_BIND. */
export function setBindPose(bones: THREE.Bone[]) {
  for (const b of bones) b.quaternion.identity();
  bones[B.LeftArm].quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ARM_BIND);
  bones[B.RightArm].quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ARM_BIND);
}
