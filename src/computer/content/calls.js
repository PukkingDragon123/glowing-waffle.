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

export const CALLS = {
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
  2: [
    {
      id: 'patricia', name: 'Patricia Velez', number: '(201) 555-0171', account: 'BP-55210', plan: 'Family 56K', modem: 'Zoom 56K', os: 'Glass 98', voice: 'woman', target: 150,
      nodes: {
        start: { say: ['Hi. I can get my e-mail but I cannot send anything. It gives me a long error, zero x eight zero zero C C C zero E.'], kb: '0x800ccc0e', opts: [
          { t: 'What is your outgoing mail server set to?', go: 'smtp', score: 1 },
          { t: 'Let me reset your password.', go: 'pw', score: -1 },
        ] },
        pw: { say: ['But I can read my mail. Doesn\'t that mean the password is fine?'], opts: [{ t: 'You are right. What is your outgoing server set to?', go: 'smtp' }] },
        smtp: { say: ['It says... smtp dot aol dot com. My husband set it up.'], opts: [
          { t: 'Change it to mail dot blueberrypie dot net, port twenty five.', go: 'fixed', score: 2 },
          { t: 'Leave it, I will escalate this.', go: 'esc', score: -1 },
        ] },
        esc: { say: ['Forty eight hours? I need to send my resume today.'], opts: [{ t: 'Actually, set the outgoing server to mail dot blueberrypie dot net.', go: 'fixed' }] },
        fixed: { say: ['Mail dot blueberrypie dot net... sending... it went! Thank you so much.'], end: 'good' },
      },
      tools: {},
    },
    {
      id: 'ronald', name: 'Ronald Pike', number: '(201) 555-0108', account: 'BP-20981', plan: 'Unlimited 56K', modem: 'US Robotics 56K', os: 'Glass 95', voice: 'oldman', target: 170,
      nodes: {
        start: { say: ['They sold me a fifty six K modem and it only ever connects at twenty six four. Twenty six four!', 'I want what I am paying for.'], kb: 'slow', opts: [
          { t: 'Let me test your line quality.', go: 'waitline', score: 1 },
          { t: 'Nobody actually gets fifty six K, sir.', go: 'rude', score: -2 },
        ] },
        rude: { say: ['Then why does it say it on the box?'], opts: [{ t: 'Fair point. Let me test your line.', go: 'waitline' }] },
        waitline: { wait: 'lineTest', say: [], hint: 'Run a Line Test.' },
        noisy: { say: ['Noise? The phone company was here in June.'], opts: [
          { t: 'Your modem needs the V.90 update. I will mail you the new CD.', go: 'waitcd', score: 1 },
        ] },
        waitcd: { wait: 'sendCd', say: [], hint: 'Send Install CD.' },
        done: { say: ['Five to seven days. Well. All right. At least someone answered the phone today.'], end: 'good' },
      },
      tools: { lineTest: { result: 'LINE TEST: carrier OK, noise -36dB (NOISY). 56K not possible on this line.', go: 'noisy' }, sendCd: { result: 'Install CD v4.0 with V.90 firmware queued for mailing.', go: 'done' } },
    },
    {
      id: 'amy', name: 'Amy Lindqvist', number: '(201) 555-0119', account: 'BP-41190', plan: 'Unlimited 56K', modem: 'Boca Research 56K', os: 'Glass 98', voice: 'woman', target: 150,
      nodes: {
        start: { say: ['Hello. My computer says the modem is not responding. Error six three zero.'], kb: '630', opts: [
          { t: 'Is the modem plugged in and powered on?', go: 'power', score: 1 },
          { t: 'Please dial star seven zero first.', go: 'cw', score: -1 },
        ] },
        cw: { say: ['It does not even try to dial. It says the modem is not responding.'], opts: [{ t: 'Is it powered on?', go: 'power' }] },
        power: { say: ['The lights are on. It is warm. It is... humming.'], opts: [{ t: 'I am going to push new settings to your modem.', go: 'waitre', score: 1 }] },
        waitre: { wait: 'reprovision', say: [], hint: 'Reprovision Modem.' },
        fixed: { say: ['Restarting now... It works.', 'Thank you, Alex.', 'Get some rest. You are eating for two now.'], end: 'strange', strangeLine: 2 },
      },
      tools: { reprovision: { result: 'Modem profile reprovisioned: AT&F&C1&D2. Customer must restart.', go: 'fixed' } },
      after: [],
    },
  ],
  3: [
    {
      id: 'martin', name: 'Martin Hale', number: '(201) 555-0131', account: 'BP-60018', plan: 'Unlimited 56K', modem: 'Hayes 56K', os: 'Glass 98', voice: 'man', target: 140,
      nodes: {
        start: { say: ['I keep getting a busy signal when I dial in. Every time.'], kb: 'busy', opts: [
          { t: 'Our local number is overloaded. I will give you another one.', go: 'waitnum', score: 1 },
          { t: 'Try again later tonight.', go: 'later', score: -1 },
        ] },
        later: { say: ['Later? Have you looked outside? Nobody is going out tonight.'], opts: [{ t: 'Let me give you a different access number.', go: 'waitnum' }] },
        waitnum: { wait: 'accessNumber', say: [], hint: 'Change Access Number.' },
        fixed: { say: ['Five five five zero one seven seven. Okay. It is ringing... connected.', 'Hey. Can I ask you something. Have you looked at the sky today?', 'There are two of them now. Two moons. Everyone on the news is pretending there is one.'], end: 'strange' },
      },
      tools: { accessNumber: { result: 'New access number assigned: 555-0177', go: 'fixed' } },
    },
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
    {
      id: 'doris2', name: 'Doris Kaminski', number: '(201) 555-0147', account: 'BP-77129', plan: 'Unlimited 56K', modem: 'US Robotics Sportster 56K', os: 'Glass 95', voice: 'oldwoman', target: 120, strange: true,
      nodes: {
        start: { say: ['Hello, dear. It is Doris again. The internet is working fine.', 'I am calling because my grandson is not answering his phone.'], opts: [
          { t: 'I am sorry, I can only help with your account.', go: 'sky' },
          { t: 'When did you last talk to him?', go: 'sky' },
        ] },
        sky: { say: ['The sky is so bright here. Is it bright where you are?', 'There is a light over the river that eats the other lights. One by one. The windows go dark when it looks at them.', 'Turn your lights off tonight, dear. That is how it finds you.'], end: 'strange' },
      },
      tools: {},
    },
  ],
  4: [
    {
      id: 'linda', name: 'Linda Ferro', number: '(201) 555-0154', account: 'BP-33761', plan: 'Family 56K', modem: 'Zoom 56K', os: 'Glass 98', voice: 'woman', target: 140,
      nodes: {
        start: { say: ['Hi, sorry, the baby is fussy. I cannot log in. Error six nine one.'], kb: '691', opts: [
          { t: 'I can reset your password for you.', go: 'waitpw', score: 1 },
          { t: 'Your phone line is too noisy.', go: 'noise', score: -1 },
        ] },
        noise: { say: ['That noise is the baby. Can you just help me log in?'], opts: [{ t: 'Of course, let me reset your password.', go: 'waitpw' }] },
        waitpw: { wait: 'resetPassword', say: [], hint: 'Reset Password.' },
        fixed: { say: ['Berry four one nine. Okay, I am in.', 'Shh, shh. She never cries like this. It is like she can hear something through the phone.', 'Is there a baby there with you?'], end: 'strange' },
      },
      tools: { resetPassword: { result: 'Password reset. Temporary password: berry419', go: 'fixed' } },
    },
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
