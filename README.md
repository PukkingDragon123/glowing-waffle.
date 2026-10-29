# ต้มยำกุ้ง ๒๕๔๐ · TOM YUM 2540

A first-person political horror game set in Bangkok on **Wednesday 2 July 1997** (B.E. 2540), the morning the Bank of Thailand let the baht float and the "Tom Yum Kung" crisis began. It is always that Wednesday.

You are Nok Saengthong, Room 1407, 14th floor, Sukhumvit Paradise Condotel, off Soi 39. You answer the phones for Siam Prosperity Finance & Securities from a beige PC while depositors panic and the dollar climbs. You feed Khanom the cat, cook rice and a fried egg, make 3-in-1 coffee from the flowered hot-water pot, and go to bed. Then it is 2 July again: the same radio news, the same callers, the same crane falling off the ghost tower across the soi at three o'clock. Each morning a little more has drifted. Your body has not reset. Neither has the cat.

On the first morning a white light comes through the balcony door and goes in through your eyes. Something has been planted in you. It grows, and when you sit down to work it gurgles and clicks and chitters, and the people on the line can hear it.

Every day somebody knocks on the door:

- Win from the motorbike-taxi stand, with ya ba
- Pa Jit from the Prosperity Party, with an envelope of 500 baht
- a smiling man from Meridian Pacific Capital, who wants Room 1407 for one baht
- a student with a petition for the new constitution

What you say to them is the one thing the loop keeps, and the ending reads it back.

Meridian Pacific Capital, the Prosperity Party, Deputy Minister Prasit and everyone at the door are fictional. The villains are an alien-run offshore fund, corrupt politicians and greed. No nationality or ethnic group is the villain. The history around them is real (see below).

## Play

- **From the repo:** serve the repo root over HTTP (for example `python3 -m http.server`) and open `index.html`. Modules load from `src/` with the vendored libraries in `vendor/`. Models, textures and photographs load from `assets/`.
- **Single file:** `dist/tomyum2540.html`. three.js and cannon-es load from jsDelivr. Served from inside the repo it also picks up `assets/`. Opened on its own, it falls back to procedural furniture and drawn textures.

Click once to start; sound needs a gesture. The menu is the window of 1407 at night. The options are written in the condensation on the glass, Khanom sits on the sill, and outside the ship comes down over Sukhumvit into the ghost tower.

| Key | Action |
| --- | --- |
| WASD / mouse | move / look |
| Shift / C | run / crouch |
| E | take, use, open; hold on Khanom to pet; on her again to pick her up |
| F | eat, drink, special action (burn the envelope on the gas, sign the deed...) |
| Left mouse | drag doors, drawers, sliding windows, objects (R / wheel rotate and push) |
| Right mouse | throw |
| Q / 1 / 2 | pocket / take from pocket |
| G | drop |
| 1 / 2 / 3 | answer someone at the door |
| Esc | pause, or stand up from the desk |

At the desk, the mouse and keyboard drive Glass 95. Its apps are the SPF Hotline officer console, Internet Voyager, Inbox and My Computer. Dial in to SiamNet, set yourself **Available**, answer the phone, and use the manual and the account tools to deal with each caller.

## The week

1. The float. A white light from the balcony. A crane falls off the ghost tower at three.
2. The same day. The rubbish chute. 1406's grille is open, and inside is one plastic chair. Win knocks with ya ba.
3. Callers who know things. Cups lined up on the floor. It moves. Pa Jit and the envelope.
4. Blood in the sink. The late reflection. The Deputy Minister on every channel. Mr. Vance from Meridian Pacific.
5. Khanom gets out. The corridor has no ends and every door is 1407. A rally on Sukhumvit. Ploy and the petition.
6. The hunger. Khanom. Resist, or don't.
7. Go out on the balcony.

After dark, something hunts by light. Turn the tube off, switch off the monitor, stay away from the glass and crouch in the dark. The lift works. There is only one floor.

## The real 1997 behind it

- **2 July 1997.** The Bank of Thailand abandoned the baht's peg and moved to a managed float. The baht fell about 15% that day, from roughly 25 to the dollar, and passed 55 in January 1998, with a low of 56.67 on 12 January. The HUD ticker follows that fall.
- **Finance companies.** In late June 1997 the Bank of Thailand suspended 16 finance companies and said there would be no more. On 5 August it suspended 42 more, 58 in all. On 8 December 1997 it closed 56 of them for good. An IMF-led rescue of about US$17.2 billion followed in August.
- **BIBF.** From March 1993 the Bangkok International Banking Facilities let firms borrow cheap foreign money. It fed a property bubble, and by early 1997 about half of all loans to property developers were non-performing.
- **The ghost tower.** Sathorn Unique, a 49-storey condominium begun in 1990, was abandoned unfinished in the crisis and still stands. The game's Meridian Grand Tower is a fictional cousin.
- **Royal Plaza Hotel.** The hotel in Nakhon Ratchasima collapsed on 13 August 1993, killing 137. Floors had been added to a three-storey building.
- **Ya ba.** Methamphetamine pills called *ya ma* ("horse medicine") were renamed *ya ba* ("crazy medicine") around 1996 to scare people off them. They were orange and green tablets stamped "WY" or "R", made mostly in Shan State across the border.
- **Vote buying.** For the 17 November 1996 general election, PollWatch estimated that 20–30 billion baht was spent buying votes, at 100–1,500 baht a vote.
- **The Assembly of the Poor.** It camped outside Government House for 99 days, from 25 January to 6 May 1997.
- **The skyline.**
  - The Hopewell elevated railway (signed 1990, cancelled January 1998) left more than a thousand idle concrete pillars across Bangkok.
  - The BTS Skytrain was being built along Sukhumvit; it opened in December 1999.
  - Baiyoke Tower II, finished in 1997 at 304 m, was the tallest building in Thailand.
