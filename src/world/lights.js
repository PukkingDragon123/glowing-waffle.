// Light fixtures. Lights never get added/removed at runtime (that would force
// shader recompiles); switching just changes intensity. Fixtures also answer
// "how lit is this point" for the light-hunting alien.
import * as THREE from 'three';
import { G } from '../core/globals.js';
import { clamp, damp, snoise1 } from '../core/util.js';

export class Fixture {
  constructor(o) {
    this.o = o;
    this.name = o.name || 'light';
    this.room = o.room || null;
    this.on = o.on ?? true;
    this.baseIntensity = o.intensity ?? 8;
    this.color = new THREE.Color(o.color ?? 0xffd9a8);
    this.level = this.on ? 1 : 0; // smoothed 0..1
    this.flicker = 0;              // 0..1 flicker amount
    this.broken = false;
    this.dim = 1;
    this.hum = o.hum ?? false;
    this.pos = o.pos.clone();
    const parent = o.parent || G.scene;
    if (o.spot) {
      const l = this.light = new THREE.SpotLight(this.color, this.baseIntensity, o.distance ?? 9, o.angle ?? 1.15, o.penumbra ?? 0.85, o.decay ?? 1.7);
      l.position.copy(o.pos);
      l.target.position.copy(o.target || o.pos.clone().add(new THREE.Vector3(0, -1, 0)));
      parent.add(l.target);
      if (o.shadow) {
        l.castShadow = true;
        l.shadow.mapSize.set(o.shadowSize ?? 512, o.shadowSize ?? 512);
        l.shadow.bias = -0.0008; l.shadow.normalBias = 0.02;
        l.shadow.camera.near = 0.1; l.shadow.camera.far = o.distance ?? 9;
      }
    } else {
      const l = this.light = new THREE.PointLight(this.color, this.baseIntensity, o.distance ?? 7, o.decay ?? 1.7);
      l.position.copy(o.pos);
      if (o.shadow) { l.castShadow = true; l.shadow.mapSize.set(256, 256); l.shadow.bias = -0.002; l.shadow.normalBias = 0.03; l.shadow.camera.near = 0.05; }
    }
    parent.add(this.light);
    if (o.fill) {
      // secondary soft fill (no shadow) so rooms aren't pitch black outside the cone
      this.fill = new THREE.PointLight(this.color, this.baseIntensity * o.fill, (o.distance ?? 7) * 0.9, 2);
      this.fill.position.copy(o.pos).add(new THREE.Vector3(0, -0.15, 0));
      parent.add(this.fill);
    }
    this.bulbMats = o.bulbMats || [];
    G.world.fixtures.push(this);
    this.apply(1);
  }
  set(on) { this.on = on; }
  toggle() { this.on = !this.on; }
  get lit() { return this.level > 0.05; }
  update(dt) {
    const powered = G.world.power;
    const target = this.on && !this.broken && powered ? 1 : 0;
    this.level = damp(this.level, target, target > this.level ? 30 : 18, dt);
    let f = 1;
    if (this.flicker > 0 && this.level > 0.01) {
      const t = G.time;
      const n = snoise1(t * 9 + this.pos.x * 3, this.pos.z) * 0.5 + 0.5;
      const spike = Math.random() < this.flicker * 0.08 ? 0 : 1;
      f = clamp(1 - this.flicker * (1 - n) * 1.2, 0, 1) * spike;
    }
    this.apply(this.level * f * this.dim);
  }
  apply(k) {
    this.k = k;
    this.light.intensity = this.baseIntensity * k;
    if (this.fill) this.fill.intensity = this.baseIntensity * this.o.fill * k;
    if (this.light.castShadow) this.light.shadow.autoUpdate = k > 0.01;
    for (const m of this.bulbMats) m.emissiveIntensity = (m.userData.emi ?? 1) * k;
  }
  // rough light contribution at a point (0..~1+)
  contrib(p) {
    if (this.k < 0.02) return 0;
    const d = this.light.position.distanceTo(p);
    const range = this.light.distance || 8;
    if (d > range) return 0;
    let v = this.k * (this.baseIntensity / 8) * Math.pow(1 - d / range, 2);
    if (this.light.isSpotLight) {
      const dir = new THREE.Vector3().subVectors(this.light.target.position, this.light.position).normalize();
      const to = new THREE.Vector3().subVectors(p, this.light.position).normalize();
      const c = dir.dot(to);
      v *= clamp((c - Math.cos(this.light.angle)) / 0.3, 0.15, 1);
    }
    return v;
  }
}

// emissive material for bulbs / lamp shades that brightens with the fixture
export function glowMat(color, emissive, intensity = 2) {
  const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.6 });
  m.userData.emi = intensity;
  return m;
}
