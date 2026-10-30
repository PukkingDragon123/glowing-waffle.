// Registry of every character template. buildAllTemplates() runs during the loading screen.
import { buildTemplate } from './character.js';
import { humanSpecs, boneDefs, makeEyes, makeBrows } from './human.js';
import { HumanAnimator } from './animator.js';

const HUMAN_EXTRA = (opts, J) => ({
  build(c) {
    const head = c.byName.head;
    const ex = 0.033, ey = J.head[1] + 0.121, ez = J.head[2] + 0.084;
    if (!opts.helmet) {
      const { eyes, lids } = makeEyes(head, [[ex, ey, ez], [-ex, ey, ez]], 0.0122, { iris: opts.iris || '#3a2312', lidColor: opts.skin });
      c.extras.eyes = eyes; c.extras.lids = lids;
      c.extras.brows = makeBrows(head, J, opts.hairStyle === 'bald' ? 0x8f8a84 : 0x17120f, opts.hairStyle === 'bald' ? { thick: 0.006 } : {});
    } else {
      // gas-mask lenses: glossy dark discs that catch the light
      const { eyes } = makeEyes(head, [[0.031, ey, ez + 0.032], [-0.031, ey, ez + 0.032]], 0.021, { iris: '#060607', lids: false, irisR: 0.9, pupil: 0.8 });
      c.extras.eyes = []; c.extras.lenses = eyes;
    }
    c.extras.animator = new HumanAnimator(c, { pregnant: (opts.belly || 0) > 0.5, joints: J });
  },
});

const BUILDERS = {
  sunny: () => { const h = humanSpecs('sunny'); return buildTemplate('sunny', { specs: h.specs, boneDefs: boneDefs(h.joints), extra: HUMAN_EXTRA(h.opts, h.joints), material: { sssColor: 0xd8584a } }); },
  soldier: () => { const h = humanSpecs('soldier'); return buildTemplate('soldier', { specs: h.specs, boneDefs: boneDefs(h.joints), extra: HUMAN_EXTRA(h.opts, h.joints), material: { rim: 0.6 } }); },
  general: () => { const h = humanSpecs('general'); return buildTemplate('general', { specs: h.specs, boneDefs: boneDefs(h.joints), extra: HUMAN_EXTRA(h.opts, h.joints) }); },
};
export function registerBuilder(name, fn) { BUILDERS[name] = fn; }
export const ALL_CHARACTERS = () => Object.keys(BUILDERS);

export async function buildAllTemplates(names = Object.keys(BUILDERS), onProgress) {
  let done = 0;
  await Promise.all(names.map(async (n) => {
    if (!BUILDERS[n]) throw new Error('unknown character ' + n);
    await BUILDERS[n]();
    done++; onProgress?.(done / names.length, n);
  }));
}
