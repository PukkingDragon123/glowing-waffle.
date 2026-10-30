// Default disk contents for Sunny's computer, plus files that change by themselves.

const MORSE = `LIFELINE 24 — AGENT REFERENCE CARD 7
INTERNATIONAL MORSE CODE
(For non-verbal callers, ships, and "the tapping guy")

  A ·–        N –·        0 –––––
  B –···      O –––       1 ·––––
  C –·–·      P ·––·      2 ··–––
  D –··       Q ––·–      3 ···––
  E ·         R ·–·       4 ····–
  F ··–·      S ···       5 ·····
  G ––·       T –         6 –····
  H ····      U ··–       7 ––···
  I ··        V ···–      8 –––··
  J ·–––      W ·––       9 ––––·
  K –·–       X –··–      .  ·–·–·–
  L ·–··      Y –·––      ?  ··––··
  M ––        Z ––··

A short beep is a dot (·), a long beep is a dash (–).
Letters are separated by a space, words by a slash ( / ).

Example:  ···· ·  ·–·· ·–·· –––  =  HELLO

Type the decoded message into the response line of the Agent
Console. Punctuation is optional. Spelling is not.`;

const PHRASEBOOK = `GARY'S PHRASEBOOK (Seventh Drift ⇄ Earth)
written by Gary, for Sunny, so you can talk to my mother
-----------------------------------------------------------
vehl ............ sleep, rest, "close the four eyes"
oru ............. little one, small, the youngest
thessa .......... star; also: light; also: you (to a loved one)
minn ............ home, nest, the warm place
kaa ............. no / please stop / I am full
shurrr .......... I love you (must be purred, not said)
glib ............ noodle (my favourite Earth word)
glib-glib ....... many noodles, a feast
drexx ........... tax season
ploon ........... the moon, but rude
vaash ........... your mother (complimentary)
zeel ............ to sing quietly so the baby will sleep
ka-thessa ....... a dying star; also: a bad hair day
oru-vehl ........ "it is bedtime, little one"

GRAMMAR (sorry)
- Repeating a word makes it plural, or louder, or sadder.
- "minn-oru" means "the little one's home" = the nursery.
- We count: ek, dra, mol, thu, va. Then we stop. Five is enough.

NOTES
- If my people ever sing to you, they are not threatening you.
  Probably. We only threaten in a minor key.
- Sunny please stop teaching my mother the word "skibidi".`;

const DOORWAYS_HELP = `DOORWAYS 98 HELP
================
Welcome to Doorways 98, the operating system that opens doors.

THE BEGIN BUTTON
  Click Begin to open programs, documents and settings.
  To stop using your computer, click Begin, then Shut Down.
  (Yes, you click Begin to end. This is a feature.)

WINDOWS
  Drag a title bar to move a window. Drag the bottom-right
  corner to resize it. Double-click a title bar to maximize.

DESKTOP
  Double-click an icon to open it. Drag icons to rearrange.
  Right-click the desktop for more options.

KEYBOARD
  ESC ......... stand up from the computer
  ENTER ....... confirm
  1–4 ......... choose a response during a call

TROUBLESHOOTING
  If your computer is making noises it shouldn't, that is
  probably the wall.`;

const SCRIPTS = `LIFELINE 24 — APPROVED OPENING LINES
(memorise; Doreen is listening. Doreen is always listening.)

1. "LIFELINE 24, this is [NAME]. How can I help?"
2. "Thank you for calling LIFELINE 24, where we answer everything."
3. NOT approved: "What."
4. NOT approved: "This had better be good."
5. NOT approved: any sentence beginning with "Look, lady".

CLOSING
- "Is there anything else I can help you with today?"
- Never promise a caller they are "going to be fine."
  Legal is still dealing with the 1996 incident.

RATINGS
Callers rate you 1–5 stars after the call. Stars are pay.
Tips are added by the caller and are taxed by nobody.`;

const SWITCHBOARD = `SWITCHBOARD QUICK GUIDE
Drag the cable from LINE 1 to a department jack to transfer.

  BILLING ......... money, refunds, "why is my bill haunted"
  TECH ............ devices, routers, fridges, remotes
  PARANORMAL ...... approved PPR-3 returns only
  LEGAL ........... threats, lawsuits, the 1996 incident
  PIZZA PRONTO .... partner line (we earn $2 per transfer)
  THE VOID ........ prank callers. Do not listen to the void.

Wrong transfers are logged. Doreen reads the logs at night.`;

const DEESC = `DE-ESCALATION 101
- Breathe. In for four, out for four.
- Repeat their problem back to them.
- Do not repeat what the wall says back to the wall.
- If a caller is crying, let them. If the caller is you, hang up.`;

