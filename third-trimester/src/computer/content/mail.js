// Mail that arrives over the week. `at` = earliest clock minute on that day.

export const MAILS = [
  // ---------------- DAY 1
  { id: 'd1_doreen', day: 1, from: 'Doreen Pratt', addr: 'd.pratt@lifeline24.com', subject: 'Re: Your Shift (PLEASE READ)', body:
`Sunny,

Welcome back. I heard there was "an incident" at your building last night. I hope you are okay. I hope your incident does not affect your call metrics.

Reminders:
• Clock In from the Agent Console. Lines open 09:00.
• Use the Knowledge Base. It exists. People wrote it. (I wrote it.)
• Transfers go through the Switchboard. Drag the cable. Don't yank it, they're expensive.
• Ratings are pay. Pay is ratings. You understand.

I have attached nothing, because last time I attached something you said it "screamed".

Warmly (corporate warmly),
Doreen Pratt
Shift Supervisor, LIFELINE 24 — "We Answer Everything"`, replies: ['Thanks Doreen, clocking in soon.', 'I am okay. Mostly. Thank you for asking. Kind of.'] },

  { id: 'd1_dtp', day: 1, from: 'Dept. of Terrestrial Purity', addr: 'noreply@dtp.gov', subject: 'NOTICE OF INVESTIGATION — FORM 7B', body:
`DEPARTMENT OF TERRESTRIAL PURITY
Office of Extra-Normal Households

RE: Case #1407-G ("GARY")

Citizen,

Your spouse, an unregistered non-terrestrial entity calling himself "Gary", has been taken into protective custody for the protection of everybody, mostly us.

You are instructed to:
  1. Remain within city limits.
  2. Report any unusual births.
  3. Report any usual births.
  4. Not contact the press, the moon, or "the Board".

Failure to comply may result in further visits.

Have a Terrestrial day.

— Gen. H. Brass, Director
(This mailbox is not monitored. We are, however, monitoring you.)`, replies: ['Give him back.', 'What is "the Board"?'] },

  { id: 'd1_quik', day: 1, at: 600, from: 'QuikMart Delivery', addr: 'deals@quikmart.shop', subject: '🍜 Noodles to your door in 30 min!', body:
`Hi neighbour!

Fridge empty? No fridge at all? QuikMart delivers to Golden Lotus Mansions!

• Lucky Noodle — all flavours
• Eggs, pickles, chocolate, ice (we cannot be held responsible for ice)
• NEW: GLOW xeno-infant formula. Don't ask. Just glow.

Visit quikmart.shop in your Voyager browser. Orders arrive at your door in about 30 minutes. We knock twice. If we knock three times, it wasn't us.

QuikMart — "Quick, Mart!"` },

  { id: 'd1_asn', day: 1, at: 720, from: 'AlienSpouseSupport.net', addr: 'digest@alienspousesupport.net', subject: 'Daily Digest: 4 new threads', body:
`AlienSpouseSupport.net — Daily Digest

🛸 "My wife's antennae are molting. Normal??"  (31 replies)
🛸 "Husband keeps 'phasing' through the shower door. Grout bill attached"  (12 replies)
🛸 "PSA: the DTP took my in-laws' ship AND the casserole dish"  (88 replies)
🛸 "Anyone else expecting? (human dad here)"  (1 reply — from you, 3 weeks ago, unanswered)

You are not alone. Statistically, you are one of 412 of us.

Unsubscribe | Visit forum` },

  { id: 'd1_prince', day: 1, at: 900, from: 'PRINCE ZORLAK OF NEPTUNE', addr: 'prince@neptune-royal-treasury.biz', subject: 'URGENT: YOU HAVE INHERITED 40,000,000 MOON BUCKS', body:
`DEAREST EARTH FRIEND,

I AM PRINCE ZORLAK, EXILED HEIR TO THE THRONE OF NEPTUNE. A TERRIBLE COUP (BY CATS) HAS FROZEN THE ROYAL TREASURY.

I REQUIRE ONLY YOUR BANK DETAILS AND ONE (1) INSTANT NOODLE TO RELEASE 40,000,000 MOON BUCKS TO YOU.

THIS IS NOT A SCAM. ON NEPTUNE "SCAM" MEANS "GIFT".

YOURS IN ROYALTY,
PRINCE ZORLAK
(currently at the library)`, replies: ['No.', 'Which cats?'] },

  // ---------------- DAY 2
  { id: 'd2_doreen', day: 2, from: 'Doreen Pratt', addr: 'd.pratt@lifeline24.com', subject: 'Productivity & You (mandatory)', body:
`Team,

A reminder that "my body is doing something impossible" is not a valid reason to miss calls. We have all been there. (I have not been there.)

Also — some of you are reporting "noises on the line." Breathing, giggling, lullabies. Please stop putting your personal lives on the line. Literally.

— D.`, replies: ['I had a baby this morning, Doreen.', 'Understood.'] },

  { id: 'd2_mom', day: 2, from: 'Mum', addr: 'mum1952@hotpost.net', subject: 'your father and I saw the news', body:
`Sunny,

Your father and I saw the news. The building with the ship sticking out of it, is that near you? Your father says it is "basically your building". Your father exaggerates.

Is the baby here yet? Is it a boy? Does it have your nose? Does it have a nose? Your aunt says aliens don't have noses but your aunt also says the microwave can read her thoughts.

We are not angry. We are confused, and a little proud, and your father has started a scrapbook.

Eat something.

Love,
Mum
P.S. Gary called us on Sunday to ask what "a casserole" is. He is a very polite boy. Bring him home.`, replies: ['He\'s here, Mum. He has no nose. He\'s perfect.', 'I\'m eating. I love you.'] },

  { id: 'd2_asn', day: 2, at: 660, from: 'AlienSpouseSupport.net', addr: 'digest@alienspousesupport.net', subject: 'Congratulations on the hatching! 🎉', cond: (g) => g.state?.baby?.born, body:
`The community saw your post. CONGRATULATIONS!

Tips from members who have been there:
• "Glow formula, not milk. Milk makes them float for hours."
• "If he stares at the corner, wave at the corner. Be polite."
• "Crystals in the diaper are NORMAL. They sell for good money on QuikMart."
• "They mimic voices. Mine does my mother-in-law. It's uncanny. It's better than her."

Welcome to the hardest, strangest, best thing.

— Moderator Glenda (married to a sentient fog since 2009)` },

  { id: 'd2_lucky', day: 2, at: 900, from: 'Lucky Noodle Fan Club', addr: 'fans@luckynoodle.co', subject: 'You\'ve been selected: Noodle Loyalty Tier PLATINUM', body:
`Congratulations, valued slurper!

Our records show you have purchased Lucky Noodle 1,407 times this year. You have reached PLATINUM.

Your rewards:
  • A sense of belonging
  • A sticker (please allow 6–8 years)

Remember: noodles taste better in a bowl.

— The Lucky Noodle Family` },

  // ---------------- DAY 3
  { id: 'd3_gary', day: 3, from: 'Gary', addr: 'gary@7thdrift.space', subject: 'if you are reading this', body:
`Sunny,

If you are reading this, the "scheduled send" worked, and I did not come home to cancel it. I am sorry. I set it in case. My people always set things in case.

Things you should know:
1. The baby will be fine. He is half you, so he will be stubborn and sing badly. He is half me, so he will glow when he is happy. Count the glow. It means you are doing well.
2. He will want the green formula. Warm, not hot. Test it on your wrist like your mother showed me with the soup.
3. If he cries in a frequency that cracks glass, hum. Any song. He knows your voice from the inside.
4. Tofu knows more than he lets on. Trust the cat.
5. The noodles are on the high shelf. I put them there so you would stretch. Stretching is good for the back. Your back is important to me.

I fell into your window once. I would do it again every time.

Shurrr (purr it, don't say it),
Gary`, replies: ['Come home.', 'Shurrr.'] },

  { id: 'd3_dtp', day: 3, at: 600, from: 'Dept. of Terrestrial Purity', addr: 'noreply@dtp.gov', subject: 'Reminder: Drones Are For Your Safety', body:
`Citizen,

You may notice a drone outside your window. Do not wave at the drone. Do not feed the drone. The drone is for your safety.

If the drone waves at you, that is a malfunction. Please report it to the drone.

— DTP Community Outreach` },

  { id: 'd3_doreen', day: 3, at: 840, from: 'Doreen Pratt', addr: 'd.pratt@lifeline24.com', subject: 'Paranormal calls are NOT billable', body:
`Sunny,

Your call logs this week include: a ghost, a house, a man in a wall, and "purring".

LIFELINE 24 answers EVERYTHING, but we do not BILL everything. Please continue to be kind to the dead. They leave great reviews.

— D.

P.S. Your ratings are actually very good. Don't let it go to your head. Your head is already very full, I imagine.` },

  // ---------------- DAY 4
  { id: 'd4_doreen', day: 4, from: 'Doreen Pratt', addr: 'd.pratt@lifeline24.com', subject: 'Line Monitoring Notice', body:
`All agents,

Some lines are being monitored by "a government partner" today. Legal says I'm not allowed to tell you which. Legal also says I'm not allowed to tell you to read Protocol 7 in the Knowledge Base.

So I'm not telling you that.

— D.` },

  { id: 'd4_tomorrow', day: 4, at: 660, from: '(no sender)', addr: 'tomorrow@1407', subject: 'don\'t open the door', body:
`don't open the door when they knock.
don't fight.
wait for the suit.

(this e-mail was sent at 14:07 on Friday)
(today is Thursday)` },

  { id: 'd4_bank', day: 4, at: 780, from: 'First Bank of Earth', addr: 'security@firstbankofearth.com', subject: 'Account Review Notice', body:
`Dear Customer,

Our automated systems flagged recent deposits from "THE BOARD" (memo: "tuna money").

We have reviewed the deposit and found that THE BOARD owns this bank.

No further action is required. Please disregard this e-mail. Please disregard us.

First Bank of Earth — "We're Just A Bank"` },

  // ---------------- DAY 5
  { id: 'd5_board', day: 5, from: 'Office of the Chairman', addr: 'chairman@theboard', subject: 'AGENDA — 1407 — today', body:
`MINUTES OF THE BOARD — EMERGENCY SESSION

Location: Room 1407, Golden Lotus Mansions
Time: when they arrive

AGENDA
  1. Tuna.
  2. The General.
  3. Tuna.

Attire: formal.

— C.` },

  { id: 'd5_doreen', day: 5, at: 600, from: 'Doreen Pratt', addr: 'd.pratt@lifeline24.com', subject: 'Employee of the Month?!', body:
`Sunny,

Against my better judgement, your average rating this week makes you Employee of the Month. You get a mug. The mug says "We Answer Everything". Please answer the mug.

Also there are tanks on the news outside a building that looks like yours. I'm sure it's fine. Clock in.

Proud of you (corporately),
D.` },
];
