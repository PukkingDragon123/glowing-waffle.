# bengrim

A first-person psychological horror game set in 1999. Jersey City, apartment 4B, across the river from a burning Manhattan. It is Thursday, July 1st. It is always Thursday, July 1st.

You wake up, turn off the alarm, make coffee, cook eggs, feed Mochi, and take three support calls for Blueberry Pie Online on a beige Glass 98 PC. Then you sleep. Then it is July 1st again: the same radio broadcast, the same e-mails, the same customers with the same dial-up errors. Each morning a little more has drifted. Your body has not reset. Neither has the cat.

## Play

- **Browser:** open `dist/bengrim.html` (a single file; three.js and cannon-es load from jsDelivr).
- **From source:** serve the repo root over HTTP (for example `python3 -m http.server`) and open `index.html`. Modules load from `src/` with the vendored libraries in `vendor/`.

Click **INSERT TAPE** to start the audio. At the window, touch the glass to choose **NEW GAME**, **LOAD GAME** (resumes at the last dawn) or **SETTINGS**.

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

1. A normal routine, a window full of light, a roar across the river.
2. The same day. The trash chute at the end of the hall. 4A is empty except for one chair.
3. Callers who know things. Cups lined up on the floor. Something moves inside you.
4. Blood in the sink. Trembling hands. The mirror is late.
5. Mochi gets out. The hallway has no ends and every door is 4B.
6. The hunger. Mochi. Resist, or don't. She will run either way if you don't.
7. It was never a window.

At night something hunts by light. Turn the lamps off, switch off the monitor, stay away from the glass, crouch in the dark. The elevator works. There is only one floor.

## Tech

- three.js r170 rendered at a low internal resolution. Post-processing adds bloom, ACES, dithering, VHS tracking, chroma bleed, grain and curvature. A camera-relative "liminal" bend can stretch the space ahead, curve it and roll it.
- cannon-es physics for props, doors, drawers and the player.
- Mochi is an SDF-sculpted, skinned cat with 24-shell strand fur. The fur has agouti banding, a comb direction, clumping and Kajiya-Kay sheen. She has cupped translucent ears, glossy corneas, slit pupils, whiskers, a tongue and fangs, plus procedural gaits and a utility AI.
- Your body is a skinned SDF mesh with IK arms and legs and finger poses. It mutates through shader uniforms: belly, veins, bruising, blood, the split.
- Procedural Web Audio: every sound effect is synthesized at load. Voices come from a formant speech synthesizer with letter-to-sound rules.
- Glass 98 is an immediate-mode Windows 98-style desktop drawn on a 640×480 canvas and shown through a curved CRT shader.
- Verlet cloth for the curtains and the shower curtain. The bathroom mirror is a planar reflection with oblique clipping and a frame-delay ring buffer.

## Build

```sh
npm i --no-save esbuild
node tools/build.mjs      # writes dist/bengrim.html and dist/bengrim.artifact.html
```

`tools/shot.mjs`, `tools/views.mjs` and `tools/distcheck.mjs` are headless Playwright helpers for screenshots and smoke tests. Add `?capture` to the URL to keep the drawing buffer. `window.BENGRIM` exposes `day(n)`, `tp(x, z, yaw, pitch)` and `fast(frames)` for debugging.

Third-party licenses are in `vendor/LICENSE-*.txt`.