const SHOPPING = `shopping (no fridge edition)
- noodles (all of them)
- pickles???  why do i want pickles
- eggs - eat fast, no fridge
- ice (melts. buy small. drink fast. lick bag.)
- cat food for Tofu  <- he's coming back. he is.
- something for the baby?? what do aliens drink
- chalk  (do NOT ask why)`;

const SETLIST = `GOLDEN LOTUS KARAOKE — DJ SUNNY — FRIDAY SET
1. opener - something with a key change
2. the slow one Gary cried at
3. duet (Gary insists on singing the girl part. he's right.)
4. the one where everybody does the arm thing
5. CLOSER: our song. "the night the sky fell in love"
   (it's not a real song. Gary wrote it. he hummed it to me
    in the stairwell and then the stairwell lights all came on.)`;

const NAMES = `baby names (shortlist)
- Bean  (current favourite, he looks like one in the scan)
- Gary Jr. (Gary vetoed: "one of me is plenty for this planet")
- Thessa (means star, Gary says)
- Kevin  (NO)
- Sunny Jr. (too much sunshine)
- Ploon  (Gary laughed for an hour, refused to explain)`;

const CHECKLIST = `HOSPITAL BAG — (no hospital will take us)
[x] towels (many)
[x] snacks
[ ] a doctor who has seen this before
[ ] a doctor who has seen anything like this before
[x] Gary's cardigan (smells like him)
[ ] someone to hold my hand`;

const EARTH = `EARTH CUSTOMS (Gary's notes, transcribed from the fridge)
- "Bless you" is said when a human expels air violently. Do NOT
  bless the vacuum cleaner.
- Humans hold hands to show love. Only two hands, both from arms.
- Sunny says "I could eat a horse." Sunny has never eaten a horse.
  Sunny eats noodles. I will not bring a horse again.
- Cats are pets. Tofu is a pet. Tofu looks at me like he knows
  what I am. Tofu looks at the news like he knows what it is.
- Karaoke: a ritual where the saddest person sings the happiest song.
- Fridge: a cold box. We had one. It was taken. Now it lives
  only in these notes.`;

const POEM = `for Sunny

on my world we have nine moons
and none of them is as round as you right now
(this is a compliment, I checked with your mother)

when I was falling
(that is how I arrived, falling)
I saw one window lit on the fourteenth floor
and a man inside singing badly into a hairbrush

I thought: there.
I will land there.

— G.`;

const RESIGN = `Dear Doreen,

I quit.

No, wait. I need the money. Baby on the way. Disregard.

Dear Doreen, thank you for the opportunity to
(saved draft — 14 Jan)`;

// Text that changes with the day. Read via comp.fileText(node).
export function dynamicText(key, game) {
  const day = game.state?.day ?? 1;
  const baby = game.state?.baby?.name || 'Bean';
  if (key === 'do_not_open') {
    return [
      '',
      'do not open',
      'i said do not open\n\n                 ok it is day 1. you are alone. eat something.',
      `he is born. he is perfect. his eyes are ponds at midnight.\n\nhe watched you sleep last night.\nhe watched the corner, mostly.\nthere is nothing in the corner.\n\nthere is nothing in the corner.`,
      `the wall is warm today. put your hand on it.\n\n                knock once if you can read this.\n\n(you can hear something knock back, can't you)`,
      `someone is listening to your calls. they have a pen.\nthey are writing down the word "fourteen."\n\nthe cat is not lost. the cat is in a meeting.`,
      `TODAY:\n  09:00  noodles\n  13:00  shift\n  ??:??  boots on the stairs\n  ??:??  a suit\n\nyou will be fine.\n(legal says we can't promise that)`,
    ][Math.min(day + 1, 6)] || '...';
  }
  if (key === 'baby_log') {
    if (!game.state?.baby?.born) return 'BABY LOG\n\n(nothing yet. just kicks. strong kicks. kicks that bend spoons.)';
    return `BABY LOG — ${baby}\n\nday 2: born. glowed. hovered. cried in a frequency the neighbour's dog hated.\n` +
      (day >= 3 ? 'day 3: first smile. three lightbulbs went out at once. coincidence.\n' : '') +
      (day >= 4 ? 'day 4: he said a word. the word was "noodle". in Gary\'s voice.\n' : '') +
      (day >= 5 ? 'day 5: he will not stop looking at the door.\n' : '');
  }
  return '';
}

