// The twelve signs, in words, for the natal reading (src/astro/reading.js). Written for self-reflection, not
// prediction: tendencies, gifts and growth edges, in a warm and specific voice. Indexed by sign name.
//   STYLE      how a sign colours whatever it touches, as an adverbial phrase ("slowly, with an eye for quality")
//   KEYWORDS   three words for a chip
//   SUN        [core portrait, gifts and growth edge]: the Sun, who you are becoming
//   MOON       [inner weather, what you need]: the Moon, how you feel and refuel
//   RISING     [first impression, how you start things]: the Ascendant, how you meet the world

export const STYLE = {
  Aries: "head-first, with a spark of impatience",
  Taurus: "slowly and steadily, with an eye for what lasts",
  Gemini: "curiously, with several tabs open at once",
  Cancer: "protectively, with your feelings close to the surface",
  Leo: "wholeheartedly, with a flair for being seen",
  Virgo: "carefully, with an eye for what could work better",
  Libra: "diplomatically, with a feel for balance and beauty",
  Scorpio: "intensely, all in or not at all",
  Sagittarius: "optimistically, always looking past the horizon",
  Capricorn: "strategically, playing the long game",
  Aquarius: "independently, on your own terms",
  Pisces: "intuitively, soaking up the mood of the room",
};

export const KEYWORDS = {
  Aries: ["brave", "direct", "restless"], Taurus: ["steady", "sensual", "loyal"], Gemini: ["curious", "quick", "social"],
  Cancer: ["caring", "protective", "tender"], Leo: ["warm", "expressive", "proud"], Virgo: ["precise", "helpful", "thoughtful"],
  Libra: ["fair", "charming", "relational"], Scorpio: ["deep", "loyal", "private"], Sagittarius: ["free", "honest", "adventurous"],
  Capricorn: ["ambitious", "patient", "dry-witted"], Aquarius: ["original", "principled", "independent"], Pisces: ["dreamy", "empathic", "imaginative"],
};

export const SUN = {
  Aries: [
    "An Aries Sun is the friend who says “let's just try it” while everyone else is still reading the reviews. You come alive at the start of things: a new job, a new city, a problem no one has cracked yet. Your energy is honest and direct; people always know where they stand with you, and that is rarer than it sounds.",
    "Your gift is courage that doesn't need permission. The growth edge is follow-through and patience with slower people, yourself included. When a fire burns out you tend to look for the next one; learning to tend the fire you already lit is where your biggest wins hide.",
  ],
  Taurus: [
    "A Taurus Sun builds a life the way a good gardener builds soil: slowly, on purpose, with a deep trust that what's real takes time. You notice texture, taste and quality, and you'd rather own one great thing than five okay ones. Your calm is not passivity. It's a decision.",
    "Your gift is staying power: you finish things, you keep friends for decades, and your word holds. The growth edge is change you didn't choose. When life moves the furniture, the stubborn part of you digs in; the wise part asks what new ground is worth planting.",
  ],
  Gemini: [
    "A Gemini Sun runs on curiosity. You collect people, facts, podcasts and inside jokes, and you're at your best when you get to connect them out loud. You can talk to almost anyone, and you genuinely want to know how they see things. Boredom is the only thing that really scares you.",
    "Your gift is a nimble mind that makes ideas travel. The growth edge is depth: staying with one thing past the fun first chapter, and noticing what you feel underneath what you think. Your restlessness is a compass, not a flaw, once you learn which direction it points.",
  ],
  Cancer: [
    "A Cancer Sun leads with care. You remember birthdays, notice who went quiet in the group chat, and make any space feel more like home. Your shell is real, and so is the softness inside it: you protect what you love fiercely, and you love more than you let on.",
    "Your gift is emotional intelligence, the kind that keeps families and teams together. The growth edge is letting yourself be looked after too, and not mistaking an old hurt for a present danger. Your moods move like tides; riding them beats fighting them.",
  ],
  Leo: [
    "A Leo Sun is warm on purpose. You want your life to mean something and to look like you, and you light up any room once you decide you're glad to be there. Under the confidence is a big, generous heart that wants everyone around you to shine too.",
    "Your gift is making people feel seen, because you know how much it matters. The growth edge is pride: needing applause to know you're good, or taking a quiet season as rejection. The stage you're looking for is often already in your hands, in the people you light up.",
  ],
  Virgo: [
    "A Virgo Sun sees the detail everyone else missed and quietly fixes it. You're happiest when you're useful, when a system works and a plan makes sense. You care through competence: the spreadsheet, the soup, the perfectly timed text that says “I checked, you're fine.”",
    "Your gift is craft, the patience to make things genuinely good. The growth edge is the inner critic, which can be louder than any boss. You don't have to earn rest by being perfect; “good enough and done” is sometimes the most skillful choice.",
  ],
  Libra: [
    "A Libra Sun lives in relationship. You think best in conversation, you feel what's unfair before you can explain it, and you have a gift for making things, and people, fit together beautifully. Harmony isn't just a preference for you; it's a value.",
    "Your gift is diplomacy with taste: you can hold two sides and find the third way. The growth edge is choosing yourself, out loud, even when someone might be disappointed. Peace that costs you your own voice isn't really peace, and you deserve both.",
  ],
  Scorpio: [
    "A Scorpio Sun goes deep or doesn't go. You read subtext the way other people read headlines, you keep your circle small and your loyalty long, and you're not afraid of the hard conversations most people avoid. Intensity is your native language.",
    "Your gift is transformation: you can walk through a crisis and come out with something real. The growth edge is trust, letting people in before you've tested them, and letting go of control when it's no longer protecting you. You don't need armor with everyone.",
  ],
  Sagittarius: [
    "A Sagittarius Sun needs room: room to roam, to ask the big questions, to say the honest thing and laugh about it. You're a natural optimist and a natural teacher, and you'd rather risk a wild story than settle for a safe, small life.",
    "Your gift is perspective; you remind people that the world is bigger than their worries. The growth edge is follow-through and tact: freedom is sweetest when it isn't an escape hatch, and the truth lands best when it's delivered with care.",
  ],
  Capricorn: [
    "A Capricorn Sun plays the long game. You're the one with the five-year plan, the dry joke in the meeting, and the quiet determination to build something that outlasts you. You may have grown up fast; you tend to get younger, and lighter, with age.",
    "Your gift is mastery: you climb, step by patient step, and people trust you with real responsibility. The growth edge is rest and softness. Your worth isn't your output, and the people who love you would rather have you present than impressive.",
  ],
  Aquarius: [
    "An Aquarius Sun thinks in systems and futures. You're friendly with everyone and a little hard to know, loyal to your principles and to the people who let you be weird. You often see what's coming before it arrives, and you're not afraid to be early.",
    "Your gift is originality in service of something bigger than yourself. The growth edge is closeness: letting feelings be messy and unoptimized, and letting someone love the person, not just the idea of you. Detachment can be a superpower or a wall; you get to choose.",
  ],
  Pisces: [
    "A Pisces Sun feels everything, often before anyone says a word. You're imaginative, kind to strangers, and at home in music, art, water and daydreams. Boundaries between you and others can blur, which is exactly why people feel understood around you.",
    "Your gift is compassion with a creative streak. The growth edge is boundaries and follow-through: not every feeling in the room is yours to carry, and your dreams get stronger when they have a schedule. Rest and solitude aren't escapes; they're how you refill.",
  ],
};

