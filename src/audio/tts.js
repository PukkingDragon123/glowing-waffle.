// A small formant speech synthesiser (Klatt-style cascade resonators) with
// English letter-to-sound rules and a dictionary. Deliberately a little
// inhuman: this is what the callers and the facility sound like.
export const TTS_SR = 22050;

// ---------------------------------------------------------------- phonemes
// [F1, F2, F3, durMs, kind]  kind: v vowel, d diphthong, g glide, n nasal, f fricative, s stop, h aspirate
const P = {
  IY: [280, 2250, 2900, 110, 'v'], IH: [400, 1920, 2560, 80, 'v'], EH: [550, 1770, 2490, 90, 'v'], AE: [690, 1660, 2490, 120, 'v'],
  AA: [710, 1100, 2540, 130, 'v'], AO: [590, 880, 2540, 125, 'v'], UH: [450, 1030, 2380, 80, 'v'], UW: [310, 870, 2250, 115, 'v'],
  AH: [620, 1220, 2550, 85, 'v'], AX: [500, 1400, 2500, 55, 'v'], ER: [470, 1270, 1600, 120, 'v'],
  EY: [480, 1980, 2580, 150, 'd', 'IY'], AY: [700, 1250, 2550, 170, 'd', 'IY'], OW: [560, 900, 2500, 150, 'd', 'UW'],
  AW: [730, 1240, 2550, 170, 'd', 'UW'], OY: [580, 900, 2500, 180, 'd', 'IY'],
  W: [300, 650, 2200, 60, 'g'], Y: [270, 2080, 3000, 55, 'g'], R: [320, 1080, 1380, 65, 'g'], L: [330, 1050, 2800, 65, 'g'],
  M: [300, 1200, 2300, 70, 'n'], N: [300, 1600, 2600, 65, 'n'], NG: [300, 2000, 2700, 70, 'n'],
  F: [400, 1300, 2500, 90, 'f', 4500, 0.35, 0], TH: [400, 1500, 2600, 85, 'f', 5000, 0.25, 0], S: [400, 1600, 2600, 95, 'f', 5800, 0.7, 0], SH: [400, 1800, 2500, 100, 'f', 2800, 0.75, 0],
  V: [300, 1300, 2500, 65, 'f', 4500, 0.2, 1], DH: [300, 1500, 2600, 50, 'f', 4500, 0.15, 1], Z: [300, 1600, 2600, 75, 'f', 5800, 0.4, 1], ZH: [300, 1800, 2500, 80, 'f', 2800, 0.45, 1],
  HH: [500, 1500, 2500, 55, 'h'],
  P: [400, 1100, 2150, 75, 's', 900, 0, 0], B: [400, 1100, 2150, 60, 's', 900, 0, 1], T: [400, 1600, 2600, 70, 's', 4000, 0, 0], D: [400, 1600, 2600, 55, 's', 3500, 0, 1],
  K: [400, 1800, 2400, 75, 's', 2200, 0, 0], G: [400, 1800, 2400, 60, 's', 2000, 0, 1],
  CH: [400, 1800, 2500, 110, 'a', 2800, 0.7, 0], JH: [300, 1800, 2500, 95, 'a', 2800, 0.4, 1],
};

