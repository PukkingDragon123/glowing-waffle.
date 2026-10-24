// The 1999 internet, as far as this computer can reach. Pages are small
// layout trees; [text](url) makes a link, **text** is bold. Many pages change
// with the day.
import { G } from '../../core/globals.js';

export const HOME = 'http://www.blueberrypie.net/';

const headlines = {
  1: ['Lights over the harbor were "weather balloons", says FAA', 'Yankees take three straight from Boston', 'Heat advisory: 94 degrees expected Thursday', 'Y2K: banks say they are ready'],
  2: ['FAA revises statement on harbor lights', 'Amateur astronomers report "second object" near the Moon', 'Mayor urges calm, says city services normal', 'Heat continues: stay hydrated'],
  3: ['TWO MOONS? Experts call it a "rare optical effect"', 'Power outages reported across lower Manhattan', 'National Guard deployed to "assist with traffic"', 'Residents advised to stay indoors after dark'],
  4: ['EMERGENCY BROADCAST: Remain indoors. Turn off all lights.', 'Fires reported near the World Trade Center', 'Phone networks overloaded across tri-state area', 'Officials: "Do not look at the second moon"'],
  5: ['                ', 'They are listening through the lights', 'Manhattan dark', 'If you can read this, stay away from your windows'],
  6: ['IT IS INSIDE', 'IT IS INSIDE', 'IT IS INSIDE', 'IT IS INSIDE'],
  7: ['SUBJECT STATUS: COMPLETE', '', '', ''],
};

