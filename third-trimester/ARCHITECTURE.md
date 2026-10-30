# Close Encounters of the Third Trimester — architecture & story bible

A surreal horror-comedy life simulator. Browser game, plain ES modules, three.js r178 + cannon-es,
no framework. Everything (models, textures, music, most SFX) is generated procedurally at load;
the few downloaded assets are CC0/OFL (see README credits).

## Run

Serve `third-trimester/` over HTTP (`python3 -m http.server -d third-trimester 8080`) and open
`index.html`. `node tools/build.mjs` writes the single-file `dist/third-trimester.html`.

## Story bible (keep all content consistent with this)

- **Sunny** (player, 41). Former karaoke DJ, now night-shift manager for the LIFELINE 24 hotline,
  working from home. Tan skin, short black hair, stubble, grey T-shirt, plaid shorts, slippers.
  Visibly, impossibly pregnant ("conceived by a very respectful tractor beam").
- **Gary** (husband). Real name *G̷ar'rhyx of the Seventh Drift*. Grey alien, 2.1 m, huge glossy
  black eyes, lavender freckles, beige cardigan, slippers. Gentle, mangles idioms ("you are the
  apple of my eyes, both of them, all four"). Married Sunny a year ago at a karaoke bar.
  Arrested in the intro.
- **The baby**. Born on Day 2. Default name **Bean** (player may rename; always read
  `game.state.baby.name`). Grey, huge black eyes, purple spots, silver onesie, drinks glowing green
  formula. Creepy and adorable: floats, phases through cot bars, mimics voices (including hotline
  callers), stares at empty corners, moves objects with his mind, leaves glowing crystals in his
  diaper (sellable online).
- **Mr. Tofu** (cat). Chubby orange tabby, white chest and paws. Kicked and captured in the intro.
  Secretly *Chairman of the Board That Runs Everything* (a cabal of cats). Final day: returns in a
  navy business suit, red tie, tiny sunglasses, briefcase. Deep, calm voice.
- **General Harlan Brass**, Department of Terrestrial Purity (**DTP**). **Agent Finch** traces calls.
  Soldiers: black tactical gear, gas masks.
- **Place**: an unnamed humid megacity of towers. Golden Lotus Mansions, room 1407 (14th floor).
- **LIFELINE 24 — "We Answer Everything."** Boss: Doreen Pratt (passive-aggressive e-mails).
- Other brands (all fictional): Lucky Noodle (instant noodles), QuikMart Delivery (online shop),
  First Bank of Earth, Daily Pulse (news), Askew (search engine), AlienSpouseSupport.net (forum),
  Doorways 98 (the computer OS; start button says **Begin**).

### Days
| Day | Title | Beats |
|---|---|---|
| 0 | *Intro* | Ships crash into towers. DTP raid. Gary beaten and arrested, Tofu kicked and bagged. |
| 1 | The Morning After | Rebuild the trashed flat into a home. First shift. Cravings. Contractions at night. |
| 2 | Delivery | Birth (morning). Learn feed / clean / comfort. Shift. Baby mimics callers. |
| 3 | Visitors | Drone at the window. Ghost caller. Morse purr call from Tofu. Knocks in the wall. |
| 4 | Static | Power flickers. Agent Finch traces calls. A caller who is Sunny from tomorrow. |
| 5 | The Board Meeting | General Brass calls; soldiers return; Tofu in a suit; absurd finale; credits. |

Tone: weird, scary, funny, tender. Horror comes from wrongness, not gore. Comedy is deadpan.

## Module map

```
index.html                 dev entry (importmap -> vendor/)
css/style.css              global + HUD-less overlays
css/fonts.css              @font-face (assets/fonts, OFL)
src/main.js                boot, scene switching, main loop
src/core/game.js           `game` singleton: state, events, audio, ui, settings, renderer refs
src/core/util.js           math, easing, rng, tween helpers, nextFrame()
src/core/settings.js       persisted settings
src/core/save.js           localStorage save/load
src/core/input.js          pointer + keyboard state, drag helpers
src/core/renderer.js       WebGLRenderer + painterly post pipeline (bloom, Kuwahara, DOF, grade)
src/core/audio.js          Web Audio engine: buses, samples, procedural SFX, babble voices, loops
src/core/ui.js             subtitles, fades, letterbox, toasts, sticky notes, title cards, choices
src/core/qte.js            cinematic QTE widgets
src/core/loader.js         progress-tracked async task queue
src/gfx/*                  textures, materials, particles, sdf mesher (+ worker), env
src/chars/*                rig + procedural animation, human, alien, cat, giant hands
src/scenes/facility.js     menu/loading scene (cat running from giant hands)
src/scenes/city.js         skyline, ships, crash FX
src/scenes/intro.js        opening cinematic
src/scenes/apartment.js    the home (gameplay scene)
src/scenes/finale.js       final-day cinematic
src/game/*                 state, items, interaction, physics, activities, baby, director
src/computer/*             Doorways 98 OS (DOM), apps, hotline calls, minigames
src/ui/menu.js             main menu, settings & credits panels
```

## Contracts

### `game` (src/core/game.js)
```js
import { game } from '../core/game.js';
game.state            // persistent save object (see src/game/state.js)
game.events.on(name, fn) / off / once / emit(name, data)
game.audio            // see below
game.ui               // see below
game.settings.get(key) / set(key, v)
game.time             // seconds since boot (real), game.dt last frame dt
```

### Audio (`game.audio`)
```js
audio.ui(name, {vol})          // short UI cue (CC0 samples):
   // menu.hover menu.select menu.open menu.close menu.start menu.back menu.success menu.swipe
   // menu.warning menu.checkpoint menu.achievement
   // os.press os.release os.open os.close os.error os.notify os.type os.drag os.drop os.snap
   // os.on os.off os.dbl os.warning os.complete os.receive os.send os.connect os.disconnect
   // arcade.reward arcade.error arcade.levelup arcade.bonus arcade.start arcade.stop
   // world.lift world.drop world.snap world.check world.release
   // magic.achievement magic.complete magic.unlock magic.levelup
   // sci.scan sci.process sci.connect sci.notify sci.wake sci.sleep
   // qte.press qte.success qte.error qte.check
audio.sfx(name, {vol, rate, pan, detune})   // procedural one-shots (see audio.js SFX list)
audio.loop(name, {vol}) -> {setVolume(v, t), stop(t)}  // procedural loops
audio.babble(text, voice, {rate}) -> {done: Promise, stop()}
   // voices: man sunny gary soldier general baby cat ghost old kid woman agent robot choir tofu
audio.music(name|null, {fade})  // tracks registered by src/audio/music.js
audio.registerTrack(name, factory)
```

### UI (`game.ui`)
```js
ui.say(speaker, text, {voice, dur}) -> Promise   // subtitle (+ babble if voice)
ui.choose([{text, value}], {prompt}) -> Promise<value>
ui.fade(opacity, seconds, color='#000') -> Promise
ui.letterbox(on)
ui.titleCard(big, small, seconds) -> Promise
ui.toast(text)
ui.thought(text|null)         // Sunny's thought bubble (cravings etc.)
```

### Computer (src/computer/index.js)
```js
export function createComputer({ root, game }) -> {
  open(), close(), isOpen,               // game zooms the camera in, then calls open()
  update(dt),                            // called every frame, open or not (call timers)
  drawScreen(ctx, w, h),                 // paint a low-res view for the 3D CRT texture
  ringing,                               // true while the phone rings
  serialize(), deserialize(obj)
}
```
The OS is laid out at a logical 800×600 inside `root`; the game scales `root` with a CSS transform
so it sits exactly on the projected 3D screen. Events the computer emits:
`computer:exit`, `phone:ring` / `phone:stop`, `call:start {id}`, `call:end {id, rating}`,
`shift:in`, `shift:out`, `purchase {id, qty}`, `sell {id, qty}`, `finale:start`.
It reads `game.state.day`, `.clock` (minutes since midnight), `.money`, `.baby`, `.flags`
and changes money only through `game.state` helpers (`addMoney`, `spend`).
Events it listens to: `day:start {day}`, `wall:knock`, `baby:born`.

### Items (src/game/items.js)
Single catalog shared by the shop website, the noodle shelf, cravings and activities.

## Art direction (updated — the user asked for a sharp, rigged style)

**Inked realism**, matching the user's other game เฮียผัด! (Hia Phat): clean low-to-mid-poly shapes with real
silhouettes, crisp native-resolution rendering, **black ink outlines** (screen-space depth+normal edges in
`renderer.js` + inverted-hull outlines on characters and hero props), textured surfaces, warm saturated light,
goofy expressive animation. **No blur/painterly mush**: the Kuwahara filter is an optional setting, off by default;
DOF only for close-ups. Every visible prop is bevelled/rounded and has its small parts — never a raw box.
Objects that must NOT get screen-space ink (sky, glass, particles, hull meshes, fog cards) go on `layers.set(2)`.

## Characters (src/chars/index.js)
```js
await buildCharacters(onProgress)          // loader task (GLB bodies, SDF cat/baby, accessories)
const c = spawn('sunny'|'soldier'|'general'|'gary'|'baby'|'tofu'|'tofusuit')
c.root; c.update(dt); c.bonePos(name); c.attach(boneName, obj)
// humans/gary (GlbHuman, Quaternius CC0 body + 43 retargeted Quaternius CC0 clips):
c.anim.setPose(name, fade)   // idle pregnant talk sit sitTalk sitType crouch interact pickup kneel hit hitHead die
                             // punch jab push aim pistol shoot dance levitate torch walkFormal holdBaby rock cower
                             // reach struggle handsBehind handsUp armsCrossed point salute phone stir eat …
c.anim.once(name, thenPose)  // one-shot clip then return
c.anim.walking(speed) c.anim.lookAt(target|null, w) c.anim.reach('l'|'r', target|null) c.anim.expression(name) c.anim.talk(sec)
c.belly = 0..1 (Sunny)       // expressions: neutral happy fear worried pain angry shock sleepy smug scream closed
// cat (CatAnimator): c.anim.setPose('stand'|'sit'|'loaf'|'hiss'|'biped'|'bipedPoint'|'bipedSnap'|'bipedTie'|'limp')
//   c.anim.move(speed, 'walk'|'gallop'|'scramble'); c.anim.scared(0..1); c.anim.lookAt(v)
// baby (HumanAnimator on a small SDF body): c.anim.setPose('idle'|'levitate'|'lie'…)
```
`src/game/mover.js` `Actor(kind)` wraps a character with `place([x,y,z], yaw)`, `walkTo([[x,z],…])`,
`face(yaw|[x,z])`, `stop()`, `update(dt)` — use it for anything that walks.

## Scenes
A scene object: `{ name, scene: THREE.Scene, camera: THREE.PerspectiveCamera, async init(onProgress), enter(opts), exit(), update(dt) }`.
`main.js` renders `game.gfx.render(cur.scene, cur.camera, dt)` after `cur.update(dt)`, and switches with
`game.setScene(obj, opts)`. Grades: `game.gfx.setGrade({...})` / `tweenGrade(key, to, sec)`.

### Apartment (src/scenes/apartment.js — owned by the parent; layout constants in src/scenes/layout.js)
```js
apt.scene, apt.camera, apt.sunny (Actor)
apt.spawnActor(kind, [x,y,z], yaw) -> Actor   // added to the scene and updated every frame
apt.removeActor(actor)
apt.camTo(preset|{pos,look,fov}, sec=0, ease) -> Promise    // presets: CAMS in layout.js
apt.door.open({ kick }) -> Promise, apt.door.close() -> Promise
apt.setLight(mood)        // 'evening' | 'night' | 'day' | 'raid' | 'blackout' | 'finale'
apt.messUp() / apt.tidy() // trashed post-raid state vs. normal
apt.cityView              // the createCityBackdrop() instance outside the window (from city.js)
apt.prop(name) -> Object3D  // 'tv', 'radio', 'crib', 'phone', 'monitor', 'catBowl', 'painting', …
apt.tv.show(kind)         // 'news' | 'static' | 'wanted' | 'off'
```
