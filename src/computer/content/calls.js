// Support calls for each day. Nodes: say (caller lines), opts (your replies),
// wait (needs an account tool), end (good | bad | strange). Tools map a tool to a
// result line and an optional jump. "after" lines keep coming out of the
// handset once you have hung up.
export const TOOLS = [
  { id: 'lineTest', label: 'Line Test', time: 4 },
  { id: 'resetPassword', label: 'Reset Password', time: 3 },
  { id: 'reprovision', label: 'Reprovision Modem', time: 5 },
  { id: 'flushDns', label: 'Flush DNS', time: 3 },
  { id: 'accessNumber', label: 'Change Access Number', time: 3 },
  { id: 'sendCd', label: 'Send Install CD', time: 2 },
  { id: 'credit', label: 'Issue Credit', time: 2 },
  { id: 'escalate', label: 'Escalate', time: 2 },
];

const generic = { lineTest: 'LINE TEST: carrier OK, noise -52dB (clean).', resetPassword: 'Password reset. Temporary password: berry419', reprovision: 'Modem profile reprovisioned: AT&F&C1&D2', flushDns: 'DNS cache cleared for account.', accessNumber: 'New access number assigned: 555-0177', sendCd: 'Install CD v4.0 queued for mailing (5-7 business days).', credit: 'Credit of $19.95 applied.', escalate: 'Ticket escalated to Tier 2. ETA 48 hours.' };