export const PAGES = {
  'http://www.blueberrypie.net/': (day) => ({
    title: 'Blueberry Pie Online - Home', bg: '#ffffff', link: '#1a3a9a',
    body: [
      { img: 'bpBanner', w: 600, h: 70 },
      { cols: [
        [
          { box: [{ h: 3, t: 'Welcome back, abengrim!', color: '#1a3a9a' }, { p: day >= 5 ? 'You have **999** new messages. You have not left your apartment in **' + (day + 2) + '** days.' : 'You have **' + (day + 2) + '** new messages in your [Inbox](mailto:inbox).' }], bg: '#eef2ff' },
          { h: 3, t: day >= 4 ? 'EMERGENCY INFORMATION' : 'Today\'s Headlines', color: day >= 4 ? '#c00000' : '#000' },
          { list: (headlines[day] || headlines[1]).map((h, i) => (i === 0 ? '[' + h + '](http://www.cnm.com/)' : h)) },
          { p: '[More news at CNM Interactive >>](http://www.cnm.com/)' },
          { hr: true },
          { h: 3, t: 'Search the Web' },
          { search: true },
        ],
        [
          { box: [{ h: 3, t: 'Weather: Jersey City' }, { img: day >= 4 ? 'wxBad' : 'wxSun', w: 44, h: 36 }, { p: day >= 4 ? '**??°F**  The sky is not available.' : day >= 3 ? '**81°F** Hazy. Smoke advisory.' : '**94°F** Sunny. Heat advisory.' }, { p: '[Full forecast](http://www.jc-weather.com/)' }], bg: '#fff8e0' },
          { box: [{ h: 3, t: 'Y2K Countdown' }, { p: '**' + (184 - day + 1) + '** days until the year 2000.' }, { p: '[Is your PC ready?](http://www.y2kready.org/)' }], bg: '#f0fff0' },
          { box: [{ h: 3, t: 'Cool Links' }, { list: ['[The Truth Is Up There](http://www.geocities.com/Area51/Nebula/1999/)', '[PurrfectPets: cat care](http://www.purrfectpets.com/behavior.html)', '[BabyBoards community](http://www.babyboards.net/)', ...(day >= 4 ? ['[LIVE: apt cam](http://www.bengrim.cam/)'] : [])] }], bg: '#f8f0ff' },
        ],
      ], widths: [0.62, 0.38] },
      { hr: true },
      { p: '© 1999 Blueberry Pie Online, Inc.  |  [Support](http://www.blueberrypie.net/support)  |  Jersey City, NJ', center: true, color: '#808080' },
    ],
  }),
  'http://www.blueberrypie.net/support': (day) => ({
    title: 'Blueberry Pie Online - Member Support', bg: '#ffffff', link: '#1a3a9a',
    body: [
      { img: 'bpBanner', w: 600, h: 70 },
      { h: 2, t: 'Member Support' },
      { p: 'Having trouble connecting? Call our 24-hour support line at **1-800-555-0100**. Our friendly agents are standing by.' },
      { p: day >= 4 ? 'Our agents are not standing by. Our agents are sitting very still in their apartments, in the dark, as instructed.' : 'Common error codes: 678 (no answer), 691 (password), 630 (modem not responding).' },
      { p: '[Back to Home](http://www.blueberrypie.net/)' },
    ],
  }),
  'http://www.altavisor.com/': () => ({
    title: 'AltaVisor Search', bg: '#ffffff', link: '#0000cc',
    body: [{ space: 20 }, { img: 'altaLogo', w: 280, h: 60, center: true }, { space: 10 }, { search: true, center: true }, { p: 'Searching 140 million web pages', center: true, color: '#808080' }],
  }),
  'http://www.cnm.com/': (day) => ({
    title: 'CNM Interactive', bg: '#ffffff', link: '#a00000',
    body: [
      { img: 'cnmBanner', w: 600, h: 48 },
      ...(day >= 4 ? [{ marquee: '*** EMERGENCY BROADCAST SYSTEM *** REMAIN INDOORS *** TURN OFF ALL LIGHTS *** DO NOT APPROACH WINDOWS *** THIS IS NOT A TEST ***', color: '#ff0000' }] : []),
      { h: 1, t: (headlines[day] || headlines[1])[0] },
      { img: day >= 3 ? 'newsFire' : 'newsHarbor', w: 320, h: 180 },
      { p: day <= 1 ? 'NEW YORK (CNM) -- The Federal Aviation Administration said Wednesday that the bright lights seen over New York Harbor late Tuesday night were weather balloons released by a university research team. Dozens of residents called 911 after seeing what one described as "a city of lights in the sky." "It was just like a dream," said a Jersey City woman. "I went to bed and I thought I dreamed it."'
        : day === 2 ? 'NEW YORK (CNM) -- The FAA declined to repeat its weather balloon explanation on Thursday. Several observatories reported a "second object" in lunar orbit. "It is not reflecting light the way the Moon does," said one astronomer, who asked not to be named. "It is emitting it."'
        : day === 3 ? 'NEW YORK (CNM) -- Officials are calling it a rare optical effect. But anyone who has looked up after sunset this week has seen it: a second moon, larger and redder than our own. Power failures have rolled across lower Manhattan. Residents are advised to stay indoors after dark and keep their windows covered.'
        : 'Lights attract it. Lights attract it. Lights attract it. Turn off every light in your home. Turn off your television. Turn off your computer. If you are reading this, you are lit.' },
      { p: '[Home](http://www.blueberrypie.net/)  |  [Weather](http://www.jc-weather.com/)' },
    ],
  }),
  'http://www.geocities.com/Area51/Nebula/1999/': (day) => ({
    title: 'THE TRUTH IS UP THERE!!!', bg: '#000000', text: '#00ff00', link: '#ffff00', tile: 'stars',
    body: [
      { img: 'construction', w: 100, h: 30, center: true },
      { h: 1, t: 'THE TRUTH IS UP THERE', color: '#ff00ff', center: true },
      { marquee: 'WELCOME TO MY PAGE!!! THEY ARE ALREADY HERE!!! SIGN MY GUESTBOOK!!!', color: '#00ffff' },
      { p: 'Hi! My name is Dennis and I have been tracking UFO activity over the NJ/NY area since 1987. The lights on Tuesday were NOT weather balloons. I have photos.', center: true },
      { img: 'ufoPhoto', w: 220, h: 150, center: true },
      { p: day >= 3 ? 'UPDATE: They do not take people. They put something IN people. You will get hungry first. Then the animals will start to hate you.' : 'UPDATE: The lights came from the direction of the Twin Towers and moved toward Jersey City.', center: true },
      { p: day >= 5 ? 'UPDATE: I can hear it in my stomach. Dont come to my house. Dont call me. Dont' : 'If you saw the lights, email me!!', center: true, color: '#ff4040' },
      { counter: 419 + day * 3 },
      { p: '[Back to the real world](http://www.blueberrypie.net/)', center: true },
    ],
  }),
  'http://www.purrfectpets.com/behavior.html': (day) => ({
    title: 'PurrfectPets - Why Is My Cat Afraid Of Me?', bg: '#fffaf0', link: '#a05000',
    body: [
      { img: 'petsBanner', w: 600, h: 56 },
      { h: 2, t: 'Why is my cat suddenly afraid of me?' },
      { p: 'Cats are sensitive to changes in their owner\'s smell, routine and body. A cat may hiss, hide or run away when its owner:' },
      { list: ['has been sick or is taking new medication', 'is pregnant (cats can often sense pregnancy before their owners!)', 'smells of another animal', 'is behaving unusually: running, shouting, or staring'] },
      { p: 'What to do: speak softly, move slowly, keep feeding on schedule, and let your cat come to you. Never grab a frightened cat. A scared cat will scratch.' },
      { p: day >= 4 ? '**Note from a reader:** "My cat started hiding under the bed the week I got pregnant. Then she started watching my stomach. Then she started hissing at it."' : '**Tip:** a frightened cat often hides under beds, inside closets or under desks.' },
      { p: '[Home](http://www.blueberrypie.net/)' },
    ],
  }),
  'http://www.babyboards.net/': (day) => ({
    title: 'BabyBoards - Community Forums', bg: '#fff0f5', link: '#c0306a',
    body: [
      { img: 'babyBanner', w: 600, h: 50 },
      { h: 2, t: 'Forum: Pregnancy Week by Week' },
      { table: [
        ['**Topic**', '**Author**', '**Replies**'],
        ['Week 34 - is it normal to be THIS hungry?', 'jenny_m', '41'],
        ['Kicks at night, cant sleep', 'momto3', '18'],
        ...(day >= 3 ? [['Something moved under my skin and it wasnt a kick', '4B_resident', '0']] : []),
        ...(day >= 4 ? [['my reflection is not doing what i do', '4B_resident', '0']] : []),
        ...(day >= 5 ? [['how do i get it out', '4B_resident', '0']] : []),
        ...(day >= 6 ? [['IT IS ALMOST TIME', 'FACILITY', '999']] : []),
      ], widths: [0.62, 0.22, 0.16], border: true },
      ...(day >= 3 ? [{ box: [{ p: '**4B_resident** wrote:' }, { p: day >= 5 ? 'I have not been pregnant. I have never been pregnant. I woke up a week ago and I was. It keeps getting bigger. My cat will not come near me. The phone keeps ringing. Please someone in Jersey City answer this.' : 'Day 3. I am so hungry. I ate everything in the fridge. Something rolled under my skin like a fish under ice. My doctor\'s number is disconnected.' }], bg: '#ffffff' }] : []),
      { p: '[Home](http://www.blueberrypie.net/)' },
    ],
  }),
  'http://www.jc-weather.com/': (day) => ({
    title: 'Jersey City Weather Online', bg: '#e8f4ff', link: '#004080',
    body: [
      { h: 2, t: 'Jersey City, NJ - 7 Day Forecast' },
      { table: [['**Day**', '**Forecast**', '**Hi**'], ['Thu 7/1', 'Sunny, heat advisory', '94'], ['Fri 7/2', 'Hazy sun', '91'], ['Sat 7/3', day >= 3 ? 'Smoke' : 'Partly cloudy', '88'], ['Sun 7/4', day >= 3 ? 'Ash' : 'Fireworks after dark!', '86'], ['Mon 7/5', day >= 3 ? 'Dark' : 'Scattered storms', '84'], ['Tue 7/6', day >= 3 ? 'Dark' : 'Clear', '85'], ['Wed 7/7', day >= 3 ? 'Birth' : 'Clear', '87']], widths: [0.3, 0.5, 0.2], border: true },
      { p: day >= 4 ? 'Moonrise: 7:58 PM  Second moonrise: 7:59 PM' : 'Moonrise: 7:58 PM' },
      { p: '[Home](http://www.blueberrypie.net/)' },
    ],
  }),
  'http://www.y2kready.org/': (day) => ({
    title: 'Y2K Ready!', bg: '#ffffcc', link: '#000099',
    body: [
      { h: 1, t: 'IS YOUR COMPUTER Y2K READY?', color: '#cc0000', center: true },
      { p: 'On January 1, 2000, computers around the world may fail. Stock up on water, canned food, and batteries. Download our FREE Y2K checker!', center: true },
      { p: day >= 4 ? 'UPDATE: Don\'t worry about the year 2000. Nobody here will see it.' : '**' + (184 - day + 1) + '** days left!', center: true },
      { p: '[Home](http://www.blueberrypie.net/)', center: true },
    ],
  }),
  'http://www.bengrim.cam/': () => ({
    title: 'LIVE: APT 4B', bg: '#000000', text: '#c0c0c0', link: '#8080ff',
    body: [
      { h: 2, t: 'LIVE WEBCAM - APT 4B - 24 HOURS A DAY', color: '#ff2020', center: true },
      { img: 'webcam', w: 320, h: 240, center: true },
      { p: 'Refreshing every 1 second. You are viewer #1.', center: true },
      { p: 'The subject is at the computer.', center: true, color: '#ff6060' },
    ],
  }),
  'http://facility.0419/': (day) => ({
    title: 'SUBJECT 0419', bg: '#101010', text: '#a0ffa0', link: '#a0ffa0',
    body: [
      { h: 1, t: 'SUBJECT 0419 - LIVE TELEMETRY', center: true },
      { table: [['HEART RATE (HOST)', String(96 + day * 4)], ['HEART RATE (FETAL)', String(140 + day * 12)], ['GESTATION', Math.min(99, day * 14) + '%'], ['APPETITE', day >= 5 ? 'CRITICAL' : 'ELEVATED'], ['ENVIRONMENT', 'SIMULATED (STABLE)'], ['LOOP', 'DAY ' + day + ' OF 7']], widths: [0.6, 0.4], border: true },
      { p: 'Do not wake the subject.', center: true },
    ],
  }),
};