- **The constitution.** The "People's Constitution" was promulgated on 11 October 1997. It let 50,000 voters petition to propose a law.

Sources:

- Bangkok Post: "Thanong: 'I'd do the same again'"; "The lowdown on the 1997 financial crisis"
- Yale Program on Financial Stability: case studies on Thailand's Financial Institutions Development Fund
- IMF press releases on Thailand (1997)
- Khaosod English: "'Ghost Tower' haunts Bangkok 20 years after financial crisis"
- Wikipedia: Sathorn Unique Tower; Collapse of the Royal Plaza Hotel; Ya ba; 1996 Thai general election; Bangkok Elevated Road and Train System; Baiyoke Tower II
- Asia-Pacific Solidarity archive: on the Assembly of the Poor
- Focus on the Global South: "Easy Money on Silom Street"

## Look

The game is low-poly, hand-painted pixel art with black ink outlines:

- **Low resolution.** The world renders at 360 lines by default and is upscaled with nearest filtering.
- **Palette.** Colour is limited to a set palette with a 4×4 Bayer dither.
- **Facets.** Every material is flat-shaded into facets.
- **Texels.** Painted surfaces and props are resampled to about 64 texels a metre and shown nearest, so each texel reads as a placed pixel.
- **Khanom** is a faceted low-poly cat in a red collar with a gold bell.

The pause menu has sliders for pixel art, ink lines, the painterly filter, VHS and grain.

## Real photographs for 2D art

Every poster, sign, label, billboard and painting is drawn through `printed(key, ...)` in `src/gfx/textures.js`. If `assets/images/<key>.jpg` is listed in `assets/images/manifest.json`, the game uses that photograph instead of the drawing.

`tools/images.py` fetches the photographs from Wikimedia Commons. It accepts only public-domain, CC0, CC BY and CC BY-SA files, and records the author, licence and source page of each. It needs network access to `commons.wikimedia.org` and `upload.wikimedia.org`. Results from general image search aren't used, because most of them are copyrighted.

## Tech

- **Rendering.** three.js r170 at a low internal resolution. Post-processing adds bloom, ACES, a Kuwahara painterly filter, depth and colour ink lines, palette quantisation with ordered dither, VHS tracking, chroma bleed, grain and curvature. A camera-relative "liminal" bend can stretch the space ahead, curve it and roll it.
- **Physics.** cannon-es for props, doors, drawers, sliding windows, the plastic chairs and the player.
- **Khanom.** An SDF-sculpted, skinned cat with procedural gaits, poses and a utility AI.
- **Your body.** A skinned SDF mesh with IK arms and legs and finger poses. It mutates through shader uniforms: belly, veins, bruising, blood, the split.
- **Sound.** Procedural Web Audio: every sound is synthesised at load. That includes:
  - the luk thung station on the pink radio and the lakorn through the wall
  - tokay geckos, the street fourteen floors down, monsoon rain and thunder
  - the stand fan, the LPG ring, the pager and the seed

  Voices come from a formant speech synthesiser with letter-to-sound rules.
- **Glass 95.** An immediate-mode desktop drawn on a 640×480 canvas and shown through a curved CRT shader.
- **Cloth and mirror.** Verlet cloth for the curtains and the shower curtain. The bathroom mirror is a planar reflection with oblique clipping and a frame-delay ring buffer.
- **Props.** `src/world/thai.js` builds them from primitives: monobloc chairs and street stools, the stand fan, rice cooker, airpot, gas stove and LPG bottle, spirit house, Buddha shelf, steel liquor shelf, pink radio, turntable, split air-con, mosquito coil, and a teak bed with a bolster and a mosquito net.
- **Corridor.** Terrazzo floors, steel grille gates and shoe racks by every door.

## Build

```sh
npm i --no-save esbuild
node tools/build.mjs      # writes dist/tomyum2540.html and dist/tomyum2540.artifact.html
```

`tools/shot.mjs`, `tools/views.mjs` and `tools/distcheck.mjs` are headless Playwright helpers for screenshots and smoke tests. `window.BENGRIM` (also `window.TOMYUM`) exposes `day(n)`, `tp(x, z, yaw, pitch)`, `hour(h)` and `fast(frames)` for debugging. `?day=n` jumps straight into a day.

## Credits

- **Models and surface textures:** Poly Haven (CC0). See `assets/manifest.json`.
- **Real photographs, when fetched:** Wikimedia Commons, each credited in `assets/images/manifest.json`.
- **Third-party licences:** `vendor/LICENSE-*.txt`.