const BASE = {
  1: [
    {
      id: 'doris1', name: 'Doris Kaminski', number: '(201) 555-0147', account: 'BP-77129', plan: 'Unlimited 56K', modem: 'US Robotics Sportster 56K', os: 'Glass 95', voice: 'oldwoman', target: 150,
      nodes: {
        start: { say: ['Hello? Is this the internet company?', 'My computer makes the screaming noise, and then it just says it cannot connect.'], opts: [
          { t: 'Can you read me the exact error message on the screen?', go: 'err', score: 1 },
          { t: 'Have you tried turning it off and on again?', go: 'restart', score: -1 },
        ] },
        restart: { say: ['I have turned it off and on all morning, dear. My grandson told me to. It still says the same thing.'], opts: [{ t: 'What does the message say exactly?', go: 'err' }] },
        err: { say: ['It says... error six seven eight. The remote computer did not respond.'], kb: '678', opts: [
          { t: "Let me check your line from here. One moment.", go: 'waitline', score: 1 },
          { t: 'Your account must be locked. I will reset your password.', go: 'wrongpw', score: -1 },
        ] },
        wrongpw: { say: ['My password? I did not forget my password. I wrote it on the refrigerator.'], opts: [{ t: 'Sorry, let me test your phone line instead.', go: 'waitline' }] },
        waitline: { wait: 'lineTest', say: [], hint: 'Run a Line Test from the Account tab.' },
        line: { say: ['Is it the line? It sounds fine when I call my sister.'], opts: [
          { t: 'Do you have call waiting on your phone?', go: 'cw', score: 1 },
          { t: 'I will mail you a new installation CD.', go: 'cd', score: -1 },
        ] },
        cd: { say: ['A CD? I already have three of those from you people. I use them as coasters.'], opts: [{ t: 'Sorry. Do you have call waiting?', go: 'cw' }] },
        cw: { say: ['Call waiting? Yes, my grandson set it up so I never miss a call.'], opts: [
          { t: 'Please type star seven zero comma in front of the number in Dial-Up Networking.', go: 'fixed', score: 2 },
        ] },
        fixed: { say: ['Star seven zero comma... all right... oh! It is connecting. It says connected!', 'Thank you, dear. You are much nicer than the last one.'], end: 'good' },
      },
      tools: { lineTest: { result: 'LINE TEST: carrier OK, noise -55dB (clean). Line is busy-capable (call waiting ACTIVE).', go: 'line' } },
    },
    {
      id: 'kevin1', name: 'Kevin Tran', number: '(201) 555-0193', account: 'BP-80344', plan: 'Student 28.8', modem: 'Hayes Accura 56K', os: 'Glass 98', voice: 'teen', target: 120,
      nodes: {
        start: { say: ['Yeah hi, so my login does not work anymore.', 'It keeps saying error six nine one, access denied or whatever.'], kb: '691', opts: [
          { t: 'Is your caps lock key on?', go: 'caps', score: 1 },
          { t: 'Your modem might be broken.', go: 'modem', score: -1 },
        ] },
        modem: { say: ['Dude, the modem connects fine, it just says my password is wrong.'], opts: [{ t: 'Okay. Is caps lock on?', go: 'caps' }] },
        caps: { say: ['No. I mean... I might have changed it last week and forgot. Can you just reset it?'], opts: [
          { t: 'Sure, give me a second to reset it.', go: 'waitpw', score: 1 },
          { t: 'I can read you your old password.', go: 'oldpw', score: -2 },
        ] },
        oldpw: { say: ['Wait, you can see my password? That is kind of creepy, man.'], opts: [{ t: 'Sorry, I meant I will reset it.', go: 'waitpw' }] },
        waitpw: { wait: 'resetPassword', say: [], hint: 'Use Reset Password on the Account tab.' },
        newpw: { say: ['Okay, berry four one nine. Got it.', 'It worked! Sweet. Thanks.'], end: 'good' },
      },
      tools: { resetPassword: { result: 'Password reset. Temporary password: berry419', go: 'newpw' } },
    },
    {
      id: 'gerald1', name: 'Gerald Moss', number: '(201) 555-0122', account: 'BP-11872', plan: 'Unlimited 56K', modem: 'Diamond SupraExpress 56', os: 'Glass 98', voice: 'man', target: 150,
      nodes: {
        start: { say: ['Good morning. I am connected, the little monitors are blinking, but every web page says the page cannot be displayed.'], kb: 'page cannot be displayed', opts: [
          { t: 'Does your e-mail still work?', go: 'email', score: 1 },
          { t: 'You need a new modem driver.', go: 'driver', score: -1 },
        ] },
        driver: { say: ['The modem is working, I just told you it connects.'], opts: [{ t: 'Right. Does e-mail work?', go: 'email' }] },
        email: { say: ['E-mail works fine. I got a chain letter from my brother this morning.'], opts: [
          { t: 'Let me clear something on our end.', go: 'waitdns', score: 1 },
        ] },
        waitdns: { wait: 'flushDns', say: [], hint: 'Flush DNS on the Account tab.' },
        dns: { say: ['Let me try... there it is. The weather page. Ninety one degrees, ugh.', 'Say, while I have you. Is your company ready for the year two thousand?'], opts: [
          { t: 'Yes. Blueberry Pie is fully Y2K compliant.', go: 'y2k', score: 1 },
          { t: 'Nobody really knows what will happen.', go: 'y2kbad', score: -1 },
        ] },
        y2k: { say: ['Good. Good. My wife keeps buying canned food. Thank you, son.'], end: 'good' },
        y2kbad: { say: ['That is not very reassuring from the internet company. Goodbye.'], end: 'good' },
      },
      tools: { flushDns: { result: 'DNS cache cleared for account BP-11872.', go: 'dns' } },
    },
  ],
  3: [
    {
      id: 'unknown3', name: 'UNKNOWN CALLER', number: '(201) 555-0419', account: 'BP-00419', plan: '???', modem: '???', os: '???', voice: 'wrong', target: 90, strange: true, noTimer: true,
      nodes: {
        start: { say: ['Is this apartment four B?'], opts: [
          { t: 'This is Blueberry Pie technical support.', go: 'desc' },
          { t: 'Who is this?', go: 'desc' },
        ] },
        desc: { say: ['You are sitting at your desk.', 'Your coffee has gone cold.', 'The cat is under the bed. She has been under there all morning. She does not want to come out while you are like this.'], opts: [
          { t: 'How do you know that?', go: 'how' },
          { t: 'I am hanging up now.', go: 'bye' },
        ] },
        how: { say: ['The walls are very thin, Alex.'], opts: [{ t: '...', go: 'bye' }] },
        bye: { say: ['I will let you get back to work.'], end: 'strange' },
      },
      tools: {},
      after: ['Do not open the window.', 'Not yet.'],
    },
  ],
  4: [
    {
      id: 'noid4', name: 'NO CALLER ID', number: '', account: '', plan: '', modem: '', os: '', voice: 'whisper', target: 60, strange: true, noTimer: true, hangupLock: 14,
      nodes: {
        start: { say: ['...'], opts: [{ t: 'Hello? Blueberry Pie support.', go: 'k' }, { t: 'Hello?', go: 'k' }] },
        k: { say: ['It is kicking, isn\'t it.', 'You should eat, Alex. You are so hungry. We can hear your stomach from here.', 'Eat whatever is closest.'], end: 'strange' },
      },
      tools: {},
      after: ['We are so proud of you.'],
    },
    {
      id: 'qa4', name: 'BP QUALITY ASSURANCE', number: '(800) 555-0100', account: 'INTERNAL', plan: '', modem: '', os: '', voice: 'machine', target: 60, strange: true, noTimer: true,
      nodes: {
        start: { say: ['This call is being monitored for quality assurance.', 'Agent zero four one nine. Your call handling is excellent.', 'Subject vitals are nominal. Please continue your routine.'], end: 'strange' },
      },
      tools: {},
    },
  ],
  5: [
    {
      id: 'mom5', name: 'BENGRIM, R.', number: '(973) 555-0162', account: '', plan: '', modem: '', os: '', voice: 'oldwoman', target: 90, strange: true, noTimer: true,
      nodes: {
        start: { say: ['Honey? Honey, is that you?'], opts: [{ t: 'Mom? How did you get this number?', go: 'w' }, { t: 'This is Blueberry Pie support.', go: 'w' }] },
        w: { say: ['Why are you answering the support line? You don\'t work there anymore.', 'You haven\'t worked anywhere since July. Since they found your apartment empty.', 'Where are you calling from? There is so much noise. It sounds like breathing.'], end: 'strange' },
      },
      tools: {},
    },
    {
      id: 'you5', name: 'BENGRIM, A.', number: '(201) 555-0419', account: 'BP-00419', plan: 'Unlimited', modem: '', os: '', voice: 'you', target: 120, strange: true, noTimer: true,
      nodes: {
        start: { say: ['Hi. My name is Alex Bengrim. Apartment four B.', 'Something is wrong with my body. My cat is afraid of me.', 'Can you help me?'], opts: [
          { t: 'Who is this?', go: 'loop' },
          { t: 'Yes. What seems to be the problem?', go: 'loop' },
        ] },
        loop: { say: ['I am so hungry. I keep eating and it is never enough.', 'Something moves when I lie down.', 'Please. You are the only one who answers.'], opts: [{ t: 'I am hanging up.', go: 'end' }, { t: 'I am you.', go: 'end' }] },
        end: { say: ['I know.'], end: 'strange' },
      },
      tools: {},
      after: ['Can you help me?', 'Can you help me?', 'Can you help me?'],
    },
  ],
  6: [
    {
      id: 'kevin6', name: 'Kevin Tran', number: '(201) 555-0193', account: 'BP-80344', plan: 'Student 28.8', modem: 'Hayes Accura 56K', os: 'Glass 98', voice: 'teen', target: 60, strange: true, noTimer: true,
      nodes: {
        start: { say: ['Hello? Oh thank god. Somebody answered.', 'The power is out everywhere. The whole city is dark. How are you still online? How is anyone still online?', 'Wait. Why can I hear your heartbeat? Why are there two?'], end: 'strange' },
      },
      tools: {},
    },
    {
      id: 'kids6', name: 'UNKNOWN', number: '', account: '', plan: '', modem: '', os: '', voice: 'child', target: 60, strange: true, noTimer: true, hangupLock: 10,
      nodes: {
        start: { say: ['Is the baby awake yet?', 'We can hear it through the walls.', 'It is so hungry. Like you.'], end: 'strange' },
      },
      tools: {},
      after: ['Let it out.'],
    },
  ],
  7: [
    {
      id: 'facility', name: 'FACILITY', number: '0419', account: 'SUBJECT 0419', plan: 'GESTATION', modem: '', os: '', voice: 'machine', target: 60, strange: true, noTimer: true, hangupLock: 999,
      nodes: {
        start: { say: ['Subject zero four one nine.', 'Remain calm.', 'Gestation at ninety nine percent.', 'Please proceed to the window.'], end: 'strange', event: 'facilityCall' },
      },
      tools: {},
    },
  ],
};