// ---------------------------------------------------------------- dictionary
const DICT = {
  a: 'AX', i: 'AY', "i'm": 'AY M', "i'll": 'AY L', "i've": 'AY V', "i'd": 'AY D', you: 'Y UW', "you're": 'Y UH R', your: 'Y AO R', yours: 'Y AO R Z', the: 'DH AX', to: 'T UW', of: 'AX V', and: 'AE N D', or: 'AO R',
  are: 'AA R', is: 'IH Z', was: 'W AA Z', were: 'W ER', be: 'B IY', been: 'B IH N', have: 'HH AE V', has: 'HH AE Z', had: 'HH AE D', do: 'D UW', does: 'D AH Z', did: 'D IH D', done: 'D AH N',
  said: 'S EH D', says: 'S EH Z', what: 'W AH T', who: 'HH UW', why: 'W AY', where: 'W EH R', when: 'W EH N', how: 'HH AW', which: 'W IH CH',
  one: 'W AH N', two: 'T UW', three: 'TH R IY', four: 'F AO R', five: 'F AY V', six: 'S IH K S', seven: 'S EH V AX N', eight: 'EY T', nine: 'N AY N', ten: 'T EH N', zero: 'Z IH R OW',
  eleven: 'IH L EH V AX N', twelve: 'T W EH L V', nineteen: 'N AY N T IY N', ninety: 'N AY N T IY', hundred: 'HH AH N D R AX D', thousand: 'TH AW Z AX N D', first: 'F ER S T', second: 'S EH K AX N D',
  there: 'DH EH R', their: 'DH EH R', "they're": 'DH EH R', they: 'DH EY', them: 'DH EH M', this: 'DH IH S', that: 'DH AE T', these: 'DH IY Z', those: 'DH OW Z', then: 'DH EH N', than: 'DH AE N',
  come: 'K AH M', some: 'S AH M', someone: 'S AH M W AH N', something: 'S AH M TH IH NG', gone: 'G AO N', give: 'G IH V', live: 'L IH V', love: 'L AH V', move: 'M UW V', could: 'K UH D', would: 'W UH D', should: 'SH UH D',
  put: 'P UH T', pull: 'P UH L', push: 'P UH SH', eye: 'AY', eyes: 'AY Z', mother: 'M AH DH ER', father: 'F AA DH ER', baby: 'B EY B IY', hello: 'HH AX L OW', hi: 'HH AY', okay: 'OW K EY', ok: 'OW K EY',
  internet: 'IH N T ER N EH T', modem: 'M OW D AX M', computer: 'K AX M P Y UW T ER', phone: 'F OW N', please: 'P L IY Z', password: 'P AE S W ER D', email: 'IY M EY L', number: 'N AH M B ER',
  account: 'AX K AW N T', blueberry: 'B L UW B EH R IY', pie: 'P AY', bengrim: 'B EH N G R IH M', alex: 'AE L AX K S', mochi: 'M OW CH IY', cat: 'K AE T', hungry: 'HH AH NG G R IY', inside: 'IH N S AY D',
  moon: 'M UW N', moons: 'M UW N Z', sky: 'S K AY', window: 'W IH N D OW', apartment: 'AX P AA R T M AX N T', light: 'L AY T', lights: 'L AY T S', dark: 'D AA R K', door: 'D AO R', floor: 'F L AO R',
  sorry: 'S AA R IY', thank: 'TH AE NG K', thanks: 'TH AE NG K S', help: 'HH EH L P', line: 'L AY N', connect: 'K AX N EH K T', connected: 'K AX N EH K T IH D', error: 'EH R ER', july: 'JH UW L AY',
  subject: 'S AH B JH EH K T', status: 'S T AE T AX S', complete: 'K AX M P L IY T', remain: 'R IH M EY N', calm: 'K AA M', day: 'D EY', days: 'D EY Z', night: 'N AY T', today: 'T AX D EY', tomorrow: 'T AX M AA R OW',
  yes: 'Y EH S', no: 'N OW', not: 'N AA T', "don't": 'D OW N T', "can't": 'K AE N T', "won't": 'W OW N T', "it's": 'IH T S', "that's": 'DH AE T S', "what's": 'W AH T S', "there's": 'DH EH R Z', "isn't": 'IH Z AX N T', "doesn't": 'D AH Z AX N T', "didn't": 'D IH D AX N T',
  can: 'K AE N', will: 'W IH L', just: 'JH AH S T', know: 'N OW', knows: 'N OW Z', knew: 'N UW', see: 'S IY', saw: 'S AO', look: 'L UH K', looking: 'L UH K IH NG', here: 'HH IY R', hear: 'HH IY R', now: 'N AW',
  again: 'AX G EH N', any: 'EH N IY', many: 'M EH N IY', every: 'EH V R IY', very: 'V EH R IY', only: 'OW N L IY', also: 'AO L S OW', always: 'AO L W EY Z', never: 'N EH V ER', ever: 'EH V ER',
  people: 'P IY P AX L', woman: 'W UH M AX N', women: 'W IH M AX N', child: 'CH AY L D', children: 'CH IH L D R AX N', mommy: 'M AA M IY', mom: 'M AA M', dad: 'D AE D', sister: 'S IH S T ER', husband: 'HH AH Z B AX N D',
  eat: 'IY T', eating: 'IY T IH NG', ate: 'EY T', food: 'F UW D', feed: 'F IY D', fed: 'F EH D', grow: 'G R OW', growing: 'G R OW IH NG', born: 'B AO R N', birth: 'B ER TH', kick: 'K IH K', kicking: 'K IH K IH NG',
  room: 'R UW M', bed: 'B EH D', sleep: 'S L IY P', sleeping: 'S L IY P IH NG', awake: 'AX W EY K', wake: 'W EY K', up: 'AH P', down: 'D AW N', out: 'AW T', off: 'AO F', on: 'AA N', in: 'IH N', into: 'IH N T UW',
  with: 'W IH DH', without: 'W IH DH AW T', from: 'F R AH M', for: 'F AO R', about: 'AX B AW T', after: 'AE F T ER', before: 'B IH F AO R', because: 'B IH K AO Z', behind: 'B IH HH AY N D', under: 'AH N D ER',
  service: 'S ER V IH S', support: 'S AX P AO R T', customer: 'K AH S T AX M ER', technical: 'T EH K N IH K AX L', name: 'N EY M', my: 'M AY', me: 'M IY', we: 'W IY', us: 'AH S', our: 'AW ER', he: 'HH IY', she: 'SH IY', her: 'HH ER', his: 'HH IH Z', him: 'HH IH M', it: 'IH T', its: 'IH T S',
  dial: 'D AY AX L', dialing: 'D AY AX L IH NG', tone: 'T OW N', busy: 'B IH Z IY', signal: 'S IH G N AX L', screen: 'S K R IY N', page: 'P EY JH', displayed: 'D IH S P L EY D', cannot: 'K AE N AA T',
  web: 'W EH B', site: 'S AY T', mail: 'M EY L', send: 'S EH N D', sent: 'S EH N T', work: 'W ER K', working: 'W ER K IH NG', works: 'W ER K S', fine: 'F AY N', good: 'G UH D', great: 'G R EY T', bad: 'B AE D',
  mister: 'M IH S T ER', missus: 'M IH S IH Z', miss: 'M IH S', ma: 'M AE M', sir: 'S ER', welcome: 'W EH L K AX M', speaking: 'S P IY K IH NG', today: 'T AX D EY', minute: 'M IH N AX T', minutes: 'M IH N AX T S',
  listen: 'L IH S AX N', listening: 'L IH S AX N IH NG', watching: 'W AA CH IH NG', watch: 'W AA CH', breathe: 'B R IY DH', breathing: 'B R IY DH IH NG', hurt: 'HH ER T', hurts: 'HH ER T S', afraid: 'AX F R EY D',
  everything: 'EH V R IY TH IH NG', nothing: 'N AH TH IH NG', anything: 'EH N IY TH IH NG', everyone: 'EH V R IY W AH N', nobody: 'N OW B AA D IY', somebody: 'S AH M B AA D IY', guess: 'G EH S', true: 'T R UW',
  ship: 'SH IH P', ships: 'SH IH P S', fire: 'F AY ER', city: 'S IH T IY', tower: 'T AW ER', towers: 'T AW ER Z', river: 'R IH V ER', street: 'S T R IY T', outside: 'AW T S AY D', building: 'B IH L D IH NG',
  stay: 'S T EY', indoors: 'IH N D AO R Z', turn: 'T ER N', all: 'AO L', ninety_nine: 'N AY N T IY N AY N', oh: 'OW', um: 'AH M', uh: 'AH', hmm: 'HH M', ah: 'AA', shh: 'SH',
  want: 'W AA N T', wants: 'W AA N T S', need: 'N IY D', needs: 'N IY D Z', let: 'L EH T', it: 'IH T', go: 'G OW', going: 'G OW IH NG', gonna: 'G AH N AX', get: 'G EH T', got: 'G AA T', make: 'M EY K', take: 'T EY K',
  still: 'S T IH L', soon: 'S UW N', almost: 'AO L M OW S T', ready: 'R EH D IY', open: 'OW P AX N', close: 'K L OW Z', closed: 'K L OW Z D', check: 'CH EH K', try: 'T R AY', restart: 'R IY S T AA R T',
  thing: 'TH IH NG', things: 'TH IH NG Z', think: 'TH IH NG K', thought: 'TH AO T', tell: 'T EH L', told: 'T OW L D', ask: 'AE S K', call: 'K AO L', calling: 'K AO L IH NG', called: 'K AO L D', back: 'B AE K',
  mine: 'M AY N', little: 'L IH T AX L', big: 'B IH G', bigger: 'B IH G ER', small: 'S M AO L', long: 'L AO NG', heavy: 'HH EH V IY', cold: 'K OW L D', warm: 'W AO R M', red: 'R EH D', blue: 'B L UW', white: 'W AY T', black: 'B L AE K',
};

