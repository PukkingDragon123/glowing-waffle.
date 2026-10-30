// LIFELINE 24 Knowledge Base. Viewing some articles teaches the agent things (`learn`),
// which unlocks better answers in calls.

export const KB = [
  { id: 'welcome', title: 'Welcome, Agent! (Start here)', tags: 'start help basics rating', html: `
<h3>Welcome to LIFELINE 24!</h3>
<p><span class="tag">ALL AGENTS</span>We answer <b>everything</b>. That is the brand. That is the problem.</p>
<ol>
<li><b>Clock In</b> to take calls. Lines are open <b>09:00–23:00</b>.</li>
<li>When the phone rings, press <b>Answer</b>. Unanswered calls are logged. Doreen reads the logs.</li>
<li>Pick responses with the mouse or keys <code>1</code>–<code>4</code>.</li>
<li>Use the tabs: <b>Knowledge Base</b> (you are here), <b>Switchboard</b> (transfers), <b>Account Tool</b> (lookups &amp; device resets).</li>
<li>Callers rate you 1–5 stars. Stars are money. Tips are love, monetised.</li>
</ol>
<p>Other helpful places: the <i>Hotline Training</i> folder in My Computer, your e-mail, and the open web.</p>` },

  { id: 'nosignal', title: 'TV: "NO SIGNAL" on the screen', tags: 'tv television no signal input hdmi remote cable box', html: `
<h3>TV shows "NO SIGNAL"</h3>
<p>Nine times out of ten the TV is fine; it is listening to the wrong input.</p>
<p><b>Do these steps in this order:</b></p>
<ol>
<li>Check the <b>cable box</b> (the small black box). Its light must be <b>green</b>. <b>Red means off</b> — press the power button on the box itself.</li>
<li>On the <b>long TV remote</b>, press <b>INPUT</b> (sometimes SOURCE) repeatedly until the screen says <code>HDMI 1</code>.</li>
<li>Only if it still fails: unplug the cable box for 10 seconds.</li>
</ol>
<p>Do <b>not</b> advise customers to hit the television. It works, which is the problem.</p>` },

  { id: 'fridge', title: 'Smart Appliances: locked out (FR-series fridges)', tags: 'fridge refrigerator smart locked password reset code device', learn: 'fridge_rule', html: `
<h3>Customer locked out of a smart fridge</h3>
<p>FR-series fridges lock after three wrong snack passwords.</p>
<p><b>Reset code</b> = the fridge's <b>model number written backwards</b>, keeping the dashes where they fall.</p>
<p>Example: model <code>AB-12-C</code> → reset code <code>C-21-BA</code>.</p>
<ol><li>Ask the customer for the model number (sticker inside the door, or on the screen).</li>
<li>Open <b>Account Tool → Device Reset</b>, enter the code and press <b>Push Code</b>.</li></ol>
<p>Agents without a fridge may find this article emotionally difficult. Take a breath.</p>` },

  { id: 'switchboard', title: 'Switchboard: transferring calls', tags: 'transfer switchboard department jack cable pizza billing tech paranormal legal void', html: `
<h3>Transferring a call</h3>
<p>Open the <b>Switchboard</b> tab and drag the cable from <b>LINE 1</b> into a department jack.</p>
<ul>
<li><b>BILLING</b> – money, refunds</li><li><b>TECH</b> – devices</li>
<li><b>PARANORMAL</b> – approved PPR-3 returns only (see policy)</li>
<li><b>LEGAL</b> – threats, lawsuits</li>
<li><b>PIZZA PRONTO</b> – partner line, $2 referral per transfer</li>
<li><b>THE VOID</b> – prank callers only</li></ul>
<p>A wrong transfer ends the call and the caller rates you accordingly.</p>` },

  { id: 'pizza', title: 'Misdials: "Is this the pizza place?"', tags: 'pizza misdial wrong number pronto order', html: `
<h3>We are not a pizza place</h3>
<p>Our number is one digit away from <b>Pizza Pronto</b>. They pay a $2 referral for each caller transferred to jack <b>PIZZA PRONTO</b>.</p>
<p>Taking pizza orders yourself is not prohibited. It is <i>discouraged</i>. Doreen has opinions about anchovies.</p>` },

  { id: 'ppr3', title: 'Paranormal Product Returns Policy (PPR-3)', tags: 'paranormal haunted house return refund policy evidence ghost furniture', learn: 'ppr3', html: `
<h3>PPR-3: returning a haunted product</h3>
<p>Houses, dolls, mirrors and smart speakers may be returned under PPR-3 if the customer provides <b>all three</b> items of evidence:</p>
<ol>
<li>The event happened while <b>nobody was home</b>.</li>
<li>At least one object moved <b>against gravity</b> (up, not down).</li>
<li>A <b>third party witnessed</b> it (neighbour, pet, or recording).</li>
</ol>
<p>With three of three: approve, then transfer the caller to <b>PARANORMAL</b>.<br>With fewer: politely decline. Do not argue with the house.</p>` },

  { id: 'routers', title: 'Router models & reset procedures', tags: 'router wifi wi-fi internet reset password model antenna light', learn: 'routers', html: `
<h3>Identify the router, then reset it</h3>
<table border="1" cellpadding="3">
<tr><th>Model</th><th>Antennas?</th><th>Light</th><th>Reset</th></tr>
<tr><td>LinkHog 200</td><td>yes</td><td>blue</td><td>hold RESET for 10 s</td></tr>
<tr><td>NetPotato XL</td><td>yes</td><td>orange</td><td>unplug for 30 s</td></tr>
<tr><td>WaveBox Mini</td><td>no</td><td>orange</td><td>press WPS three times</td></tr>
<tr><td>Mesh-o-Matic</td><td>no</td><td>blue</td><td>turn it upside down for 5 s (we don't know why)</td></tr>
</table>
<p>Ask yes/no questions: antennas first, then light colour.</p>` },

  { id: 'walls', title: 'Callers residing inside walls', tags: 'wall knock knocking tenant drywall muffled yes no', learn: 'knocks', html: `
<h3>Wall residents</h3>
<p>Some callers live inside walls, floors or ceilings and can only answer by knocking.</p>
<p><b>One knock = YES. Two knocks = NO.</b> Many knocks = they are upset.</p>
<p>Wall residents are customers. Do not ask how they pay rent. They do not.</p>` },

  { id: 'deceased', title: 'Disconnected lines & deceased subscribers', tags: 'dead deceased disconnected dial tone ghost obituary line status gentle closure', learn: 'gentle', html: `
<h3>Gentle Closure Protocol</h3>
<p>If <b>Account Tool → Lookup</b> shows a line status of <b>DECEASED</b>, the caller may not be aware.</p>
<ol><li>Confirm their name and number.</li><li>Be honest. Be kind. Do not rush.</li><li>Do not bill the caller. They have enough going on.</li></ol>
<p>Obituaries are archived on <i>dailypulse.news</i>.</p>` },

  { id: 'registry', title: 'Product Registry: kitchen appliances', tags: 'toaster kettle blender registry model breadzapper kitchen appliance', learn: 'registry', html: `
<h3>Registered kitchen appliances</h3>
<ul><li>Toasters: <b>CrumbKing 400</b>, <b>ToastMaster Duo</b>, <b>Brava Slice</b></li>
<li>Kettles: <b>Boilr</b>, <b>Kettlebelle</b></li>
<li>Blenders: <b>VortexPro</b></li></ul>
<p><b>Note:</b> the <code>BreadZapper</code> line was announced in 1994 and <b>never manufactured</b>. Calls about a BreadZapper are almost always a line trace. See <i>Protocol 7</i>.</p>` },

  { id: 'protocol7', title: 'Protocol 7: suspected line trace', tags: 'trace tracing agent government police location address protocol hang up', learn: 'protocol7', html: `
<h3>Protocol 7</h3>
<p>If a caller asks for your address, building or floor, stalls, or reports a product that does not exist, the line may be traced.</p>
<ol><li>Do not confirm any location.</li><li>Keep answers short.</li><li><b>Hang up</b> before the trace meter fills.</li></ol>
<p>LIFELINE 24 does not cooperate with traces without a warrant, a subpoena, or a very nice fruit basket.</p>` },

  { id: 'morse', title: 'Morse code & non-verbal callers', tags: 'morse beep beeps code tapping nonverbal decode', html: `
<h3>Morse callers</h3>
<p>Short beep = dot, long beep = dash. A reference chart lives in <b>My Computer → Hotline Training → morse_chart.txt</b> (and on <i>morsecode.wiki</i>).</p>
<p>Type the decoded message into the response line and press <b>Send</b>.</p>` },

  { id: 'languages', title: 'Non-human languages', tags: 'alien language translate translation choir singing phrasebook', html: `
<h3>Unsupported languages</h3>
<p>LIFELINE 24 supports four Earth languages and zero others.</p>
<p>If a caller speaks something unknown, consult any personal phrasebooks you may own. We will not ask why you own them.</p>` },

  { id: 'ownnumber', title: 'Calls from your own number', tags: 'own number home caller id myself spoof', html: `
<h3>Incoming call from your own number</h3>
<p>This should not happen.</p><p>If it does, do not answer twice.</p>` },

  { id: 'ratings', title: 'Ratings, pay & tips', tags: 'pay money rating stars tip earnings', html: `
<h3>Pay</h3>
<p>Each call pays its base rate × (stars ÷ 5), plus any tip. Pay arrives instantly at <i>First Bank of Earth</i>.</p>
<p>Missed calls pay nothing and make Doreen sigh audibly over e-mail.</p>` },
];

