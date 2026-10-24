// Looking at things and doing things: raycast, prompts, E/F/G/Q/1/2 actions,
// physics dragging (hold LMB), rotating (R) and throwing (RMB).
import * as THREE from 'three';
import { G, emit } from '../core/globals.js';
import { GROUP } from '../core/physics.js';
import { clamp } from '../core/util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
const sfx = (n, o) => G.audio && G.audio.play(n, o);

function halfHeight(def) {
  const s = def.shape;
  if (s.type === 'box') return s.size[1] / 2;
  if (s.type === 'cyl') return s.h / 2;
  return s.r;
}

export class Interaction {
  constructor(player) {
    this.p = player;
    this.ray = new THREE.Raycaster();
    this.ray.far = 2.4;
    this.hovered = null;
    this.hit = null;
    this.drag = null;    // physics prop drag
    this.idrag = null;   // interactable drag (door, drawer, cat...)
    this.rotating = false;
    this.enabled = true;
    this.center = new THREE.Vector2(0, 0);
  }

  context() { return { hover: this.hovered, hit: this.hit, player: this.p, day: G.story.day }; }

  cast() {
    this.ray.setFromCamera(this.center, G.camera);
    this.ray.far = 2.5;
    const hits = this.ray.intersectObjects(G.world.rayTargets, false);
    this.hit = null; this.hovered = null;
    for (const h of hits) {
      if (!h.object.visible) continue;
      let o = h.object, inter = null;
      while (o) { if (o.userData.inter) { inter = o.userData.inter; break; } o = o.parent; }
      if (inter && (inter.dead || inter.enabled === false)) continue;
      if (inter && this.p.inv.hand === inter) continue;
      if (inter && inter.isItem && inter.prop.held) continue;
      this.hit = h;
      if (inter && h.distance <= (inter.reach ?? 2.1)) this.hovered = inter;
      break;
    }
  }

  update(dt) {
    const inp = G.input;
    const inv = this.p.inv;
    if (!this.enabled || this.p.action?.lock) {
      G.hud.setPrompt(null);
      if (this.drag) this.endDrag(false);
      if (this.idrag) this.endIDrag();
      return;
    }
    if (!this.drag && !this.idrag) this.cast();
    const ctx = this.context();
    const h = this.hovered;
    // carrying the cat: she owns the hands
    if (this.p.carrying) {
      G.hud.setPrompt([{ key: 'E', label: 'Pet (hold)' }, { key: 'LMB', label: 'Put her down' }]);
      return;
    }

    // ---- dragging
    if (this.drag) {
      this.updateDrag(dt);
      if (!inp.mouseDown(0)) this.endDrag(false);
      else if (inp.mousePressed(2)) this.endDrag(true);
      G.hud.setPrompt([{ key: 'RMB', label: 'Throw' }, { key: 'R', label: 'Rotate' }, { key: 'Wheel', label: 'Distance' }]);
      return;
    }
    if (this.idrag) {
      const d = this.idrag;
      d.grabMove(inp.mdx, inp.mdy, ctx);
      const far = d.dragAnchor && G.camera.position.distanceTo(d.dragAnchor) > 2.8;
      if (!inp.mouseDown(0) || far || d.dead) this.endIDrag();
      G.hud.setPrompt(d.dragPrompt ? d.dragPrompt() : [{ key: 'Mouse', label: 'Move' }]);
      return;
    }

    // ---- prompt
    const rows = [];
    if (h) rows.push(...h.actions(ctx).filter((a) => a.label));
    if (h && h.useF && !inv.hand) {/* actions already include F */}
    if (inv.hand) {
      const ha = inv.hand.heldActions(ctx) || [];
      rows.push(...ha.filter((a) => !rows.some((r) => r.key === a.key && a.key)));
      if (!h && this.hit && this.hit.face && this.hit.face.normal) {
        const n = _v.copy(this.hit.face.normal).transformDirection(this.hit.object.matrixWorld);
        if (n.y > 0.7) rows.unshift({ key: 'E', label: 'Place ' + inv.hand.label.toLowerCase() });
      }
      rows.push({ key: 'G', label: 'Drop' });
      if (inv.hand.small) rows.push({ key: 'Q', label: 'Pocket' });
    }
    // de-duplicate keys: first wins
    const seen = new Set(); const out = [];
    for (const r of rows) { const k = r.key || r.label; if (r.key && seen.has(r.key)) continue; seen.add(k); out.push(r); }
    G.hud.setPrompt(out.length ? out : null);

    // ---- input
    if (this.p.action) return; // busy animating
    if (inp.pressed('KeyE')) {
      if (h && h.isItem) {
        if (inv.take(h)) this.p.reach(h.mesh.position, 'take');
      } else if (h) {
        this.p.reach(this.hit ? this.hit.point : h.worldPos(_v), 'press');
        h.use(ctx);
      } else if (inv.hand && this.hit) {
        const n = _v.copy(this.hit.face.normal).transformDirection(this.hit.object.matrixWorld);
        if (n.y > 0.7) {
          const pos = this.hit.point.clone().add(new THREE.Vector3(0, halfHeight(inv.hand.def) + 0.004, 0));
          const yaw = this.p.ctrl.yaw + Math.PI;
          const q = _q.setFromEuler(new THREE.Euler(0, yaw, 0)).clone();
          this.p.reach(this.hit.point, 'place');
          inv.placeHandAt(pos, q);
        }
      }
    }
    if (inp.pressed('KeyF')) {
      let spec = null;
      if (h && h.useF && !inv.hand) spec = h.useF(ctx);
      else if (h && h.isItem && h.useWorld && !inv.hand) spec = h.useWorld(ctx);
      else if (h && h.isItem && h.useWorld && inv.hand) spec = h.useWorld(ctx);
      if (!spec && inv.hand) spec = inv.hand.useHeld(ctx);
      if (spec) this.p.runAction(spec);
    }
    if (inp.pressed('KeyG') && inv.hand) inv.drop(0.4);
    if (inp.pressed('KeyQ') && inv.hand) inv.store();
    if (inp.pressed('Digit1')) inv.retrieve(0);
    if (inp.pressed('Digit2')) inv.retrieve(1);
    if (inp.pressed('Tab')) inv.changed();
    if (inp.mousePressed(2) && inv.hand && !this.drag) { const it = inv.drop(6.5); if (it) sfx('whoosh', { vol: 0.4 }); }
    if (inp.mousePressed(0)) {
      if (h && h.isItem) this.startDrag(h);
      else if (h && h.canGrab && h.canGrab(ctx)) this.startIDrag(h);
    }
  }

