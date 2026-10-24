// Blueberry Pie Online — Support Manual v3.2 (knowledge base articles).
export const KB = [
  { id: 'KB-101', title: 'Error 678: The remote computer did not respond', keys: '678 remote computer did not respond no answer handshake call waiting dial',
    body: [
      'SYMPTOM: Customer dials, the modem screeches, then Dial-Up Networking reports Error 678.',
      'CAUSES: Call waiting interrupting the handshake, a noisy phone line, or a dead access number.',
      'STEP 1: Run a LINE TEST from the Account tab.',
      'STEP 2: If the line tests CLEAN, the customer most likely has call waiting. Instruct them to add *70, (star seven zero comma) in front of the access number.',
      'STEP 3: If the line tests NOISY, use CHANGE ACCESS NUMBER to move them to a quieter point of presence.',
    ] },
  { id: 'KB-102', title: 'Error 691: Access denied (user name / password)', keys: '691 access denied password username login invalid forgot caps lock',
    body: [
      'SYMPTOM: Error 691 "Access was denied because the user name and/or password was invalid on the domain."',
      'STEP 1: Confirm the user name is all lower case with no spaces.',
      'STEP 2: Ask whether CAPS LOCK is on.',
      'STEP 3: Use RESET PASSWORD on the Account tab and read the temporary password to the customer slowly.',
      'NOTE: Never read the old password to a caller.',
    ] },
  { id: 'KB-103', title: 'Error 630 / "The modem is not responding"', keys: '630 modem not responding not detected hardware init string driver reprovision',
    body: [
      'SYMPTOM: The computer reports that the modem is not responding, or Error 630.',
      'STEP 1: For external modems, confirm the power light is on and the serial cable is seated.',
      'STEP 2: Use REPROVISION MODEM on the Account tab. This pushes a fresh initialization string (AT&F&C1&D2) to the customer profile.',
      'STEP 3: Ask the customer to restart the computer.',
    ] },
  { id: 'KB-104', title: '"The page cannot be displayed" / DNS failures', keys: 'page cannot be displayed dns web browser server not found website internet explorer voyager',
    body: [
      'SYMPTOM: The customer is connected but web pages will not load. E-mail may still work.',
      'CAUSE: Stale DNS entries on the customer profile after the March network migration.',
      'FIX: Use FLUSH DNS on the Account tab. Primary DNS 206.13.28.12, secondary 206.13.29.12.',
      'Ask the customer to close and reopen their browser.',
    ] },
  { id: 'KB-105', title: 'E-mail cannot be sent (0x800CCC0E)', keys: '0x800ccc0e email e-mail send outgoing smtp server mail cannot be sent',
    body: [
      'SYMPTOM: Mail can be received but sending fails with error 0x800CCC0E.',
      'FIX: Outgoing mail (SMTP) server must be  mail.blueberrypie.net  on port 25.',
      'Tell the customer to open Tools > Accounts > Properties > Servers and correct the outgoing server.',
      'No account tool is required for this issue.',
    ] },
  { id: 'KB-106', title: 'Slow connection speeds', keys: 'slow speed 28.8 26.4 33.6 56k v.90 x2 connect rate noise',
    body: [
      'SYMPTOM: Customer with a 56K modem only connects at 26,400 or 28,800 bps.',
      'STEP 1: Run a LINE TEST. Line noise above -40dB prevents 56K connections.',
      'STEP 2: If the line is noisy, the modem firmware needs the V.90 update. Use SEND INSTALL CD to mail the Blueberry Pie 4.0 CD with the modem update.',
    ] },
  { id: 'KB-107', title: 'Busy signal when dialing', keys: 'busy signal busy tone peak hours access number',
    body: [
      'SYMPTOM: The customer hears a busy signal when the modem dials.',
      'CAUSE: The local point of presence is full during peak hours (6pm - 11pm).',
      'FIX: Use CHANGE ACCESS NUMBER to assign an alternate local number.',
    ] },
  { id: 'KB-108', title: 'Billing, credits and outages', keys: 'billing bill charge credit refund money outage cancel',
    body: [
      'Agents may ISSUE CREDIT of up to one month for documented outages.',
      'Cancellation requests must be ESCALATED to the Retention team. Do not argue with the customer.',
    ] },
  { id: 'KB-109', title: 'Y2K readiness statement', keys: 'y2k year 2000 millennium bug compliant',
    body: [
      'Blueberry Pie Online is fully Y2K compliant. Our network will continue to operate normally on January 1, 2000.',
      'Reassure the customer. No action is required on their account.',
    ] },
  { id: 'KB-110', title: 'Strange noises from the modem', keys: 'noise screech screaming sound modem noise hiss',
    body: [
      'The screeching sound when connecting is the normal handshake between modems and is not a fault.',
      'If the customer reports voices in the handshake, see KB-0419.',
    ] },
  { id: 'KB-111', title: 'Disconnected after a few minutes', keys: 'disconnect dropped drops idle timeout call waiting',
    body: [
      'Accounts are disconnected after 20 minutes of inactivity.',
      'Frequent drops while active are usually call waiting: have the customer dial *70, before the access number.',
    ] },
];

// articles that appear as the week goes wrong
export const KB_LATE = [
  { id: 'KB-0419', day: 3, title: 'Callers who describe your apartment', keys: 'apartment describe know name watching who is this 4b strange caller',
    body: ['Do not confirm the details. Do not look behind you.', 'End the call politely. The caller will not hang up. That is normal.', 'If the caller continues speaking after the line is closed, put the handset face down on the desk.'] },
  { id: 'KB-0420', day: 4, title: 'Hunger', keys: 'hungry hunger eat food appetite starving',
    body: ['An increased appetite is expected and healthy at this stage.', 'Agents should eat whatever is available. Pets are available.'] },
  { id: 'KB-0421', day: 5, title: 'The cat is afraid of me', keys: 'cat afraid scared hiss mochi pet',
    body: ['Animals perceive the change before you do.', 'It is not afraid of you. It is afraid of what is listening through you.'] },
  { id: 'KB-0422', day: 6, title: 'How do I get it out', keys: 'get it out remove inside baby kick moving',
    body: ['You do not.', 'Remain calm. Remain indoors. Go to the window when it is time.'] },
  { id: 'KB-0423', day: 7, title: 'SUBJECT STATUS', keys: 'subject status complete facility window',
    body: ['SUBJECT 0419 ... GESTATION 99%', 'PROCEED TO THE WINDOW.'] },
];

export function searchKB(q, day) {
  const words = q.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 1);
  const pool = KB.concat(KB_LATE.filter((a) => day >= a.day));
  if (!words.length) return pool.slice(0, 8);
  const scored = pool.map((a) => {
    const hay = (a.title + ' ' + a.keys + ' ' + a.id).toLowerCase();
    let s = 0; for (const w of words) if (hay.includes(w)) s += w.length;
    return { a, s };
  }).filter((x) => x.s > 0).sort((p, q2) => q2.s - p.s);
  return scored.map((x) => x.a);
}
