# bengrim

A first-person psychological horror game set in 1999. Tribeca, apartment 4B, four floors above West Broadway, with a burning Lower Manhattan at the end of the street. It is Thursday, July 1st. It is always Thursday, July 1st.

You wake up, turn off the alarm, make coffee, cook eggs, feed Mochi, and take three support calls for Blueberry Pie Online on a beige Glass 98 PC. Then you sleep. Then it is July 1st again: the same radio broadcast, the same e-mails, the same customers with the same dial-up errors. Each morning a little more has drifted. Your body has not reset. Neither has the cat.

## Play

- **Browser:** open `dist/bengrim.html` (a single file; three.js and cannon-es load from jsDelivr).
- **From source:** serve the repo root over HTTP (for example `python3 -m http.server`) and open `index.html`. Modules load from `src/` with the vendored libraries in `vendor/`.

There is no loading screen, only three dots and Mochi running in the dark. When she stops and sits, click or press any key. The menu is the apartment wall, seen from across the room: the window, the Twin Towers at the end of West Broadway, and the ship coming down over them. Choose **new game**, **load game** (resumes at the last dawn) or **settings**.

The look is realistic horror with crisp pixel-art textures: smooth, shadowed lighting and ambient occlusion over surfaces whose texels stay sharp up close, under a sallow, desaturated grade that drains a little more every day, with grain, a heavy vignette and faint VHS wear. There is almost no UI. You get Alex talking to themself, a new task that surfaces for a few seconds and then fades, and a small dot only when you look at something you can use. All text is set in Alagard, a pixel font. Pixel textures, ambient occlusion, ink lines, VHS and grain can all be changed in the pause menu.

| Key | Action |
| --- | --- |
| WASD / mouse | move / look |
| Shift / C | run / crouch |
| E | take, use, open; hold on Mochi to pet; on her again to pick her up |
| F | eat, drink, special action |
| Left mouse | drag doors, drawers, windows, objects (R / wheel rotate and push) |
| Right mouse | throw |
| Q / 1 / 2 | pocket / take from pocket |
| G | drop |
| Esc | pause, or stand up from the desk |

At the computer the mouse and keyboard drive Glass 98. The four apps are Blueberry Support, Internet Voyager, Inbox and My Computer. Dial in, set yourself **Available**, answer the phone, and use the Knowledge Base and the Account tools to fix the problem.

## The week

1. A normal routine, a window full of light, a roar down the street.
2. The same day. The trash chute at the end of the hall. 4A is empty except for one chair.
3. Callers who know things. Cups lined up on the floor. Something moves inside you.
4. Blood in the sink. Trembling hands. The mirror is late.
5. Mochi gets out. The hallway has no ends and every door is 4B.
6. The hunger. Mochi. Resist, or don't. She will run either way if you don't.
7. It was never a window.

At night something hunts by light. Turn the lamps off, switch off the monitor, stay away from the glass, crouch in the dark. The elevator works. There is only one floor.

## Tech