  startDrag(item) {
    const b = item.body;
    const hp = this.hit ? this.hit.point.clone() : item.mesh.position.clone();
    this.drag = { item, dist: clamp(G.camera.position.distanceTo(hp), 0.6, 1.6), offset: new THREE.Vector3().subVectors(hp, item.mesh.position), mask: b.collisionFilterMask };
    b.collisionFilterMask = GROUP.STATIC | GROUP.PROP | GROUP.MOVER;
    b.wakeUp();
    b.angularDamping = 0.6;
    this.p.reachHold = item;
    sfx('grab', { pos: item.mesh.position, vol: 0.3 });
    emit('grab', item);
  }
  updateDrag(dt) {
    const d = this.drag, it = d.item, b = it.body;
    if (it.dead || it.prop.held) { this.drag = null; return; }
    const inp = G.input;
    if (inp.wheel) d.dist = clamp(d.dist - inp.wheel * 0.08, 0.5, 1.7);
    const cam = G.camera;
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const target = _v.copy(cam.position).addScaledVector(_fwd, d.dist).sub(d.offset);
    const err = _v2.set(target.x - b.position.x, target.y - b.position.y, target.z - b.position.z);
    const heavy = b.mass > 2.5;
    const k = heavy ? 7 : 14;
    const maxV = heavy ? 2.5 : 6;
    const v = err.multiplyScalar(k);
    if (v.length() > maxV) v.setLength(maxV);
    if (heavy) v.y = Math.min(v.y, 1.5);
    b.velocity.set(v.x, v.y, v.z);
    this.rotating = inp.isDown('KeyR');
    if (this.rotating) {
      const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      b.angularVelocity.set(up.x * inp.mdx * 0.12 + right.x * inp.mdy * 0.12, up.y * inp.mdx * 0.12 + right.y * inp.mdy * 0.12, up.z * inp.mdx * 0.12 + right.z * inp.mdy * 0.12);
    } else {
      b.angularVelocity.scale(Math.exp(-6 * dt), b.angularVelocity);
    }
    // the trembling hand shakes held objects on later days
    const tr = this.p.trembleAmount || 0;
    if (tr > 0.05) { b.velocity.x += (Math.random() - 0.5) * tr * 1.5; b.velocity.y += (Math.random() - 0.5) * tr * 1.5; b.velocity.z += (Math.random() - 0.5) * tr * 1.5; }
    if (Math.hypot(err.x, err.y, err.z) / k > 0.9) this.endDrag(false); // snagged
  }
  endDrag(thr) {
    const d = this.drag; if (!d) return;
    const b = d.item.body;
    b.collisionFilterMask = d.mask;
    b.angularDamping = 0.12;
    if (thr) {
      _fwd.set(0, 0, -1).applyQuaternion(G.camera.quaternion);
      const s = b.mass > 2.5 ? 3 : 7;
      b.velocity.set(_fwd.x * s, _fwd.y * s + 1, _fwd.z * s);
      sfx('whoosh', { vol: 0.4 });
      emit('noise', { pos: d.item.mesh.position.clone(), loud: 0.2, kind: 'throw' });
    } else {
      // gentle release
      b.velocity.set(b.velocity.x * 0.3, Math.min(b.velocity.y * 0.3, 0.5), b.velocity.z * 0.3);
    }
    this.drag = null; this.rotating = false; this.p.reachHold = null;
    emit('release', d.item);
  }
  startIDrag(inter) {
    this.idrag = inter;
    inter.dragAnchor = this.hit ? this.hit.point.clone() : inter.worldPos(new THREE.Vector3());
    inter.grabStart(this.hit, this.context());
    this.p.ctrl.lookEnabled = inter.allowLookWhileDragging === true;
    this.p.reachPoint = inter.dragAnchor;
  }
  endIDrag() {
    const d = this.idrag; this.idrag = null;
    if (d) d.grabEnd(this.context());
    this.p.ctrl.lookEnabled = true;
    this.p.reachPoint = null;
  }
  cancel() { if (this.drag) this.endDrag(false); if (this.idrag) this.endIDrag(); }
}
