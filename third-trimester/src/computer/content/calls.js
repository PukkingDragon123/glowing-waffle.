// LIFELINE 24 calls. Each call is a small dialogue graph.
//
// node: {
//   say: string | string[] | (ctx) => string[]      caller lines ({baby} {day} tokens)
//   sfx: 'knock:N' | 'breath' | 'static' | 'purr' | 'morse:TEXT' | 'giggle' | 'hum'
//   sys: string                                      grey system line
//   choices: [{ text, to, score, tip, set:{var:val}, need:'known-key'|fn, needText, hangup }]
//   input: { prompt, answers:[...], ok, fail, tries }
//   await: { tool:'reset'|'transfer', value, ok, wrong }   (choices stay available while waiting)
//   transfer: { DEPT: node, '*': node }              what a switchboard transfer does here
//   route: (ctx) => nodeId                            instant branch
//   trace: +n                                         add to the trace meter on entry
//   next: nodeId                                      auto-advance after speaking
//   end: { rating, tip, text, flags, emit, noPay }
//   hint: Doreen sticky note
// }
// call: { id, day, kind, name, number, location, topic, voice, portrait, pay, cond, noRating, start, nodes,
//         trace: { rate }, onHangup(ctx) }

export const DAY_PLAN = {
  1: ['agnes', 'dale', 'chen', 'unknown'],
  2: ['kevin', 'lorraine', 'warranty', 'babymimic'],
  3: ['edith', 'kidaliens', 'wallman', 'morse'],
  4: ['finch', 'moonman', 'tomorrow', 'choir'],
  5: ['agnes2', 'brass'],
};

const P = {
  agnes: { skin: '#e9c9a8', hair: '#e8e8ee', style: 'bun', glasses: true, shirt: '#b56fa0', bg: '#2a3f5f', age: 1 },
  dale: { skin: '#f0c8a0', hair: '#7a4a20', style: 'cap', cap: '#c03030', shirt: '#4060a0', bg: '#3a2a1a', beard: '#7a4a20' },
  chen: { skin: '#e8c39a', hair: '#2a2a2a', style: 'short_f', shirt: '#30a080', bg: '#3f2a4a', glasses: true, age: 0.6 },
  kevin: { skin: '#c99068', hair: '#1a1a1a', style: 'messy', shirt: '#e0a020', bg: '#5a2010' },
  lorraine: { skin: '#f2d0b4', hair: '#c0302a', style: 'long', shirt: '#2a6a8a', bg: '#203040', pearls: true },
  edith: { special: 'ghost', skin: '#dfe8f0', hair: '#f0f0f0', style: 'bun', shirt: '#9ab', bg: '#0a1520', age: 1, glasses: true },
  milo: { skin: '#a8714a', hair: '#2a1a10', style: 'messy', shirt: '#30a0e0', bg: '#204a20', kid: true },
  wall: { special: 'wall' },
  cat: { special: 'cat' },
  agent: { skin: '#e8c8a8', hair: '#3a2a20', style: 'slick', shades: true, shirt: '#222', tie: '#111', bg: '#101820' },
  moon: { skin: '#d8b090', hair: '#888', style: 'bald', shirt: '#6a5a3a', bg: '#101030', beard: '#999', age: 0.8 },
  sunny: { skin: '#c68642', hair: '#151515', style: 'short', shirt: '#7a7a7a', bg: '#2a1a14', stubble: true, bruise: true },
  choir: { special: 'choir' },
  baby: { special: 'baby' },
  unknown: { special: 'unknown' },
  general: { skin: '#e2b896', hair: '#ddd', style: 'general', mustache: '#ccc', shirt: '#3a4a2a', bg: '#1a1a10', medals: true, age: 0.7 },
  warranty: { skin: '#f0d0b0', hair: '#c8a040', style: 'slick', headset: true, shirt: '#a02040', tie: '#ffd040', bg: '#401020', grin: true },
};