- three.js r170. Post-processing adds depth-only ambient occlusion (eight taps tested against the tangent plane, so flat floors stay clean), bloom, ACES, a cold split tone, dithering, VHS tracking, chroma bleed, grain, vignette and curvature. Photographic textures are resampled to about 128 texels a metre and magnified nearest. A camera-relative "liminal" bend can stretch the space ahead, curve it and roll it.
- cannon-es physics for props, doors, drawers and the player.
- Mochi is a faceted low-poly cat built on real feline anatomy: lofted cross-sections for a deep keeled ribcage, tucked waist, shoulder blades that ride up when she walks, elbows, wrists with carpal pads, high hocks and split toes, plus a hand-placed head with brow ridge, cheekbones, whisker pads and a hinged jaw. She is one flat-shaded skinned mesh (about 3,200 triangles) with the tabby painted per facet, glossy slit-pupil eyes with real eyelids, whiskers, a tongue and fangs, procedural gaits and a utility AI.
- Your body is a skinned SDF mesh with IK arms and legs and finger poses. It mutates through shader uniforms: belly, veins, bruising, blood, the split.
- Procedural Web Audio: every sound effect is synthesized at load. Voices come from a formant speech synthesizer with letter-to-sound rules.
- Glass 98 is an immediate-mode Windows 98-style desktop drawn on a 640×480 canvas and shown through a curved CRT shader.
- Verlet cloth for the pinch-pleated curtains, which glow with daylight behind them, and the shower curtain. The bathroom mirror is a planar reflection with oblique clipping and a frame-delay ring buffer.
- The view from the window is West Broadway in Tribeca in 1999, at true scale, looking south down the street canyon at the Twin Towers, with the Woolworth Building in front of them. Below are brick walk-ups and cast-iron lofts with cornices, fire escapes, window units, water tanks, awnings and shop signs; trees, cobra-head lamps, mast-arm signals that cycle, parked cars, and traffic with yellow Caprice cabs and NYPD cruisers that stops at the lights. Government Black Hawks and Hueys circle the towers, hover over the street, sweep it with searchlights at night, and now and then one comes up the street low over the roof. As the week goes on the street is closed off: cruisers, Suburbans, an ambulance, FDNY engines and army trucks with their lights going, barricades, abandoned cars, rubble, paper and ash falling, dust in the canyon, burning facades with shattered windows, and smoke plumes leaning on the wind. Behind the towers are the other modelled Lower Manhattan landmarks, thousands of instanced filler buildings placed from real coordinates, the Hudson with its boats, Jersey City, Brooklyn and Midtown. The sun follows the real July 1st path, over a smoggy sky with self-shadowed clouds, low haze and a sodium glow at night. The sci-fi ship has triplanar hull panels. When it falls, it breaks into rigid parts with gravity, drag and bounce, plus instanced debris, billboard smoke, fire and a shock ring of dust up the street.
- The fourth floor is rotting: brass plates and peepholes on every door, 4D chained shut from the outside, a leak over 4C with stains, peeling paper and a live drip, dead and flickering tubes, an EXIT sign on emergency power, a switchback stairwell that sinks into darkness, a grimy trash room and an empty 4A with one chair.
- The furniture is low poly but never boxy. It uses Shaker doors, lathe-turned legs and knobs, bar pulls, castors, eased cabinet boards with shelf lips and a cornice, a draped quilt, and a woodgrain CRT TV with a VCR and rabbit ears.
- The paintings are real public-domain works with the faces smeared out (see Credits). They hang in swept, mitred moulding frames on matte, varnish-aged canvas, with weave, craquelure and impasto in the normal map.

## Build

```sh
npm i --no-save esbuild
node tools/build.mjs      # writes dist/bengrim.html and dist/bengrim.artifact.html
```

`tools/shot.mjs`, `tools/views.mjs` and `tools/distcheck.mjs` are headless Playwright helpers for screenshots and smoke tests. Add `?capture` to the URL to keep the drawing buffer. `window.BENGRIM` exposes `day(n)`, `tp(x, z, yaw, pitch)` and `fast(frames)` for debugging.

`tools/paintings.py` rebuilds `src/world/paintings.data.js`. It downloads the paintings, smears the faces and embeds them as JPEG data URIs. It needs Pillow and numpy.

## Credits

The paintings come from The Metropolitan Museum of Art's Open Access programme (public domain, CC0). The faces have been altered for the game.

- Auguste Renoir, *Madame Georges Charpentier and Her Children*, 1878 (object 438815)
- Johannes Vermeer, *Young Woman with a Water Pitcher*, ca. 1662 (object 437881)
- John Singer Sargent, *Madame X (Virginie Amélie Avegno Gautreau)*, 1883–84 (object 12127)
- Thomas Eakins, *The Thinker: Portrait of Louis N. Kenton*, 1900 (object 10827)
- Rembrandt van Rijn, *Aristotle with a Bust of Homer*, 1653 (object 437394)

The UI font is Alagard by Hewett Tsoi (Pix3M), embedded in `css/style.css` (source file in `assets/fonts/`).

Third-party licenses are in `vendor/LICENSE-*.txt`.