export function defaultTree() {
  const txt = (name, text, extra = {}) => ({ type: 'txt', name, text, ...extra });
  const img = (name, gen) => ({ type: 'img', name, gen });
  const dir = (name, kids, extra = {}) => ({ type: 'dir', name, kids, ...extra });
  return dir('/', [
    dir('My Documents', [
      txt('shopping_list.txt', SHOPPING),
      txt('karaoke_setlist.txt', SETLIST),
      txt('do_not_open.txt', '', { dyn: 'do_not_open' }),
      txt('resignation_DRAFT.txt', RESIGN),
      img('us_at_the_karaoke_bar.img', 'wedding'),
      dir('Paintings', []),
    ], { system: true }),
    dir('Hotline Training', [
      txt('morse_chart.txt', MORSE),
      txt('approved_scripts.txt', SCRIPTS),
      txt('switchboard_guide.txt', SWITCHBOARD),
      txt('de-escalation.txt', DEESC),
      txt('doorways_help.txt', DOORWAYS_HELP),
    ], { system: true }),
    dir("Gary's Stuff", [
      txt('gary_phrasebook.txt', PHRASEBOOK),
      txt('earth_customs.txt', EARTH),
      txt('poem_for_sunny.txt', POEM),
      img('selfie_attempt.img', 'gary_selfie'),
    ], { system: true }),
    dir('Baby', [
      txt('names.txt', NAMES),
      txt('hospital_bag.txt', CHECKLIST),
      txt('baby_log.txt', '', { dyn: 'baby_log' }),
      img('scan_week_3.img', 'ultrasound'),
    ], { system: true }),
    dir('Recycle Bin', [], { system: true }),
  ], { system: true });
}

// Procedural "photos" for the image viewer (drawn at 240×180 and shown pixelated).
export function drawGenImage(key, ctx, w, h) {
  const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };
  if (key === 'ultrasound') {
    R(0, 0, w, h, '#000');
    const g = ctx.createRadialGradient(w / 2, h * 0.95, 10, w / 2, h * 0.95, h);
    g.addColorStop(0, 'rgba(180,180,170,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.arc(w / 2, h, h * 0.95, -Math.PI * 0.82, -Math.PI * 0.18); ctx.fill();
    for (let i = 0; i < 2600; i++) { const a = -Math.PI * (0.18 + Math.random() * 0.64), r = Math.random() * h * 0.95; ctx.fillStyle = `rgba(220,220,210,${Math.random() * 0.25})`; ctx.fillRect(w / 2 + Math.cos(a) * r, h + Math.sin(a) * r, 1, 1); }
    ctx.fillStyle = 'rgba(30,30,30,0.9)'; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.5, 46, 40, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(200,200,190,0.55)'; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.47, 30, 26, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(w / 2 - 12, h * 0.47, 9, 12, 0.35, 0, 7); ctx.ellipse(w / 2 + 12, h * 0.47, 9, 12, -0.35, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(w / 2 - 14, h * 0.43, 2, 2); ctx.fillRect(w / 2 + 10, h * 0.43, 2, 2);
    ctx.font = '9px monospace'; ctx.fillStyle = '#ddd'; ctx.fillText('GA: 3w?? (ERR)', 6, 12); ctx.fillText('HR: 412 bpm', 6, 23); ctx.fillText('IT IS LOOKING AT THE PROBE', 6, h - 6);
  } else if (key === 'wedding') {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a1440'); g.addColorStop(1, '#120612'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = ['#ff4fa3', '#ffd34f', '#4fd2ff'][i % 3]; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h * 0.5, 2 + Math.random() * 3, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    // Sunny
    R(60, 95, 50, 85, '#8a8a8a'); ctx.fillStyle = '#c68642'; ctx.beginPath(); ctx.arc(85, 78, 18, 0, 7); ctx.fill(); R(68, 58, 34, 10, '#1a1a1a'); R(76, 76, 3, 3, '#000'); R(90, 76, 3, 3, '#000'); R(80, 87, 10, 2, '#5a2a1a');
    R(108, 110, 22, 6, '#c68642'); ctx.fillStyle = '#ff4fa3'; ctx.fillRect(126, 100, 6, 20);
    // Gary (tall)
    R(140, 92, 44, 88, '#c9b48a'); ctx.fillStyle = '#b6b8c4'; ctx.beginPath(); ctx.ellipse(162, 60, 26, 32, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(152, 62, 8, 12, 0.4, 0, 7); ctx.ellipse(172, 62, 8, 12, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#9a7fc0'; [[146, 44], [176, 40], [160, 84]].forEach(([x, y]) => ctx.fillRect(x, y, 3, 3));
    R(157, 82, 10, 2, '#555');
    ctx.font = 'italic 11px serif'; ctx.fillStyle = '#ffd34f'; ctx.fillText('just married!! (Gary paid in moon rocks)', 8, h - 8);
  } else if (key === 'gary_selfie') {
    R(0, 0, w, h, '#d9cdb2');
    ctx.fillStyle = '#b6b8c4'; ctx.beginPath(); ctx.ellipse(w / 2 + 30, h * 0.55, 120, 140, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(w / 2 - 10, h * 0.45, 30, 46, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(w / 2 - 22, h * 0.32, 6, 6);
    ctx.font = '10px monospace'; ctx.fillStyle = '#333'; ctx.fillText('selfie_attempt_31 (eye too close)', 6, 14);
  } else {
    R(0, 0, w, h, '#888');
  }
}