// ---------------------------------------------------------------- letter-to-sound rules [left, match, right, phonemes]
const R = {
  a: [[' ', 'a', ' ', 'AX'], [' ', 'are', ' ', 'AA R'], [' ', 'ar', 'o', 'AX R'], ['', 'ar', '#', 'EH R'], ['^', 'as', '#', 'EY S'], ['', 'a', 'wa', 'AX'], ['', 'aw', '', 'AO'], [' :', 'any', '', 'EH N IY'],
    ['', 'a', '^+#', 'EY'], ['#:', 'ally', '', 'AX L IY'], [' ', 'al', '#', 'AX L'], ['', 'again', '', 'AX G EH N'], ['#:', 'ag', 'e', 'IH JH'], ['', 'a', '^+:#', 'AE'], [' :', 'a', '^+ ', 'EY'], ['', 'a', '^%', 'EY'],
    [' ', 'arr', '', 'AX R'], ['', 'arr', '', 'AE R'], [' :', 'ar', ' ', 'AA R'], ['', 'ar', ' ', 'ER'], ['', 'ar', '', 'AA R'], ['', 'air', '', 'EH R'], ['', 'ai', '', 'EY'], ['', 'ay', '', 'EY'], ['', 'au', '', 'AO'],
    ['#:', 'al', ' ', 'AX L'], ['#:', 'als', ' ', 'AX L Z'], ['', 'alk', '', 'AO K'], ['', 'al', '^', 'AO L'], [' :', 'able', '', 'EY B AX L'], ['', 'able', '', 'AX B AX L'], ['', 'ang', '+', 'EY N JH'], ['', 'a', '', 'AE']],
  b: [[' ', 'be', '^#', 'B IH'], ['', 'being', '', 'B IY IH NG'], [' ', 'both', ' ', 'B OW TH'], ['', 'buil', '', 'B IH L'], ['', 'bb', '', 'B'], ['', 'b', '', 'B']],
  c: [[' ', 'ch', '^', 'K'], ['^e', 'ch', '', 'K'], ['', 'ch', '', 'CH'], [' s', 'ci', '#', 'S AY'], ['', 'ci', 'a', 'SH'], ['', 'ci', 'o', 'SH'], ['', 'ci', 'en', 'SH'], ['', 'c', '+', 'S'], ['', 'ck', '', 'K'], ['', 'com', '%', 'K AH M'], ['', 'cc', '+', 'K S'], ['', 'c', '', 'K']],
  d: [['#:', 'ded', ' ', 'D IH D'], ['.e', 'd', ' ', 'D'], ['#^:e', 'd', ' ', 'T'], [' ', 'de', '^#', 'D IH'], [' ', 'do', ' ', 'D UW'], [' ', 'does', '', 'D AH Z'], ['', 'dd', '', 'D'], ['', 'du', 'a', 'JH UW'], ['', 'd', '', 'D']],
  e: [['#:', 'e', ' ', ''], ["'^:", 'e', ' ', ''], [' :', 'e', ' ', 'IY'], ['#', 'ed', ' ', 'D'], ['#:', 'e', 'd ', ''], ['', 'ev', 'er', 'EH V'], ['', 'e', '^%', 'IY'], ['', 'eri', '#', 'IY R IY'], ['', 'eri', '', 'EH R IH'],
    ['#:', 'er', '#', 'ER'], ['', 'er', '#', 'EH R'], ['', 'er', '', 'ER'], [' ', 'even', '', 'IY V EH N'], ['#:', 'e', 'w', ''], ['@', 'ew', '', 'UW'], ['', 'ew', '', 'Y UW'], ['', 'e', 'o', 'IY'], ['#:&', 'es', ' ', 'IH Z'],
    ['#:', 'e', 's ', ''], ['#:', 'ely', ' ', 'L IY'], ['#:', 'ement', '', 'M EH N T'], ['', 'eful', '', 'F UH L'], ['', 'ee', '', 'IY'], ['', 'earn', '', 'ER N'], [' ', 'ear', '^', 'ER'], ['', 'ead', '', 'EH D'], ['#:', 'ea', ' ', 'IY AX'],
    ['', 'ea', 'su', 'EH'], ['', 'ea', '', 'IY'], ['', 'eigh', '', 'EY'], ['', 'ei', '', 'IY'], [' ', 'eye', '', 'AY'], ['', 'ey', '', 'IY'], ['', 'eu', '', 'Y UW'], ['', 'e', '', 'EH']],
  f: [['', 'ful', '', 'F UH L'], ['', 'ff', '', 'F'], ['', 'f', '', 'F']],
  g: [['', 'giv', '', 'G IH V'], [' ', 'g', 'i^', 'G'], ['', 'ge', 't', 'G EH'], ['su', 'gges', '', 'G JH EH S'], ['', 'gg', '', 'G'], [' b#', 'g', '', 'G'], ['', 'g', '+', 'JH'], ['', 'great', '', 'G R EY T'], ['#', 'gh', '', ''], ['', 'g', '', 'G']],
  h: [[' ', 'hav', '', 'HH AE V'], [' ', 'here', '', 'HH IY R'], [' ', 'hour', '', 'AW ER'], ['', 'how', '', 'HH AW'], ['', 'h', '#', 'HH'], ['', 'h', '', '']],
  i: [[' ', 'in', '', 'IH N'], [' ', 'i', ' ', 'AY'], ['', 'in', 'd', 'AY N'], ['', 'ier', '', 'IY ER'], ['#:r', 'ied', '', 'IY D'], ['', 'ied', ' ', 'AY D'], ['', 'ien', '', 'IY EH N'], ['', 'ie', 't', 'AY EH'],
    [' :', 'i', '%', 'AY'], ['', 'i', '%', 'IY'], ['', 'ie', '', 'IY'], ['', 'i', '^+:#', 'IH'], ['', 'ir', '#', 'AY R'], ['', 'iz', '%', 'AY Z'], ['', 'is', '%', 'AY Z'], ['', 'i', 'd%', 'AY'], ['+^', 'i', '^+', 'IH'],
    ['', 'i', 't%', 'AY'], ['#^:', 'i', '^+', 'IH'], ['', 'i', '^+', 'AY'], ['', 'ir', '', 'ER'], ['', 'igh', '', 'AY'], ['', 'ild', '', 'AY L D'], ['', 'ign', ' ', 'AY N'], ['', 'ign', '^', 'AY N'], ['', 'ign', '%', 'AY N'], ['', 'ique', '', 'IY K'], ['', 'i', '', 'IH']],
  j: [['', 'j', '', 'JH']],
  k: [[' ', 'k', 'n', ''], ['', 'k', '', 'K']],
  l: [['', 'lo', 'c#', 'L OW'], ['l', 'l', '', ''], ['#^:', 'l', '%', 'AX L'], ['', 'lead', '', 'L IY D'], ['', 'l', '', 'L']],
  m: [['', 'mov', '', 'M UW V'], ['', 'mm', '', 'M'], ['', 'm', '', 'M']],
  n: [['e', 'ng', '+', 'N JH'], ['', 'ng', 'r', 'NG G'], ['', 'ng', '#', 'NG G'], ['', 'ngl', '%', 'NG G AX L'], ['', 'ng', '', 'NG'], ['', 'nk', '', 'NG K'], ['', 'nn', '', 'N'], ['', 'n', '', 'N']],
  o: [['', 'of', ' ', 'AX V'], ['#:', 'or', ' ', 'ER'], ['#:', 'ors', ' ', 'ER Z'], ['', 'or', '', 'AO R'], [' ', 'one', '', 'W AH N'], ['', 'ow', '', 'OW'], [' ', 'over', '', 'OW V ER'], ['', 'ov', '', 'AH V'],
    ['', 'o', '^%', 'OW'], ['', 'o', '^en', 'OW'], ['', 'o', '^i#', 'OW'], ['', 'ol', 'd', 'OW L'], ['', 'ought', '', 'AO T'], ['', 'ough', '', 'AH F'], [' ', 'ou', '', 'AW'], ['h', 'ou', 's#', 'AW'], ['', 'ous', '', 'AX S'],
    ['', 'our', '', 'AO R'], ['', 'ould', '', 'UH D'], ['^', 'ou', '^l', 'AH'], ['', 'oup', '', 'UW P'], ['', 'ou', '', 'AW'], ['', 'oy', '', 'OY'], ['', 'oing', '', 'OW IH NG'], ['', 'oi', '', 'OY'], ['', 'oor', '', 'AO R'],
    ['', 'ook', '', 'UH K'], ['', 'ood', '', 'UH D'], ['', 'oo', '', 'UW'], ['', 'o', 'e', 'OW'], ['', 'o', ' ', 'OW'], ['', 'oa', '', 'OW'], [' ', 'only', '', 'OW N L IY'], [' ', 'once', '', 'W AH N S'], ["", "on't", '', 'OW N T'],
    ['c', 'o', 'n', 'AA'], ['', 'o', 'ng', 'AO'], [' :^', 'o', 'n', 'AH'], ['i', 'on', '', 'AX N'], ['#:', 'on', ' ', 'AX N'], ['#^', 'on', '', 'AX N'], ['', 'o', 'st ', 'OW'], ['', 'of', '^', 'AO F'], ['', 'other', '', 'AH DH ER'],
    ['', 'oss', ' ', 'AO S'], ['#:^', 'om', '', 'AH M'], ['', 'o', '', 'AA']],
  p: [['', 'ph', '', 'F'], ['', 'peop', '', 'P IY P'], ['', 'pow', '', 'P AW'], ['', 'put', ' ', 'P UH T'], ['', 'pp', '', 'P'], ['', 'p', '', 'P']],
  q: [['', 'quar', '', 'K W AO R'], ['', 'qu', '', 'K W'], ['', 'q', '', 'K']],
  r: [[' ', 're', '^#', 'R IY'], ['', 'rr', '', 'R'], ['', 'r', '', 'R']],
  s: [['', 'sh', '', 'SH'], ['#', 'sion', '', 'ZH AX N'], ['', 'some', '', 'S AH M'], ['#', 'sur', '#', 'ZH ER'], ['', 'sur', '#', 'SH ER'], ['#', 'su', '#', 'ZH UW'], ['#', 'ssu', '#', 'SH UW'], ['#', 'sed', ' ', 'Z D'],
    ['#', 's', '#', 'Z'], ['', 'said', '', 'S EH D'], ['^', 'sion', '', 'SH AX N'], ['', 's', 's', ''], ['.', 's', ' ', 'Z'], ['#:.e', 's', ' ', 'Z'], ['#:^##', 's', ' ', 'Z'], ['#:^#', 's', ' ', 'S'], ['u', 's', ' ', 'S'],
    [' :#', 's', ' ', 'Z'], [' ', 'sch', '', 'S K'], ['', 's', 'c+', ''], ['#', 'sm', '', 'Z M'], ['', 's', '', 'S']],
  t: [[' ', 'the', ' ', 'DH AX'], ['', 'to', ' ', 'T UW'], ['', 'that', ' ', 'DH AE T'], [' ', 'this', ' ', 'DH IH S'], [' ', 'they', '', 'DH EY'], [' ', 'there', '', 'DH EH R'], ['', 'ther', '', 'DH ER'], ['', 'their', '', 'DH EH R'],
    [' ', 'than', ' ', 'DH AE N'], [' ', 'them', ' ', 'DH EH M'], ['', 'these', ' ', 'DH IY Z'], [' ', 'then', '', 'DH EH N'], ['', 'through', '', 'TH R UW'], ['', 'those', '', 'DH OW Z'], ['', 'though', ' ', 'DH OW'], [' ', 'thus', '', 'DH AH S'],
    ['', 'th', '', 'TH'], ['#:', 'ted', ' ', 'T IH D'], ['s', 'ti', '#n', 'CH'], ['', 'ti', 'o', 'SH'], ['', 'ti', 'a', 'SH'], ['', 'tien', '', 'SH AX N'], ['', 'tur', '#', 'CH ER'], ['', 'tu', 'a', 'CH UW'], [' ', 'two', '', 'T UW'], ['', 'tt', '', 'T'], ['', 't', '', 'T']],
  u: [[' ', 'un', 'i', 'Y UW N'], [' ', 'un', '', 'AH N'], [' ', 'upon', '', 'AX P AO N'], ['@', 'ur', '#', 'UH R'], ['', 'ur', '#', 'Y UH R'], ['', 'ur', '', 'ER'], ['', 'u', '^ ', 'AH'], ['', 'u', '^^', 'AH'], ['', 'uy', '', 'AY'],
    [' g', 'u', '#', ''], ['g', 'u', '%', ''], ['g', 'u', '#', 'W'], ['#n', 'u', '', 'Y UW'], ['@', 'u', '', 'UW'], ['', 'u', '', 'Y UW']],
  v: [['', 'view', '', 'V Y UW'], ['', 'v', '', 'V']],
  w: [[' ', 'were', '', 'W ER'], ['', 'wa', 's', 'W AA'], ['', 'wa', 't', 'W AA'], ['', 'where', '', 'W EH R'], ['', 'what', '', 'W AH T'], ['', 'whol', '', 'HH OW L'], ['', 'who', '', 'HH UW'], ['', 'wh', '', 'W'], ['', 'war', '', 'W AO R'], ['', 'wor', '^', 'W ER'], ['', 'wr', '', 'R'], ['', 'w', '', 'W']],
  x: [['', 'x', '', 'K S']],
  y: [['', 'young', '', 'Y AH NG'], [' ', 'you', '', 'Y UW'], [' ', 'yes', '', 'Y EH S'], [' ', 'y', '', 'Y'], ['#^:', 'y', ' ', 'IY'], ['#^:', 'y', 'i', 'IY'], [' :', 'y', ' ', 'AY'], [' :', 'y', '#', 'AY'], [' :', 'y', '^+:#', 'IH'], [' :', 'y', '^#', 'AY'], ['', 'y', '', 'IH']],
  z: [['', 'zz', '', 'Z'], ['', 'z', '', 'Z']],
};
const VOW = 'aeiou', VOICED = 'bdvgjlmnrwz', FRONT = 'eiy';
const isV = (c) => VOW.includes(c), isC = (c) => c && /[a-z]/.test(c) && !isV(c);