export const MOON = {
  Aries: [
    "With an Aries Moon your feelings arrive fast and leave fast. You'd rather blow up and make up than simmer for weeks, and you feel most like yourself when you're doing something, not waiting for something.",
    "You refuel through movement, independence and a little friendly competition. You need people who don't take your sparks personally, and you do well to name the hurt underneath the anger before you act on it.",
  ],
  Taurus: [
    "A Taurus Moon is one of the steadiest inner climates in the zodiac. You find comfort in routines, good food, soft fabrics and familiar faces, and you can be the calm center when everyone else is spinning.",
    "You refuel through your senses: a long walk, a home-cooked meal, time with no deadline. Sudden change unsettles you more than you show, so give yourself time to adjust, and let others know you need it.",
  ],
  Gemini: [
    "A Gemini Moon processes feelings by talking, texting and thinking them through. You feel better once you've found the words, and you can hold several moods at once, often with a joke on top.",
    "You refuel through conversation, variety and new input. You need people who are genuinely interesting to you; the growth edge is noticing when you're explaining a feeling instead of letting yourself feel it.",
  ],
  Cancer: [
    "The Moon is at home in Cancer, so your emotional life runs deep and rich. You're nostalgic, protective and intuitive, and home, whatever that means for you, is where your nervous system finally exhales.",
    "You refuel through closeness, family (chosen or given) and a space that's truly yours. Your sensitivity is a strength; just keep checking that you're nurturing people, not managing them.",
  ],
  Leo: [
    "A Leo Moon needs to feel appreciated, and gives appreciation generously. Your feelings are big, warm and visible, and you love to make the people around you feel special.",
    "You refuel through play, creativity and being genuinely celebrated. The growth edge is not treating a lack of attention as a lack of love; sometimes people are just busy, and you're still enough.",
  ],
  Virgo: [
    "A Virgo Moon calms down by making order. When you're anxious you clean, plan, research or help, and you show love through small, practical acts that people don't always notice.",
    "You refuel through useful routines, good health habits and quiet competence. Your inner critic is the thing to watch: be as gentle with your own feelings as you are with everyone else's problems.",
  ],
  Libra: [
    "A Libra Moon feels best in harmony. You're tuned to the emotional balance of every room, and you'll often adjust yourself to keep things smooth.",
    "You refuel through beauty, good company and fair, easy relationships. The growth edge is noticing your own needs before you've checked everyone else's; conflict handled kindly can bring you closer, not apart.",
  ],
  Scorpio: [
    "A Scorpio Moon feels in deep water. You don't do shallow, you remember everything, and your trust, once given, is total. You can sit with darkness most people would run from.",
    "You refuel through privacy, honesty and a few relationships that can hold your intensity. The growth edge is letting go: of grudges, of control, of the need to see every betrayal coming.",
  ],
  Sagittarius: [
    "A Sagittarius Moon stays buoyant. You bounce back with a joke and a plan, and you feel most alive when you're learning, traveling or chasing something meaningful.",
    "You refuel through freedom, open skies and big conversations. You need room to roam; the growth edge is staying put long enough to feel the hard feelings instead of outrunning them.",
  ],
  Capricorn: [
    "A Capricorn Moon keeps feelings under careful management. You're the steady one in a crisis, and you often learned early to rely on yourself.",
    "You refuel through accomplishment, structure and people who are as reliable as you are. The growth edge is letting yourself be held: needing support isn't failing, and your softness is safe with the right people.",
  ],
  Aquarius: [
    "An Aquarius Moon processes feelings from a little distance, thinking them through before showing them. You care deeply about people in general and need plenty of space in particular.",
    "You refuel through friends, causes and time to be fully, unapologetically yourself. The growth edge is letting someone close enough to see your feelings in real time, not only once you've analyzed them.",
  ],
  Pisces: [
    "A Pisces Moon is an emotional sponge. You pick up moods, music and other people's pain, and your imagination is a safe place you can always swim back to.",
    "You refuel through solitude, art, water and quiet compassion. Boundaries are your best friend: they don't make you less kind, they make your kindness sustainable.",
  ],
};