export const CALLS = {
  // ------------------------------------------------------------------ DAY 1
  agnes: {
    day: 1, name: 'Agnes Holloway', number: '555-0143', location: 'Willow Court Retirement Village', topic: 'TV: "NO SIGNAL"', voice: 'old', portrait: P.agnes, pay: 25,
    start: 's',
    nodes: {
      s: { hint: 'First call! Pick replies with the mouse or keys 1–4. Stuck? The <b>Knowledge Base</b> tab. — D.', say: ['Hello? Is this the television people?'],
        choices: [
          { text: 'LIFELINE 24, this is Sunny. How can I help?', to: 'prob', score: 1 },
          { text: 'What.', to: 'what', score: -1 },
        ] },
      what: { say: ['Oh! You sound like my late husband. He also said "what". Every day for fifty-one years.'], next: 'prob' },
      prob: { say: ['My television just says NO SIGNAL in great big letters. My program starts in eleven minutes. Murder on the Moon. They\'ve already arrested the moon, dear, but I don\'t think it did it.'],
        choices: [
          { text: 'Is the small black box under the TV on? What colour is its light?', to: 'box', score: 1 },
          { text: 'Press INPUT on the remote.', to: 'early_input', score: -1 },
          { text: 'Have you tried giving it a firm smack?', to: 'smack', score: -1 },
        ] },
      early_input: { say: ['I pressed it. It says CHANNEL 3. Then nothing. Then NO SIGNAL again. Is it broken? Is it me? Am I the signal?'], next: 'prob2' },
      smack: { say: ['I smacked it. My cat left the room. It still says NO SIGNAL, and now it says it with an attitude.'], next: 'prob2' },
      prob2: { say: ['What should I try now, dear?'],
        choices: [
          { text: 'Is the small black box under the TV on? What colour is its light?', to: 'box', score: 1 },
          { text: 'Unplug everything and plug it back in.', to: 'unplug', score: -1 },
        ] },
      unplug: { say: ['Everything? The lamp too? The clock? Oh no. Oh, now the clock is blinking twelve. Harold always did the clock.'], next: 'prob2' },
      box: { say: ['There\'s a little light... it\'s red. Is red good? Red is good at Christmas.'],
        choices: [
          { text: 'Red means it\'s off. Press the power button on the box itself.', to: 'green', score: 1 },
          { text: 'Red is great! Now press INPUT.', to: 'redinput', score: -1 },
        ] },
      redinput: { say: ['Still NO SIGNAL. The red light is looking at me. I don\'t like how it\'s looking at me.'],
        choices: [{ text: 'Sorry — red means off. Press the power button on the box.', to: 'green' }] },
      green: { say: ['The one with the little circle... Oh! Green! It went green! Like a tiny frog!'],
        choices: [
          { text: 'Now press INPUT on the long remote until the screen says HDMI 1.', to: 'hdmi', score: 1 },
          { text: 'Perfect. Now unplug it for ten seconds.', to: 'whyunplug', score: -1 },
        ] },
      whyunplug: { say: ['But I only just turned it on. Is this a trick? Harold said the phone people would trick me.'],
        choices: [{ text: 'You\'re right, sorry. Press INPUT on the long remote until it says HDMI 1.', to: 'hdmi' }] },
      hdmi: { say: ['INPUT... it says AV. Then COMPONENT. Then HDMI 2... HDMI 1! Oh! There\'s a man in a lab coat! It\'s on! Oh, the moon is in handcuffs, look at it.'],
        choices: [
          { text: 'Enjoy your program, Agnes.', to: 'bye' },
          { text: 'Is there anything else I can help you with today?', to: 'bye', score: 1 },
        ] },
      bye: { say: ['You\'re a lovely boy. You sound tired, though. Are you eating? You sound like a man eating noodles out of the pot.'],
        choices: [
          { text: '...Every night.', to: 'end' },
          { text: 'I\'m eating fine, thank you.', to: 'end' },
        ] },
      end: { say: ['Put them in a bowl, dear. Things taste better in a bowl. Bye-bye now.'], end: { tip: 3 } },
    },
  },

  dale: {
    day: 1, name: 'Dale Kowalczyk', number: '555-0198', location: '88 Larkspur Lane', topic: 'Locked out of smart fridge', voice: 'man', portrait: P.dale, pay: 30,
    start: 's',
    nodes: {
      s: { say: ['Yeah, hi. My fridge locked me out. It wants a password. It said — I wrote it down — "Are you sure you deserve this, Dale?"'],
        choices: [
          { text: 'What\'s the model number on the fridge?', to: 'model', score: 1 },
          { text: 'Have you tried saying "please"?', to: 'please' },
          { text: 'Sir, we don\'t really do fridges.', to: 'nofridges', score: -2 },
        ] },
      please: { say: ['I said please. It said "please what". I said please fridge. It played a sad trombone noise. It has a speaker, Sunny. Why does a fridge need a speaker.'], next: 's2' },
      nofridges: { say: ['You\'re LIFELINE 24. "We answer everything." It\'s on a magnet. The magnet is on the fridge. Which I cannot open.'], next: 's2' },
      s2: { say: ['So can you help or what?'], choices: [{ text: 'What\'s the model number on the fridge?', to: 'model', score: 1 }] },
      model: { hint: 'Fridge lockouts: Knowledge Base → "Smart Appliances". Then Account Tool → Device Reset. — D.',
        say: ['Sticker says... F-R-4-4-7-1-Q. FR-4471-Q. That sounds like a robot\'s name. Is that a robot\'s name?'],
        await: { tool: 'reset', value: 'Q-1744-RF', ok: 'open', wrong: 'wrongcode' },
        choices: [
          { text: 'One moment, I\'m generating a reset code.', to: 'hold' },
          { text: 'Try 1-2-3-4.', to: 'onetwo', score: -1 },
        ] },
      hold: { say: ['Take your time. I\'ll just stand here. Next to my food. Which I can see. Through the glass. It\'s a lasagna, Sunny.'], await: { tool: 'reset', value: 'Q-1744-RF', ok: 'open', wrong: 'wrongcode' }, choices: [{ text: 'Try 1-2-3-4.', to: 'onetwo', score: -1 }] },
      onetwo: { say: ['It said "Really, Dale?" In my mom\'s voice. How does it have my mom\'s voice.'], await: { tool: 'reset', value: 'Q-1744-RF', ok: 'open', wrong: 'wrongcode' }, choices: [{ text: 'Hold on, I\'m pushing a code to it.', to: 'hold' }] },
      wrongcode: { say: ['It beeped angry. Now the ice maker is making ice at me. Aggressively.'], score: -1, await: { tool: 'reset', value: 'Q-1744-RF', ok: 'open', wrong: 'wrongcode2' }, choices: [{ text: 'Let me double-check the code.', to: 'hold' }] },
      wrongcode2: { say: ['The light turned red. The fridge is humming a funeral song. Please get it right.'], score: -1, await: { tool: 'reset', value: 'Q-1744-RF', ok: 'open', wrong: 'wrongcode2' }, choices: [{ text: 'Checking again...', to: 'hold' }] },
      open: { sys: 'Reset code pushed to device FR-4471-Q.', say: ['Whoa. It beeped nice. It\'s open! It\'s... it\'s so cold. I forgot how cold. Hey — you sound like a guy who hasn\'t seen the inside of a fridge in a while.'],
        choices: [
          { text: 'I don\'t have a fridge.', to: 'nofridge' },
          { text: 'Happy to help, Dale.', to: 'endok', score: 1 },
        ] },
      nofridge: { say: ['...Man. That\'s rough. You want me to describe it to you? There\'s a whole lasagna. Like, a whole one.'],
        choices: [
          { text: '...Yes. Please.', to: 'lasagna', score: 1 },
          { text: 'Please don\'t.', to: 'endok' },
        ] },
      lasagna: { say: ['Okay. So it\'s got layers. Like, a lot. The cheese on top went kind of golden at the corners, the crispy bits, you know the crispy bits. And it\'s cold, and it\'s just... waiting. For me. Like a dog.'], end: { tip: 5, text: 'Dale described the lasagna for four more minutes. You did not interrupt.' } },
      endok: { say: ['Thanks, man. Five stars. Seriously. Buy a fridge.'], end: {} },
    },
  },

  chen: {
    day: 1, kind: 'filler', name: 'Mei-Lin Chen', number: '555-0123', location: '41 Garden Row', topic: '(wrong number?)', voice: 'woman', portrait: P.chen, pay: 10,
    start: 's',
    nodes: {
      s: { say: ['Kenny? Kenny, is that you? You sound thinner.'],
        choices: [
          { text: 'Ma\'am, this is LIFELINE 24. I think you have the wrong number.', to: 'wrong', score: 1 },
          { text: 'Yes, Mom. It\'s me. I\'m eating.', to: 'pretend' },
        ] },
      wrong: { say: ['Oh! Oh, I\'m so sorry. You sound like my son. He never calls. Are you eating, at least?'],
        choices: [{ text: 'I\'m... trying.', to: 'eat' }, { text: 'Mostly noodles.', to: 'eat' }] },
      eat: { say: ['Eat something warm. Something with a vegetable in it. Okay — noodles. But put an egg in. An egg is a vegetable when you\'re tired.'], end: { rating: 5 } },
      pretend: { say: ['Kenny! You never call! ...Wait. Kenny has never once said he\'s eating. Who is this?'], next: 'pretend2' },
      pretend2: { say: ['You know what, I don\'t mind. You sound like you need a mother right now. Go and eat something, and then call yours.'], end: { rating: 4, tip: 2 } },
    },
  },

  unknown: {
    day: 1, name: 'UNKNOWN', number: '— — —', location: 'unknown', topic: '—', voice: 'ghost', portrait: P.unknown, pay: 0, noRating: true,
    start: 's',
    nodes: {
      s: { sfx: 'breath', sys: '(slow breathing)', choices: [{ text: 'LIFELINE 24, how can I help?', to: 'b' }, { text: 'Hello? Who is this?', to: 'b' }] },
      b: { sfx: 'breath', sys: '(the breathing moves closer to the mouthpiece)', next: 'q' },
      q: { say: ['...is it a boy?'], next: 'gone' },
      gone: { sys: 'Caller disconnected.', end: { noPay: true, text: 'Duration 00:00:41. Origin of call: ROOM 1407.' } },
    },
  },

  // ------------------------------------------------------------------ DAY 2
  kevin: {
    day: 2, name: 'Kevin Briggs', number: '555-0110', location: '12 Tram Street', topic: '(no topic given)', voice: 'man', portrait: P.kevin, pay: 22,
    start: 's',
    transfer: { 'PIZZA PRONTO': 'pizza_ok', 'THE VOID': 'void', '*': 'badxfer' },
    nodes: {
      s: { say: ['Yeah, hi, I\'d like a large pepperoni, half pineapple, half — actually all pineapple — and garlic knots.'],
        choices: [
          { text: 'Sir, this is LIFELINE 24. Not a pizza place.', to: 'notpizza', score: 1 },
          { text: 'Large pepperoni, all pineapple. Anything else?', to: 'order' },
        ] },
      notpizza: { hint: 'Pizza misdials go to the partner line. Switchboard tab: drag LINE 1 → PIZZA PRONTO. — D.', say: ['LIFELINE 24? Is that a pizza place? It sounds like a pizza place. Twenty-four slices?'],
        choices: [
          { text: 'Let me transfer you to Pizza Pronto. (Switchboard)', to: 'xferwait' },
          { text: 'No. Goodbye.', to: 'rude', score: -2 },
        ] },
      xferwait: { say: ['Oh, sweet. Hook me up.'], sys: 'Use the Switchboard: patch LINE 1 into PIZZA PRONTO.', choices: [{ text: 'One second...', to: 'xferwait2' }] },
      xferwait2: { say: ['(Kevin is humming the Pizza Pronto jingle. He knows all the words.)'], choices: [{ text: 'Almost there...', to: 'xferwait2' }] },
      rude: { say: ['Wow. Okay. Rude. I\'m still hungry, by the way.'], end: {} },
      order: { say: ['Garlic knots. And a two-litre of the orange one. And can you put a little note on the box that says "proud of you, Kevin"?'],
        choices: [
          { text: 'Sure. "Proud of you, Kevin."', to: 'proud' },
          { text: 'Actually — let me transfer you to the real pizza place.', to: 'xferwait', score: 1 },
        ] },
      proud: { say: ['...Thanks, man. Nobody\'s ever said that. Even on a box. How long?'],
        choices: [{ text: 'Thirty minutes or it\'s free.', to: 'free' }] },
      free: { say: ['Wait, really? Is it free if it never comes?'], choices: [{ text: 'Philosophically? Yes.', to: 'philo' }] },
      philo: { say: ['Deep. I\'m gonna sit by the door. Bye, pizza guy.'], end: { rating: 4, tip: 3, text: 'Kevin will wait three hours by the door and not complain once.' } },
      pizza_ok: { sys: 'Transferred to PIZZA PRONTO. (+$2 referral)', say: ['(a cheerful voice) Pizza Pronto! LIFELINE sent you? Love those guys. Pineapple? Brave. We respect it.'], end: { rating: 5, tip: 2 } },
      void: { sys: 'Transferred to THE VOID.', say: ['(the line fills with a soft, endless wind. Then, faintly: Kevin ordering garlic knots from the void. The void says "sure".)'], end: { rating: 2, text: 'Kevin\'s pizza arrived. Nobody knows who delivered it.' } },
      badxfer: { sys: 'Transfer logged as incorrect.', say: ['Hello? This is a lady in BILLING, I don\'t... do you want a pizza? I don\'t have a pizza.'], end: { rating: 2 } },
    },
  },

  lorraine: {
    day: 2, name: 'Lorraine Delacroix', number: '555-0166', location: '3 Hollow Oak Drive', topic: 'Product return: house', voice: 'woman', portrait: P.lorraine, pay: 35,
    start: 's',
    transfer: { PARANORMAL: 'xfer_ok', '*': 'badxfer' },
    nodes: {
      s: { hint: 'Returns of haunted things? There\'s a policy (PPR-3). Read it before you promise anything. — D.',
        say: ['Hello. I\'d like to return my house.', 'It keeps rearranging the furniture. Last night it put the sofa on the ceiling. Tastefully, I\'ll admit. But still.'],
        next: 'q' },
      q: { say: (ctx) => [ctx.vars.asked ? 'What else do you need to know?' : 'I bought it nineteen days ago. Can it go back?'],
        choices: [
          { text: 'Were you home when the furniture moved?', to: 'ev1', need: (c) => !c.vars.ev1 },
          { text: 'Did anything move upward — against gravity?', to: 'ev2', need: (c) => !c.vars.ev2 },
          { text: 'Did anyone else see it happen?', to: 'ev3', need: (c) => !c.vars.ev3 },
          { text: 'Have you tried asking the house nicely?', to: 'nicely', need: (c) => !c.vars.nice },
          { text: 'I\'m approving your return. Transferring you to PARANORMAL.', to: 'approve' },
          { text: 'I\'m sorry, your claim doesn\'t qualify.', to: 'decline' },
        ].map((c) => ({ ...c, hideLocked: true })) },
      ev1: { set: { ev1: true, asked: true }, say: ['No — I was at my sister\'s. I came back and the dining chairs were stacked in a little pyramid. In size order. Biggest at the bottom. Considerate, really.'], next: 'q' },
      ev2: { set: { ev2: true, asked: true }, say: ['Well — the sofa went up. To the ceiling. So: upward, yes. Also the cutlery drawer. All the forks are on the ceiling. The spoons stayed. The spoons are loyal.'], next: 'q' },
      ev3: { set: { ev3: true, asked: true }, say: ['Mr. Biscuits saw everything. My dog. He watched the whole thing from the stairs. He hasn\'t blinked since Tuesday.'], next: 'q' },
      nicely: { set: { nice: true, asked: true }, say: ['I left it a note. It corrected my spelling.'], next: 'q' },
      approve: { route: (c) => (c.vars.ev1 && c.vars.ev2 && c.vars.ev3 ? 'approved' : 'badapprove') },
      approved: { say: ['Oh, thank goodness. Who do I talk to? Somebody who handles... this?'], sys: 'Patch LINE 1 into PARANORMAL on the Switchboard.', choices: [{ text: 'Connecting you now...', to: 'approved' }] },
      badapprove: { say: ['You\'re approving it? Just like that? Without... evidence? Will I get in trouble? Will you?'], end: { rating: 2, text: 'Audit flag raised: PPR-3 approved without evidence.' } },
      decline: { route: (c) => (c.vars.ev1 && c.vars.ev2 && c.vars.ev3 ? 'baddecline' : 'okdecline') },
      okdecline: { say: ['Fine. I\'ll keep it. It did make me breakfast this morning. Floating eggs. Sunny side up. Is that you? Sunny? Funny.'], end: { rating: 3 } },
      baddecline: { say: ['But I gave you everything! The pyramid! The forks! Mr. Biscuits! ...I\'m going to tell the house you said no. It won\'t like that.'], end: { rating: 1 } },
      xfer_ok: { route: (c) => (c.vars.ev1 && c.vars.ev2 && c.vars.ev3 ? 'xfer_good' : 'badapprove') },
      xfer_good: { sys: 'Transferred to PARANORMAL.', say: ['(a calm voice) Paranormal, this is Gwen. Is the house listening right now? Okay. Don\'t make eye contact with the stairs. We\'ll take it from here.'], end: { rating: 5, tip: 4 } },
      badxfer: { sys: 'Transfer logged as incorrect.', say: ['(muffled) I\'ve been put through to... LEGAL? I don\'t want to sue the house. I just want it to stop being helpful.'], end: { rating: 2 } },
    },
  },

  warranty: {
    day: 2, kind: 'filler', name: 'Eternal Assurance Ltd', number: '800-666-0000', location: 'a call centre that smells of sulphur', topic: 'Outbound sales (???)', voice: 'woman', portrait: P.warranty, pay: 0, noRating: true,
    start: 's',
    nodes: {
      s: { say: ['Hi there! We\'ve been trying to reach you about your soul\'s extended warranty!'],
        choices: [
          { text: 'Not interested.', to: 'bye' },
          { text: 'What does it cover?', to: 'cover' },
        ] },
      cover: { say: ['Accidental damnation, minor possession, and one free exorcism per calendar year! Deductible: just your firstborn\'s name.'],
        choices: [
          { text: 'His name is {baby}.', to: 'name', need: (c) => c.game.state?.baby?.born, needText: '(you don\'t have a firstborn — yet)' },
          { text: 'Absolutely not.', to: 'bye' },
          { text: 'Do you have a fridge plan?', to: 'fridge' },
        ] },
      fridge: { say: ['Sir, this is a soul warranty. ...We do have a fridge plan. It\'s worse.'], next: 'cover' },
      name: { flags: { soul_warranty: true }, say: ['{baby}. Lovely. We\'ve made a note. We\'re always taking notes.'], sys: 'Caller disconnected. A faint smell of matches remains.', end: { noPay: true } },
      bye: { say: ['No problem! We\'ll call again. We always call again.'], end: { noPay: true } },
    },
  },

  babymimic: {
    day: 2, name: 'HOME', number: '555-1407', location: 'Golden Lotus Mansions, 1407', topic: '—', voice: 'baby', portrait: P.baby, pay: 0, noRating: true,
    cond: (g) => !!g.state?.baby?.born,
    start: 's',
    nodes: {
      s: { sys: 'Caller ID: your own number.', say: ['no... sig... nal.', 'dada. NO SIGNAL. murder... on the moon.'],
        choices: [
          { text: '{baby}? Is that you?', to: 'b' },
          { text: 'Who is this?', to: 'b2' },
        ] },
      b: { sfx: 'giggle', say: ['dada.'], next: 'room' },
      b2: { say: ['you sound tired, dear. are you eating?'], next: 'room' },
      room: { sys: '(the line fills with the sound of your own apartment, recorded from somewhere very close to the ceiling)', next: 'end' },
      end: { sys: 'Caller disconnected.', end: { noPay: true, text: 'Call originated from: THE CRIB.' } },
    },
  },

  // ------------------------------------------------------------------ DAY 3
  edith: {
    day: 3, name: 'Edith Marrow', number: '555-0117', location: '14 Lantern Street', topic: 'No dial tone', voice: 'ghost', portrait: P.edith, pay: 25,
    start: 's',
    nodes: {
      s: { say: ['Hello, dear? My telephone won\'t give me a dial tone. I pick it up and there\'s just... a sort of wind.'],
        choices: [
          { text: 'Can I get your name and number, ma\'am?', to: 'id', score: 1 },
          { text: 'Have you tried turning it off and on again?', to: 'onoff' },
        ] },
      onoff: { say: ['It doesn\'t turn off, dear. It\'s a telephone. It\'s been on since 1961.'], next: 'id0' },
      id0: { say: ['I\'m Edith, by the way.'], choices: [{ text: 'Can I get your full name and number?', to: 'id' }] },
      id: { say: ['Edith Marrow. 555-0117. 14 Lantern Street. I\'ve had the same number since 1961, you know. Through three husbands and a hurricane.'], next: 'hub' },
      hub: { hint: 'Dead line? Look the number up in the Account Tool. The Daily Pulse has an obituary archive. — D.',
        say: (c) => [c.vars.hubbed ? 'Are you still there, dear?' : 'Can you fix it?'], set: { hubbed: true },
        choices: [
          { text: 'Try unplugging the phone from the wall.', to: 'cord' },
          { text: 'Have you tried a different phone?', to: 'other', score: -1 },
          { text: 'Edith... our records say this line was disconnected in 1987.', to: 'truth', need: 'edith_dead', needText: '(look her up first — Account Tool or the obituaries)' },
          { text: 'Please hold while I look into it.', to: 'holdon' },
        ] },
      cord: { say: ['I tried. The cord isn\'t plugged into anything. I don\'t think it ever was. Isn\'t that strange?'], next: 'hub' },
      other: { say: ['There\'s only this one. It\'s warm, like somebody just put it down.'], next: 'hub' },
      holdon: { say: ['That\'s alright. I\'m very good at waiting.'], next: 'hub' },
      truth: { say: ['1987? No, that\'s... that was the year of the big storm. I went out to get the washing in...', '...I went out to get the washing in.'],
        choices: [
          { text: 'I\'m so sorry, Edith. I think you passed away that night.', to: 'truth2', score: 2 },
          { text: 'That must be a mistake. Ignore me.', to: 'denial', score: -2 },
        ] },
      denial: { say: ['Oh, good. I\'ll keep trying, then. Every night. At 3:12.'], end: { rating: 2, text: 'At 3:12 a.m., your phone rings once.' } },
      truth2: { say: ['Oh. Oh, I see. That would explain the wind. And why nobody visits anymore.', 'Is it... is it alright to go, do you think? Somebody keeps leaving the porch light on for me.'],
        choices: [
          { text: 'It\'s alright. You can go now.', to: 'go', score: 1 },
          { text: 'You can stay on the line as long as you like.', to: 'stay' },
        ] },
      go: { flags: { edith_free: true }, say: ['Thank you, dear. You go and look after your little one now. I can hear him. He can hear me too.'], sys: 'The line goes quiet. Somewhere, a porch light clicks off.', end: { rating: 5, tip: 13.13 } },
      stay: { say: ['No, no. You\'ve got your own little one to look after. Goodnight, dear.'], end: { rating: 4, tip: 5 } },
    },
  },

  kidaliens: {
    day: 3, kind: 'filler', name: 'Milo Park (age 8)', number: '555-0199', location: '"my house"', topic: 'Question', voice: 'kid', portrait: P.milo, pay: 12,
    start: 's',
    nodes: {
      s: { say: ['Hi. Do aliens like pizza? My dad says aliens aren\'t real, but my dad also says the moon is made of cheese, so.'],
        choices: [
          { text: 'Aliens love noodles, actually.', to: 'noodles', score: 1 },
          { text: 'That\'s classified.', to: 'classified' },
        ] },
      noodles: { say: ['WHOA. How do you know?'], choices: [{ text: 'I married one.', to: 'married' }, { text: 'I just do.', to: 'classified' }] },
      married: { say: ['...COOL. Can he come to my birthday? I\'m gonna have a bouncy castle.'], choices: [{ text: 'He\'s... away right now.', to: 'away' }] },
      away: { say: ['Oh. My dad goes away sometimes too. For work. He always comes back with a toy. Maybe yours will too.'], end: { rating: 5 } },
      classified: { say: ['Is that because the army took them? There were trucks on TV. A big lady was crying. I made her a drawing.'], end: { rating: 4 } },
    },
  },

  wallman: {
    day: 3, name: 'Unit 1407-W (wall)', number: 'INTERNAL', location: 'inside your wall, behind the desk', topic: 'Wi-Fi not working', voice: 'man', portrait: P.wall, pay: 30,
    muffled: true,
    start: 's',
    nodes: {
      s: { hint: 'Wall tenants are customers too. KB → "Callers residing inside walls" and "Router models". — D.',
        say: ['Hello? Hi. Don\'t be alarmed. I\'m calling from inside your wall. The one behind your desk.', 'My Wi-Fi is down. And I can\'t really talk — the insulation. I\'ll knock. One knock is yes. Two is no.'],
        sfx: 'knock:1', next: 'q' },
      q: { say: (c) => [c.vars.qn ? '' : ''], set: { qn: true },
        choices: [
          { text: 'Does your router have antennas?', to: 'ant' },
          { text: 'Is the light on the router blue?', to: 'blue' },
          { text: 'Is the light orange?', to: 'orange' },
          { text: 'Are you a ghost?', to: 'ghost' },
          { text: 'Tell him: press the WPS button three times.', to: 'right' },
          { text: 'Tell him: hold RESET for ten seconds.', to: 'wrong1' },
          { text: 'Tell him: unplug it for thirty seconds.', to: 'wrong2' },
          { text: 'Tell him: turn it upside down.', to: 'wrong3' },
        ].map((c) => ({ ...c, hideLocked: true })) },
      ant: { sfx: 'knock:2', sys: '*knock* ... *knock*', next: 'q' },
      blue: { sfx: 'knock:2', sys: '*knock* ... *knock*', next: 'q' },
      orange: { sfx: 'knock:1', sys: '*knock*', next: 'q' },
      ghost: { sfx: 'knock:6', sys: '*knockknockknockknockknockknock* (he sounds offended)', score: -1, next: 'q' },
      wrong1: { sfx: 'knock:2', sys: '*knock* *knock* ... *knock* *knock*', score: -1, next: 'q' },
      wrong2: { sfx: 'knock:2', sys: 'Silence. The lights in your apartment flicker for exactly thirty seconds. Then: *knock* *knock*', score: -1, next: 'q' },
      wrong3: { sfx: 'knock:2', sys: 'A long scraping sound, very close to your ear. Then: *knock* *knock*', score: -1, next: 'q' },
      right: { sfx: 'knock:1', score: 2, sys: 'A pause. One long, grateful knock.', say: ['Oh! It worked! Four bars! In a wall! Thanks, neighbour. I\'ll keep it down at night. Mostly. And — congrats on the baby. He knocks back, you know.'], end: { tip: 6 } },
    },
  },

  morse: {
    day: 3, name: '*** ***', number: '··· ···', location: 'SIGNAL ORIGIN: [FACILITY 9]', topic: '—', voice: 'cat', portrait: P.cat, pay: 20,
    start: 's',
    nodes: {
      s: { hint: 'Beeps? That\'s Morse. Chart: My Computer → Hotline Training → morse_chart.txt. — D.',
        sfx: 'static', sys: '(static... a deep, rumbling purr... then beeps)', next: 'm' },
      m: { sfx: 'morse:TOFU OK / WAIT FOR THE SUIT',
        input: { prompt: 'Type the decoded message:', answers: ['TOFU OK WAIT FOR THE SUIT'], ok: 'ok', fail: 'fail', tries: 4 },
        choices: [
          { text: 'Play it again.', to: 'm' },
          { text: 'Tofu?? Tofu, is that you?', to: 'tofu' },
        ] },
      tofu: { sfx: 'purr', sys: '(the purring gets louder, then very businesslike)', next: 'm' },
      ok: { flags: { morse: true }, sys: 'Decoded: TOFU OK. WAIT FOR THE SUIT.', say: ['mrrp.'], end: { rating: 5, tip: 50, text: 'Tip received: $50.00 — sender: "THE BOARD".' } },
      fail: { sys: '(the purring stops. A long, disappointed silence. Then the line goes dead.)', end: { rating: 2 } },
    },
  },

  // ------------------------------------------------------------------ DAY 4
  finch: {
    day: 4, name: 'John Smith', number: '555-0000', location: '"just a regular house"', topic: 'Toaster not toasting', voice: 'agent', portrait: P.agent, pay: 35,
    trace: { rate: 1.35 },
    start: 's',
    onHangup: (c) => {
      if (c.trace >= 100) return null;
      const knew = c.known('registry') || c.known('finch_gov') || c.known('protocol7');
      c.game.state.flags.finch_evaded = true;
      return { rating: knew ? 5 : 4, text: `Line trace interrupted at ${Math.floor(c.trace)}%. Protocol 7: successful.` };
    },
    nodes: {
      s: { hint: 'Toasters are in the Product Registry. Anything odd → Protocol 7. — D.',
        say: ['Hi there. Hi. Name\'s Smith. John Smith. Regular guy. Regular house. I have a toaster problem.', 'It\'s a BreadZapper 3000. It zaps bread. It\'s stopped zapping.'],
        choices: [
          { text: 'What seems to be the problem with it?', to: 'loc' },
          { text: 'Can I get the number on your account?', to: 'num' },
          { text: 'Sir, BreadZapper toasters were never manufactured.', to: 'busted', need: (c) => c.known('registry') || c.known('finch_gov'), needText: '(check the Product Registry first)' },
        ] },
      num: { say: ['It\'s, uh, 555-0000. All zeroes. Lucky number. Very normal number.'], trace: 4, next: 's2' },
      s2: { say: ['So, about my toaster.'], choices: [
        { text: 'What seems to be the problem with it?', to: 'loc' },
        { text: 'Sir, BreadZapper toasters were never manufactured.', to: 'busted', need: (c) => c.known('registry') || c.known('finch_gov'), needText: '(check the Product Registry first)' },
      ] },
      busted: { say: ['...Ha. Ha ha. Good one. You\'re funny. Listen, buddy — what floor are you on?'], trace: 8, next: 'loc2' },
      loc: { say: ['It\'s broken. Toaster-wise. Say, where are you located? I\'d like to mail it in for repair.'], trace: 5, next: 'loc2' },
      loc2: { say: ['Real quick — which building are you calling from? I hear traffic. Fourteenth-floor kind of traffic.'],
        choices: [
          { text: 'I\'m not able to share that, sir.', to: 'baby', trace: 3 },
          { text: 'Golden Lotus Mansions.', to: 'baby', trace: 40, flags: { gave_address: true } },
          { text: 'I\'m calling from the moon.', to: 'moon', trace: 2 },
          { text: '[Hang up — Protocol 7]', hangup: true },
        ] },
      moon: { say: ['The moon. Sure. (scribbling) M... O...'], next: 'baby' },
      baby: { say: ['Is that a baby I hear? Little guy sounds... different.'], trace: 5,
        choices: [
          { text: 'That\'s the TV.', to: 'tv' },
          { text: 'Leave him out of this.', to: 'final', trace: 10 },
          { text: 'Yes, that\'s {baby}.', to: 'final', trace: 25 },
          { text: '[Hang up — Protocol 7]', hangup: true },
        ] },
      tv: { say: ['Mm-hm. Funny. TVs don\'t usually say "dada" in my voice.'], next: 'final' },
      final: { say: ['Almost there. Just keep talking, buddy. Tell me about the toaster.'],
        choices: [
          { text: 'It zaps bread.', to: 'final2', trace: 10 },
          { text: '[Hang up — Protocol 7]', hangup: true },
        ] },
      final2: { say: ['Mm-hm. Mm-hm. Keep going.'], choices: [
        { text: 'The bread... is zapped.', to: 'final2', trace: 10 },
        { text: '[Hang up — Protocol 7]', hangup: true },
      ] },
      traced: { flags: { traced: true }, say: ['Thank you, Mr. Sunny. Room 1407. Golden Lotus Mansions. Lovely view, I\'m told.', 'Tell the cat we said hello.'], sys: 'TRACE COMPLETE.', end: { rating: 1, noPay: true } },
    },
  },

  moonman: {
    day: 4, kind: 'filler', name: 'Bernard Fisk', number: '555-0177', location: 'a rooftop', topic: 'Astronomy concern', voice: 'man', portrait: P.moon, pay: 10,
    start: 's',
    nodes: {
      s: { say: ['Is the moon closer than usual? I measured it with my thumb. Yesterday it was one thumb. Tonight it\'s a thumb and a bit.'],
        choices: [
          { text: 'It\'s the same moon, sir.', to: 'same' },
          { text: 'Yes. Stay inside.', to: 'inside', score: 1 },
        ] },
      same: { say: ['Then why is it looking at me.'], end: { rating: 4 } },
      inside: { say: ['I KNEW it. I knew it. Thank you. Nobody ever confirms anything.'], end: { rating: 5, tip: 1 } },
    },
  },

  tomorrow: {
    day: 4, name: 'SUNNY', number: '555-1407', location: 'Golden Lotus Mansions, 1407', topic: '—', voice: 'sunny', portrait: P.sunny, pay: 0, noRating: true,
    start: 's',
    nodes: {
      s: { sys: 'Caller ID: your own number. Call date: FRIDAY.', say: ['Don\'t hang up. It\'s me. You. Friday-you.', 'I don\'t have long. The line\'s already going.'],
        choices: [
          { text: 'This is a prank.', to: 'prank' },
          { text: '...How?', to: 'how' },
        ] },
      prank: { say: ['You hid the last Inferno noodle behind the formula tin so you\'d have something to live for on Thursday. Prank?'], next: 'main' },
      how: { say: ['I don\'t know. The baby did something to the phone. He does things to phones. Also the toaster. Don\'t ask about the toaster.'], next: 'main' },
      main: { say: ['Listen. When they come — don\'t fight. You can\'t win that one.', 'Wait for the suit.'],
        choices: [
          { text: 'What suit?', to: 'suit' },
          { text: 'Is Gary okay?', to: 'gary' },
        ] },
      suit: { say: ['You\'ll know it when you see it. It\'s small. It\'s very well tailored. And Sunny — feed the baby. He gets cranky when —'], sfx: 'static', next: 'cut' },
      gary: { say: ['He\'s — (static) — he\'s coming home. I can\'t say more. It changes things. Wait for the suit.'], sfx: 'static', next: 'cut' },
      cut: { flags: { tomorrow: true }, sys: 'Call disconnected.', end: { noPay: true, text: 'Call log: incoming call from this line, dated tomorrow.' } },
    },
  },

  choir: {
    day: 4, name: 'THE CHOIR', number: '∴ ∴ ∴', location: 'not on Earth', topic: '(singing)', voice: 'choir', portrait: P.choir, pay: 30,
    start: 's',
    nodes: {
      s: { hint: 'We support four Earth languages. That\'s not one of them. Got a phrasebook? — D.',
        sys: '(many voices, perfectly in tune)', say: ['Vehl... oru... thessa.', 'Vehl, oru. Minn-oru. Vehl.', 'Ek. Dra. Mol.'], next: 'q' },
      q: {
        choices: [
          { text: 'Translate: "Surrender, little humans. Your home is ours."', to: 'wrong', need: 'phrasebook', needText: '(you\'d need a phrasebook — Gary had one)' },
          { text: 'Translate: "Sleep, little star. The nursery is home. Sleep."', to: 'right', need: 'phrasebook', needText: '(you\'d need a phrasebook — Gary had one)' },
          { text: 'Translate: "Ten, nine, eight..."', to: 'count', need: 'phrasebook', needText: '(you\'d need a phrasebook — Gary had one)' },
          { text: 'Please hold.', to: 'hold' },
          { text: 'Sorry, I don\'t speak... whatever this is.', to: 'nope' },
        ] },
      hold: { sys: '(the choir waits, humming. They are very patient. They have been singing for nine thousand years.)', next: 'q' },
      wrong: { sys: '(the singing stops. They sound hurt. Then, gently, they begin again.)', score: -2, say: ['Vehl... oru... thessa.'], next: 'q' },
      count: { sys: '(the choir giggles in a chord. It isn\'t a countdown. They only count to five.)', score: -1, next: 'q' },
      nope: { sys: 'The choir hangs up politely, all at once.', end: { rating: 2 } },
      right: { flags: { lullaby: true }, say: ['Zeel. Zeel, zeel.'], sys: '(the choir hums, delighted. Somewhere in your apartment, {baby} laughs in his sleep.)', end: { rating: 5, text: 'You learned an alien lullaby. Hum it to {baby} when he is upset.' } },
    },
  },

  // ------------------------------------------------------------------ DAY 5
  agnes2: {
    day: 5, kind: 'filler', name: 'Agnes Holloway', number: '555-0143', location: 'Willow Court Retirement Village', topic: 'Follow-up', voice: 'old', portrait: P.agnes, pay: 12,
    start: 's',
    nodes: {
      s: { say: ['It\'s Agnes, dear! The moon was framed! It was the butler all along. The butler was also the moon. It\'s very complicated.', 'I just wanted to say thank you. You sounded sad on Monday. Are you still sad?'],
        choices: [{ text: 'A little.', to: 'sad' }, { text: 'I\'m fine, Agnes.', to: 'fine' }] },
      sad: { say: ['Well. Noodles help. So do people. Call your mother. And lock your door today, dear — there are trucks all over the news.'], end: { rating: 5, tip: 5 } },
      fine: { say: ['That\'s what my Harold used to say. Call your mother. And lock your door, dear, there are trucks on the news.'], end: { rating: 5 } },
    },
  },

  brass: {
    day: 5, name: 'GEN. H. BRASS', number: '555-0001', location: 'D.T.P. Mobile Command', topic: '—', voice: 'general', portrait: P.general, pay: 0, noRating: true,
    start: 's',
    nodes: {
      s: { say: (c) => [
        'Mr. Sunny. General Harlan Brass. Department of Terrestrial Purity.',
        c.flags.traced ? 'We traced your little chat with Agent Finch. Room 1407. Lovely view.' : 'It took us four days, two drones and one very confused agent pretending to own a toaster. But we found you.',
      ],
        choices: [
          { text: 'Where is my husband?', to: 'gary' },
          { text: 'What do you want?', to: 'threat' },
          { text: '(Say nothing.)', to: 'silent' },
        ] },
      gary: { say: ['Your "husband" is helping us with our inquiries. He\'s very helpful. He keeps apologising to the walls.'], next: 'threat' },
      silent: { say: ['Silence. Good. I like a man who listens.'], next: 'threat' },
      threat: { say: ['We\'re coming for the boy. Today. I\'d tell you to pack, but where would you go?', 'Enjoy your noodles, Mr. Sunny.'],
        choices: [
          { text: 'Over my dead body.', to: 'dead' },
          { text: '...Please.', to: 'please' },
          { text: 'Do you have a cat, General?', to: 'cat' },
        ] },
      dead: { say: ['That can be arranged. Paperwork-wise.'], next: 'out' },
      please: { sys: '(the line clicks)', next: 'out' },
      cat: { say: ['...What? No. Why would I —'], sys: '(faintly, on his end of the line: a single, calm meow. He hangs up very fast.)', next: 'out' },
      out: { sys: 'Caller disconnected. Below your window, engines are starting.', end: { noPay: true, emit: 'finale:start' } },
    },
  },
};

for (const [id, c] of Object.entries(CALLS)) { c.id = id; c.kind = c.kind || 'main'; }