export function searchKB(q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return KB;
  return KB.map((a) => {
    const hay = (a.title + ' ' + a.tags + ' ' + a.html.replace(/<[^>]+>/g, ' ')).toLowerCase();
    const score = words.reduce((s, w) => s + (a.title.toLowerCase().includes(w) ? 3 : 0) + (a.tags.includes(w) ? 2 : 0) + (hay.includes(w) ? 1 : 0), 0);
    return { a, score };
  }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score).map((x) => x.a);
}

// Customer records for Account Tool → Lookup. `learn` is set when looked up.
export const ACCOUNTS = {
  '555-0143': { name: 'HOLLOWAY, AGNES', addr: 'Willow Court Retirement Village, Flat 2', plan: 'Silver Saver (since 1979)', status: 'ACTIVE', notes: 'Calls about the TV. Calls about the moon. Lovely.' },
  '555-0198': { name: 'KOWALCZYK, DALE', addr: '88 Larkspur Lane', plan: 'Smart Home Ultra', status: 'ACTIVE', notes: 'Device on file: FR-4471-Q (smart fridge). 3 lockouts this year.' },
  '555-0110': { name: 'BRIGGS, KEVIN', addr: '12 Tram Street, Apt 9', plan: 'Basic', status: 'ACTIVE', notes: 'Frequently misdials. Hungry.' },
  '555-0166': { name: 'DELACROIX, LORRAINE', addr: '3 Hollow Oak Drive', plan: 'Home & Hearth', status: 'ACTIVE', notes: 'Purchased property 19 days ago. Property history: "eventful".' },
  '555-0117': { name: 'MARROW, EDITH', addr: '14 Lantern Street', plan: 'Rotary Classic', status: 'DECEASED', notes: 'Line disconnected 14 MAR 1987. Subscriber deceased.\nThere is still a dial-out every night at 03:12.', learn: 'edith_dead' },
  '555-0000': { name: '— NO RECORD —', addr: 'Unlisted trunk line', plan: 'n/a', status: 'GOVERNMENT', notes: 'Routing: DTP-7 // DEPT. OF TERRESTRIAL PURITY.\nThis number is not a toaster owner.', learn: 'finch_gov' },
  '555-1407': { name: 'SUNNY (you)', addr: 'Golden Lotus Mansions, Room 1407', plan: 'Employee', status: 'ACTIVE', notes: 'Last outgoing call: tomorrow, 14:07.\n(That can\'t be right.)' },
  '555-0001': { name: 'BRASS, H. (GEN.)', addr: 'classified', plan: 'classified', status: 'CLASSIFIED', notes: 'Do not engage.' },
  '555-0123': { name: 'CHEN, MEI-LIN', addr: '41 Garden Row', plan: 'Basic', status: 'ACTIVE', notes: 'Trying to reach her son. Her son is not here.' },
  '555-0199': { name: 'PARK, MILO (minor)', addr: "Parent's account", plan: 'Family', status: 'ACTIVE', notes: 'Age 8. Has questions about aliens.' },
};