export const RISING = {
  Aries: [
    "With Aries rising you come across as direct, quick and ready. People read you as someone who gets things moving, and you often walk into rooms like you've got somewhere to be.",
    "You start things by jumping in. Your body likes action and may run hot; the lesson of this rising sign is that you don't have to fight every first impression, including your own.",
  ],
  Taurus: [
    "With Taurus rising you give off calm, grounded, “I've got this” energy. People find you easy to be around and hard to rush.",
    "You start things slowly and finish them. Comfort, beauty and a body that's well looked after matter to how you show up; the lesson is to move when it's time, even if it feels early.",
  ],
  Gemini: [
    "With Gemini rising you come across as bright, chatty and quick. You're curious about everyone you meet, and people often think you're younger than you are.",
    "You start things by asking questions and trying a little of everything. The lesson of this rising sign is to let your attention land and stay where it matters.",
  ],
  Cancer: [
    "With Cancer rising you come across as warm, a little reserved, and safe to talk to. Strangers tell you their life stories, and you remember them.",
    "You start things carefully, testing whether a place feels safe before you settle in. The lesson is that your sensitivity is armor and antenna at once; use both on purpose.",
  ],
  Leo: [
    "With Leo rising you have presence. Even when you're quiet people notice you, and your warmth, style and confidence tend to set the tone.",
    "You start things with heart and a bit of flair. The lesson of this rising sign is to lead from genuine joy, not from a need to be seen, and to let others take the spotlight too.",
  ],
  Virgo: [
    "With Virgo rising you come across as thoughtful, capable and a little modest. People trust you with the details, and you tend to notice what needs doing the moment you walk in.",
    "You start things by making a plan and checking it twice. The lesson is to let yourself be seen before everything is perfect; your helpfulness is lovely, not your whole worth.",
  ],
  Libra: [
    "With Libra rising you come across as charming, easy and well put together. People feel at ease around you, and you have a natural sense of style and timing.",
    "You start things by finding a partner, a team or a consensus. The lesson of this rising sign is to know your own mind as well as you know everyone else's.",
  ],
  Scorpio: [
    "With Scorpio rising you come across as magnetic, private and hard to read. People sense depth before you say much, and you size up a room in seconds.",
    "You start things cautiously and commit fully. The lesson is that not everyone is a threat; letting people see a little of you early can save you a lot of guarding later.",
  ],
  Sagittarius: [
    "With Sagittarius rising you come across as friendly, open and up for anything. People see an adventurer, a joker and someone who tells it straight.",
    "You start things with optimism and a big-picture view. The lesson of this rising sign is to check the small print, and to keep a promise even when a better adventure comes along.",
  ],
  Capricorn: [
    "With Capricorn rising you come across as composed, competent and older than your years, at least at first. People trust you to be in charge.",
    "You start things with a plan and a backup plan. The lesson is to let people see the warmth and the humor under the professionalism; they're your best features.",
  ],
  Aquarius: [
    "With Aquarius rising you come across as friendly, original and a little unexpected. People can't quite put you in a box, and you prefer it that way.",
    "You start things your own way, often ahead of the curve. The lesson of this rising sign is that belonging and independence aren't opposites; you can have your people and your freedom.",
  ],
  Pisces: [
    "With Pisces rising you come across as gentle, dreamy and easy to confide in. You adapt to whoever you're with, and people feel understood by you without knowing why.",
    "You start things by feeling your way in. The lesson is to keep your own shape: you can be fluid and still have a clear edge where you end and others begin.",
  ],
};