function matchRight(w, pos, pat) {
  let i = pos;
  for (let k = 0; k < pat.length; k++) {
    const p = pat[k], c = w[i];
    switch (p) {
      case ' ': if (c !== undefined && c !== ' ') return false; break;
      case '#': if (!isV(c)) return false; while (isV(w[i + 1])) i++; break;
      case '.': if (!c || !VOICED.includes(c)) return false; break;
      case '^': if (!isC(c)) return false; break;
      case ':': while (isC(w[i])) i++; i--; break;
      case '+': if (!c || !FRONT.includes(c)) return false; break;
      case '%': {
        const rest = w.slice(i);
        const suf = ['ing', 'ely', 'er', 'es', 'ed', 'e'].find((s) => rest.startsWith(s) && (rest.length === s.length || !/[a-z]/.test(rest[s.length])));
        if (!suf) return false; i += suf.length - 1; break;
      }
      case '&': if (!c || !'scgzxj'.includes(c)) return false; break;
      case '@': if (!c || !'tsrdlznj'.includes(c)) return false; break;
      default: if (c !== p) return false;
    }
    i++;
  }
  return true;
}
function matchLeft(w, pos, pat) {
  let i = pos;
  for (let k = pat.length - 1; k >= 0; k--) {
    const p = pat[k], c = w[i];
    switch (p) {
      case ' ': if (c !== undefined && c !== ' ') return false; break;
      case '#': if (!isV(c)) return false; while (isV(w[i - 1])) i--; break;
      case '.': if (!c || !VOICED.includes(c)) return false; break;
      case '^': if (!isC(c)) return false; break;
      case ':': while (isC(w[i])) i--; i++; break;
      case '+': if (!c || !FRONT.includes(c)) return false; break;
      case '&': if (!c || !'scgzxj'.includes(c)) return false; break;
      case '@': if (!c || !'tsrdlznj'.includes(c)) return false; break;
      default: if (c !== p) return false;
    }
    i--;
  }
  return true;
}