// ---------------------------------------------------------------------------
// The loop. Every morning is July 1st again and the same three customers call
// with the same problems. They drift a little more each day.
const clone = (o) => JSON.parse(JSON.stringify(o));
function drift(call, day) {
  const c = clone(call);
  c.id = call.id + '_d' + day;
  const N = c.nodes;
  const add = (node, lines, front = false) => { if (!N[node]) return; N[node].say = front ? [...lines, ...N[node].say] : [...N[node].say, ...lines]; };
  if (call.id === 'doris1') {
    if (day === 2) add('fixed', ['Have we spoken before? Your voice is so familiar.']);
    if (day === 3) {
      N.start.say = ['Hello? Is this the internet company?', 'My computer makes the screaming noise again. You fixed it yesterday, dear. Or I dreamed it.'];
      N.cw.say = ['Call waiting. Yes. You asked me that yesterday. And the day before that.'];
      N.fixed.say = ['Star seven zero comma. It is connecting.', 'The sky is so bright here. Is it bright where you are?', 'There is a light over the river that eats the other lights. The windows go dark when it looks at them.', 'Turn your lights off tonight, dear. That is how it finds you.'];
      N.fixed.end = 'strange'; c.strange = true;
    }
    if (day === 4) {
      N.start.say = ['Hello? Is this the internet company?', 'Hello? Is this the internet company?', 'Hello? Is this the internet company?'];
      N.fixed.say = ['Star seven zero comma. Yes. Thank you, dear.', 'Same time tomorrow.'];
    }
    if (day === 5) {
      c.voice = 'wrong'; c.strange = true; c.noTimer = true;
      c.nodes = { start: { say: ['Hello, dear. You can stop now.', 'It never connects. Nothing here connects to anything.', 'I have been calling you every morning for a very long time.'], end: 'strange' } };
      c.tools = {};
    }
  }
  if (call.id === 'kevin1') {
    if (day === 2) N.newpw.say = ['Okay, berry four one nine. Got it.', 'Weird. Felt like I already did this.', 'It worked. Thanks.'];
    if (day === 3) add('start', ['Wait. Did I already call today?'], false);
    if (day >= 4) {
      N.caps.say = ['No. I mean... you are going to say berry four one nine. Right?', 'Say it. You always say it.'];
      N.newpw.say = ['Berry four one nine.', 'Berry four one nine.', 'Same as every day, man.'];
      N.newpw.end = 'strange'; c.strange = true;
    }
  }
  if (call.id === 'gerald1') {
    if (day === 2) N.dns.say = ['Let me try... there it is. The weather page. Ninety one degrees again.', 'Was it not ninety one yesterday, too?', 'Say, is your company ready for the year two thousand?'];
    if (day === 3) {
      N.dns.say = ['There it is. Ninety one degrees.', 'It has said ninety one for three days. The date at the top says July first.', 'And there are two moons. Everyone on the news is pretending there is one.'];
      N.dns.opts = [{ t: 'I am sure it is just a glitch.', go: 'y2k' }, { t: 'I see them too.', go: 'y2k' }];
      N.y2k.end = 'strange'; c.strange = true;
    }
    if (day === 4) add('start', ['You are going to tell me to clear something on your end. Go ahead. Clear it.']);
    if (day === 5) {
      c.voice = 'wrong'; c.strange = true; c.noTimer = true;
      c.nodes = { start: { say: ['Good morning.', 'Good morning.', 'Is it still the first? It is always the first.', 'I counted the windows across the river. Every morning there is one less light.'], end: 'strange' } };
      c.tools = {};
    }
  }
  return c;
}
const [DORIS, KEVIN, GERALD] = BASE[1];
const X = (d, id) => BASE[d].find((c) => c.id === id);
export const CALLS = {
  1: [DORIS, KEVIN, GERALD],
  2: [drift(DORIS, 2), drift(KEVIN, 2), drift(GERALD, 2)],
  3: [drift(DORIS, 3), X(3, 'unknown3'), drift(KEVIN, 3), drift(GERALD, 3)],
  4: [drift(DORIS, 4), drift(KEVIN, 4), X(4, 'noid4'), drift(GERALD, 4), X(4, 'qa4')],
  5: [drift(DORIS, 5), X(5, 'mom5'), drift(GERALD, 5), X(5, 'you5')],
  6: BASE[6],
  7: BASE[7],
};

export function toolResult(call, tool) {
  const t = call.tools && call.tools[tool];
  if (t) return t;
  return { result: generic[tool] + (call.strange ? '' : '  (No effect on this issue.)') };
}

// short calls on the physical phone outside of work
export const PHONE_CALLS = {
  1: { at: 19.5, name: 'Mom', voice: 'oldwoman', lines: ['Hi honey. Did you see the news about the lights over the harbor? They say it was weather balloons.', 'Are you eating? You sound tired.', 'Call me tomorrow. I love you.'] },
  2: { at: 18.5, name: 'Building office', voice: 'oldman', lines: ['This is the building office. Trash chute on four is jammed again, take it down the hall to the room by the stairs.', 'And whoever keeps calling about apartment four A. Nobody has lived in four A since nineteen ninety one.'] },
  4: { at: 20.5, name: '...', voice: 'whisper', lines: ['...', 'Turn off the lights.'] },
};
