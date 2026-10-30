// Skeleton construction + procedural pose accumulation, two-bone IK and look-at.
// Bones are created with identity rest rotations, so euler offsets are in "rest-aligned" axes:
// the character faces +Z; +X is the character's LEFT; X-rotation pitches (+ = forward bend for
// bones pointing up, + = swing backwards for bones pointing down).
import * as THREE from 'three';
import { clamp } from '../core/util.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _e = new THREE.Euler();

export function buildSkeleton(defs) {
  // defs: [{ name, parent: name|null, pos:[x,y,z] world rest }]
  const bones = [], byName = {};
  defs.forEach((d, i) => {
    const b = new THREE.Bone(); b.name = d.name; b.userData.rest = new THREE.Vector3(...d.pos); b.userData.index = i;
    bones.push(b); byName[d.name] = b;
  });
  defs.forEach((d) => {
    const b = byName[d.name];
    if (d.parent) { const p = byName[d.parent]; p.add(b); b.position.copy(b.userData.rest).sub(p.userData.rest); }
    else b.position.copy(b.userData.rest);
    b.userData.restPos = b.position.clone();
  });
  return { bones, byName, index: Object.fromEntries(defs.map((d, i) => [d.name, i])) };
}

export class Rig {
  constructor(byName, root) {
    this.b = byName; this.root = root;
    this.names = Object.keys(byName);
    this.acc = {}; for (const n of this.names) this.acc[n] = [0, 0, 0];
    this.hip = new THREE.Vector3(); this.hipRest = byName.hips?.userData.restPos.clone() ?? new THREE.Vector3();
    this.scales = {};
  }
  begin() { for (const n of this.names) { const a = this.acc[n]; a[0] = a[1] = a[2] = 0; } this.hip.set(0, 0, 0); this.scales = {}; }
  add(name, x = 0, y = 0, z = 0, w = 1) { const a = this.acc[name]; if (!a) return; a[0] += x * w; a[1] += y * w; a[2] += z * w; }
  // add a whole pose map { bone: [x,y,z] } with weight
  pose(map, w = 1) { if (!map || w <= 0) return; for (const k in map) { if (k === '_hip') { this.hip.x += map[k][0] * w; this.hip.y += map[k][1] * w; this.hip.z += map[k][2] * w; continue; } const v = map[k]; this.add(k, v[0], v[1], v[2], w); } }
  scale(name, s) { this.scales[name] = s; }
  apply() {
    for (const n of this.names) {
      const b = this.b[n], a = this.acc[n];
      _e.set(a[0], a[1], a[2], 'XYZ'); b.quaternion.setFromEuler(_e);
      const s = this.scales[n]; if (s != null) { if (typeof s === 'number') b.scale.setScalar(s); else b.scale.set(s[0], s[1], s[2]); } else b.scale.set(1, 1, 1);
    }
    if (this.b.hips) this.b.hips.position.copy(this.hipRest).add(this.hip);
    this.root.updateMatrixWorld(true);
  }
  worldPos(name, out = new THREE.Vector3()) { return this.b[name].getWorldPosition(out); }

  // Rotate `bone` (in world space) by quaternion q, keeping hierarchy consistent.
  rotateWorld(bone, q) {
    bone.getWorldQuaternion(_q1);
    const parentQ = bone.parent ? bone.parent.getWorldQuaternion(_q2) : _q2.identity();
    const target = q.clone().multiply(_q1);
    bone.quaternion.copy(parentQ.invert().multiply(target));
    bone.updateMatrixWorld(true);
  }
  // Point bone A's chain so that `tipBone` lies along the direction to target (single bone aim).
  aim(boneName, tipName, target, weight = 1) {
    const a = this.b[boneName], tip = this.b[tipName];
    const pa = a.getWorldPosition(_v1), pt = tip.getWorldPosition(_v2);
    const from = _v3.copy(pt).sub(pa).normalize(), to = _v4.copy(target).sub(pa).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(from, to);
    if (weight < 1) q.slerp(new THREE.Quaternion(), 1 - weight);
    this.rotateWorld(a, q);
  }
  // Analytic two-bone IK: upper -> mid -> end reaches target, elbow/knee bends toward pole.
  ik(upperName, midName, endName, target, pole = null, weight = 1) {
    if (weight <= 0.001) return;
    const A = this.b[upperName], B = this.b[midName], C = this.b[endName];
    const a = A.getWorldPosition(new THREE.Vector3()), b = B.getWorldPosition(new THREE.Vector3()), c = C.getWorldPosition(new THREE.Vector3());
    const t = new THREE.Vector3().copy(c).lerp(target, weight);
    const lab = a.distanceTo(b), lcb = b.distanceTo(c);
    const lat = clamp(a.distanceTo(t), 0.01, lab + lcb - 0.002);
    // current interior angles
    const ac = new THREE.Vector3().subVectors(c, a).normalize(), ab = new THREE.Vector3().subVectors(b, a).normalize();
    const ba = new THREE.Vector3().subVectors(a, b).normalize(), bc = new THREE.Vector3().subVectors(c, b).normalize();
    const at = new THREE.Vector3().subVectors(t, a).normalize();
    const ac_ab_0 = Math.acos(clamp(ac.dot(ab), -1, 1));
    const ba_bc_0 = Math.acos(clamp(ba.dot(bc), -1, 1));
    const ac_ab_1 = Math.acos(clamp((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat), -1, 1));
    const ba_bc_1 = Math.acos(clamp((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb), -1, 1));
    let axis0 = new THREE.Vector3().crossVectors(ac, ab);
    if (pole) { const pd = new THREE.Vector3().subVectors(pole, a); axis0 = new THREE.Vector3().crossVectors(ac, pd).negate(); }
    if (axis0.lengthSq() < 1e-8) axis0.set(1, 0, 0);
    axis0.normalize();
    const r0 = new THREE.Quaternion().setFromAxisAngle(axis0, ac_ab_1 - ac_ab_0);
    const r1 = new THREE.Quaternion().setFromAxisAngle(axis0, ba_bc_1 - ba_bc_0);
    this.rotateWorld(A, r0);
    this.rotateWorld(B, r1);
    // swing the chain onto the target direction
    const c2 = C.getWorldPosition(new THREE.Vector3());
    const ac2 = new THREE.Vector3().subVectors(c2, a).normalize();
    const r2 = new THREE.Quaternion().setFromUnitVectors(ac2, at);
    this.rotateWorld(A, r2);
  }
  // Turn head (and neck) toward a world point, clamped. weight 0..1
  lookAt(target, weight = 1, { neck = 'neck', head = 'head', maxYaw = 1.1, maxPitch = 0.6, forward = new THREE.Vector3(0, 0, 1) } = {}) {
    if (!target || weight <= 0.001 || !this.b[head]) return;
    const H = this.b[head];
    const hp = H.getWorldPosition(new THREE.Vector3());
    const parent = this.b[neck]?.parent || H.parent;
    const pq = parent.getWorldQuaternion(new THREE.Quaternion());
    const local = new THREE.Vector3().subVectors(target, hp).applyQuaternion(pq.clone().invert());
    const yaw = clamp(Math.atan2(local.x, local.z), -maxYaw, maxYaw) * weight;
    const pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -maxPitch, maxPitch) * weight;
    const apply = (bone, f) => { if (!bone) return; const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * f, yaw * f, 0, 'YXZ')); bone.quaternion.premultiply(q); bone.updateMatrixWorld(true); };
    apply(this.b[neck], 0.4); apply(H, 0.6);
    return { yaw, pitch };
  }
}