export function wordToPhonemes(word) {
  const lw = word.toLowerCase();
  if (DICT[lw]) return DICT[lw].split(' ');
  const out = [];
  const w = lw.replace(/[^a-z']/g, '');
  let i = 0;
  while (i < w.length) {
    const ch = w[i];
    if (ch === "'") { i++; continue; }
    const rules = R[ch];
    let done = false;
    if (rules) {
      for (const [l, m, r, ph] of rules) {
        if (!w.startsWith(m, i)) continue;
        if (l && !matchLeft(w, i - 1, l)) continue;
        if (r && !matchRight(w, i + m.length, r)) continue;
        if (ph) out.push(...ph.split(' '));
        i += m.length; done = true; break;
      }
    }
    if (!done) i++;
  }
  return out;
}

const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export function textToTokens(text) {
  const t = text.replace(/(\d)/g, ' $1 ').replace(/[-–—]/g, ' , ');
  const toks = [];
  for (const raw of t.split(/\s+/)) {
    if (!raw) continue;
    const m = raw.match(/^([^a-zA-Z0-9']*)([a-zA-Z0-9']*)([^a-zA-Z0-9']*)$/);
    const core = m ? m[2] : raw;
    const tail = m ? m[3] : '';
    if (/^\d$/.test(core)) toks.push({ w: NUMS[+core] });
    else if (core) toks.push({ w: core });
    if (tail.includes(',') || tail.includes(';') || tail.includes(':')) toks.push({ pause: 0.18 });
    if (tail.includes('.') || tail.includes('!')) toks.push({ pause: tail.includes('...') ? 0.6 : 0.32, end: true });
    if (tail.includes('?')) toks.push({ pause: 0.32, end: true, q: true });
  }
  return toks;
}

const FUNCTION = new Set(['a', 'the', 'to', 'of', 'and', 'or', 'is', 'are', 'was', 'be', 'in', 'on', 'at', 'it', 'i', 'you', 'your', 'my', 'me', 'we', 'he', 'she', 'that', 'this', 'for', 'with', 'as', 'an', 'do', 'have', 'has', 'can', 'will']);

// ---------------------------------------------------------------- synthesis
class Res { // Klatt resonator
  constructor() { this.y1 = 0; this.y2 = 0; this.a = 0; this.b = 0; this.c = 0; }
  set(f, bw, sr) { const T = 1 / sr; this.c = -Math.exp(-2 * Math.PI * bw * T); this.b = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * f * T); this.a = 1 - this.b - this.c; }
  p(x) { const y = this.a * x + this.b * this.y1 + this.c * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}

// voice: {pitch, speed, formant, breathy, whisper, robot, fry, vibrato, jitter, gain}
export function synth(text, voice = {}) {
  const sr = TTS_SR;
  const v = { pitch: 120, speed: 1, formant: 1, breathy: 0.05, whisper: false, robot: false, fry: 0, vibrato: 0, jitter: 0.02, gain: 0.8, ...voice };
  const toks = textToTokens(text);
  // build segment list
  const segs = [];
  let wordIdx = 0;
  const nWords = toks.filter((t) => t.w).length || 1;
  for (const tk of toks) {
    if (tk.pause) { segs.push({ sil: tk.pause, end: tk.end, q: tk.q }); continue; }
    const phs = wordToPhonemes(tk.w);
    const content = !FUNCTION.has(tk.w.toLowerCase());
    let stressed = false;
    phs.forEach((ph, k) => {
      const d = P[ph]; if (!d) return;
      let stress = 0;
      if ((d[4] === 'v' || d[4] === 'd') && !stressed && content) { stress = 1; stressed = true; }
      segs.push({ ph, d, stress, word: wordIdx, last: k === phs.length - 1 });
    });
    segs.push({ sil: 0.025 });
    wordIdx++;
  }
  // timings
  let total = 0;
  for (const s of segs) {
    if (s.sil !== undefined) s.dur = s.sil / v.speed;
    else {
      let ms = s.d[3] * (s.stress ? 1.25 : 1) * (s.last && (s.d[4] === 'v' || s.d[4] === 'd') ? 1.2 : 1);
      if (s.d[4] === 's') ms = s.d[3]; // closure+burst
      s.dur = ms / 1000 / v.speed;
    }
    s.t0 = total; total += s.dur;
  }
  total += 0.15;
  const n = Math.floor(total * sr);
  const out = new Float32Array(n);
  const r1 = new Res(), r2 = new Res(), r3 = new Res(), r4 = new Res(), r5 = new Res(), rn = new Res(), rf = new Res(), rb = new Res();
  r4.set(3500 * v.formant, 250, sr); r5.set(4500 * v.formant, 300, sr); rn.set(270, 100, sr);
  let phase = 0, si = 0;
  let F1 = 500, F2 = 1500, F3 = 2500;
  let jit = 0, fryT = 0;
  const lp = { y: 0 };
  let lastQ = false;
  for (const s of segs) if (s.q) lastQ = true;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    while (si < segs.length - 1 && t >= segs[si].t0 + segs[si].dur) si++;
    const s = segs[si];
    const local = s ? (t - s.t0) / s.dur : 1;
    let tF1 = F1, tF2 = F2, tF3 = F3, AV = 0, AF = 0, FF = 3000, AH = 0, nasal = 0, burst = 0;
    if (s && s.sil === undefined) {
      const d = s.d, kind = d[4];
      tF1 = d[0]; tF2 = d[1]; tF3 = d[2];
      if (kind === 'd') { const e = P[d[5]]; const k = Math.min(1, Math.max(0, (local - 0.3) / 0.7)); tF1 += (e[0] - tF1) * k; tF2 += (e[1] - tF2) * k; tF3 += (e[2] - tF3) * k; }
      if (kind === 'v' || kind === 'd') AV = 1;
      else if (kind === 'g') AV = 0.75;
      else if (kind === 'n') { AV = 0.55; nasal = 1; }
      else if (kind === 'f') { AF = d[6]; FF = d[5]; AV = d[7] ? 0.45 : 0; }
      else if (kind === 'h') { AH = 0.9; const nx = segs[si + 1]; if (nx && nx.d) { tF1 = nx.d[0]; tF2 = nx.d[1]; tF3 = nx.d[2]; } }
      else if (kind === 's') {
        // closure then burst (+ aspiration for voiceless)
        if (local < 0.55) { AV = d[7] ? 0.25 : 0; }
        else if (local < 0.7) { burst = 1; FF = d[5]; AF = 0.9; }
        else { AH = d[7] ? 0 : 0.5; AV = d[7] ? 0.6 : 0; const nx = segs[si + 1]; if (nx && nx.d) { tF1 = nx.d[0]; tF2 = nx.d[1]; tF3 = nx.d[2]; } }
      } else if (kind === 'a') {
        if (local < 0.35) { AV = d[7] ? 0.2 : 0; } else { AF = d[6]; FF = d[5]; AV = d[7] ? 0.4 : 0; }
      }
    }
    // smooth formant movement
    const sm = 1 - Math.exp(-1 / (0.012 * sr));
    F1 += (tF1 - F1) * sm; F2 += (tF2 - F2) * sm; F3 += (tF3 - F3) * sm;
    if ((i & 15) === 0) { r1.set(F1 * v.formant, 60 + F1 * 0.08, sr); r2.set(F2 * v.formant, 80 + F2 * 0.06, sr); r3.set(F3 * v.formant, 120, sr); rf.set(FF, FF * 0.35, sr); rb.set(FF, FF * 0.6, sr); }
    // pitch contour: declination, stress bumps, question rise, jitter
    const prog = t / total;
    let f0 = v.pitch * (1.12 - 0.22 * prog);
    if (s && s.stress) f0 *= 1 + 0.14 * Math.sin(Math.PI * Math.min(1, local));
    if (lastQ && prog > 0.8) f0 *= 1 + (prog - 0.8) * 1.5;
    if (v.robot) f0 = v.pitch;
    jit += (Math.random() - 0.5) * v.jitter; jit *= 0.995;
    f0 *= 1 + jit + v.vibrato * Math.sin(2 * Math.PI * 5.5 * t);
    if (v.fry > 0 && Math.random() < v.fry * 0.002) fryT = 0.06;
    if (fryT > 0) { fryT -= 1 / sr; f0 *= 0.35; }
    phase += f0 / sr;
    let glot = 0;
    if (phase >= 1) phase -= 1;
    // glottal flow derivative (Rosenberg-ish)
    const op = 0.6;
    if (phase < op) glot = Math.sin(Math.PI * phase / op) * Math.cos(Math.PI * phase / (op * 2)) ; else glot = -Math.sin(Math.PI * (phase - op) / (1 - op)) * 0.5;
    glot -= lp.y; lp.y += glot * 0.02; // remove DC
    const noise = Math.random() * 2 - 1;
    let src;
    if (v.whisper) src = noise * (AV * 0.6 + AH);
    else src = glot * AV * (1 - v.breathy) + noise * (AH * 0.6 + AV * v.breathy);
    let y = r1.p(src); y = r2.p(y); y = r3.p(y); y = r4.p(y); y = r5.p(y);
    if (nasal) y = y * 0.5 + rn.p(src) * 0.6;
    const fric = (burst ? rb.p(noise) * 1.4 : rf.p(noise)) * AF;
    out[i] = (y * 0.9 + fric * 0.5);
  }
  // normalize + fade
  let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(out[i]));
  const k = m > 0 ? v.gain / m : 1;
  for (let i = 0; i < n; i++) out[i] *= k;
  for (let i = 0; i < 200 && i < n; i++) { out[i] *= i / 200; out[n - 1 - i] *= i / 200; }
  return { data: out, sr, dur: total };
}

// preset voices for callers & the facility
export const VOICES = {
  man: { pitch: 112, formant: 0.98, speed: 1.0, breathy: 0.06 },
  oldman: { pitch: 98, formant: 0.95, speed: 0.85, breathy: 0.12, jitter: 0.05, fry: 0.6 },
  woman: { pitch: 205, formant: 1.14, speed: 1.02, breathy: 0.1 },
  oldwoman: { pitch: 185, formant: 1.08, speed: 0.85, breathy: 0.15, jitter: 0.05, vibrato: 0.02 },
  teen: { pitch: 160, formant: 1.08, speed: 1.12, breathy: 0.08 },
  child: { pitch: 290, formant: 1.28, speed: 0.95, breathy: 0.08 },
  wrong: { pitch: 80, formant: 0.92, speed: 0.78, breathy: 0.2, jitter: 0.08, fry: 2, vibrato: 0.01 },
  whisper: { pitch: 150, formant: 1.05, speed: 0.8, whisper: true },
  machine: { pitch: 78, formant: 0.9, speed: 0.72, robot: true, breathy: 0.02, jitter: 0 },
  you: { pitch: 168, formant: 1.06, speed: 0.95, breathy: 0.14, jitter: 0.04 },
  supervisor: { pitch: 125, formant: 1.0, speed: 1.15, breathy: 0.04 },
};
