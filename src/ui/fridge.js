// Opening the fridge lists what's actually on its shelves, as plain words:
// pick one by number and Alex reaches in for it. Nothing appears that wasn't
// there; what you take is gone from the shelf until you put it back.
import { G, on } from '../core/globals.js';

const inFridge = (p) => p.x > 9.45 && p.x < 10.2 && p.z > 0.05 && p.z < 0.85 && p.y > 0.02 && p.y < 1.8;

export class FridgeMenu {
  constructor() { this.open = false; on('fridge', (o) => this.toggle(o)); }
  contents() {
    return (G.apartment.items || []).filter((it) => it && !it.dead && it.mesh && it.mesh.visible && G.player.inv.hand !== it && inFridge(it.mesh.position));
  }
  toggle(open) {
    this.open = open;
    if (!open) { if (G.hud.choice && this.asking) G.hud.choice.resolve(null); return; }
    this.ask();
  }
  async ask() {
    const items = this.contents();
    if (!this.open || G.state !== 'play') return;
    if (!items.length) { G.hud.inner('Nothing left in here.'); return; }
    this.asking = true;
    const pick = await G.hud.choose([...items.slice(0, 7).map((it) => ({ label: it.label, value: it })), { label: 'close', value: null }]);
    this.asking = false;
    if (!pick || !this.open) return;
    if (G.player.inv.take(pick)) setTimeout(() => this.ask(), 500);
  }
}