// search results
const INDEX = [
  ['blueberry pie online internet isp support mail', 'http://www.blueberrypie.net/', 'Blueberry Pie Online - Home', 'Your neighborhood internet provider. Mail, news, weather.'],
  ['news headlines lights harbor moon cnm', 'http://www.cnm.com/', 'CNM Interactive - Top Stories', 'Breaking news from CNM.'],
  ['ufo aliens lights truth area51 abduction', 'http://www.geocities.com/Area51/Nebula/1999/', 'THE TRUTH IS UP THERE!!!', 'Dennis\'s UFO page. They are already here.'],
  ['cat afraid hiss scared pet behavior hide', 'http://www.purrfectpets.com/behavior.html', 'PurrfectPets: Why is my cat afraid of me?', 'Cats can sense changes in their owners...'],
  ['pregnant pregnancy baby kicks hungry week forum', 'http://www.babyboards.net/', 'BabyBoards - Pregnancy Week by Week', 'Community forums for moms-to-be.'],
  ['weather jersey city forecast heat', 'http://www.jc-weather.com/', 'Jersey City Weather Online', 'Seven day forecast.'],
  ['y2k year 2000 bug ready', 'http://www.y2kready.org/', 'Y2K Ready!', 'Is your computer ready for the year 2000?'],
];
export function search(q, day) {
  const words = q.toLowerCase().split(/\W+/).filter(Boolean);
  const res = INDEX.filter((e) => words.some((w) => e[0].includes(w))).map((e) => ({ url: e[1], title: e[2], desc: e[3] }));
  if (day >= 4) res.unshift({ url: 'http://www.bengrim.cam/', title: 'LIVE: APT 4B', desc: 'The subject is at the computer right now.' });
  if (day >= 6) res.unshift({ url: 'http://facility.0419/', title: 'SUBJECT 0419', desc: 'Live telemetry. Do not wake the subject.' });
  if (day >= 3 && words.some((w) => ['help', 'inside', 'moving', 'stomach', 'skin', 'remove', 'out'].includes(w))) res.unshift({ url: 'http://www.babyboards.net/', title: 'how do i get it out', desc: 'posted by 4B_resident' });
  if (!res.length) res.push({ url: 'http://www.altavisor.com/', title: 'No documents match your query', desc: 'Try different keywords.' });
  return res;
}
export function searchPage(q, day) {
  const r = search(q, day);
  return {
    title: 'AltaVisor Search: ' + q, bg: '#ffffff', link: '#0000cc',
    body: [
      { img: 'altaLogo', w: 200, h: 44 }, { search: true, value: q },
      { p: 'AltaVisor found **' + (r.length * 1312 + 7) + '** documents matching **' + q + '**' },
      ...r.flatMap((x) => [{ p: '**[' + x.title + '](' + x.url + ')**' }, { p: x.desc, color: '#404040' }, { p: x.url, color: '#008000' }]),
    ],
  };
}
