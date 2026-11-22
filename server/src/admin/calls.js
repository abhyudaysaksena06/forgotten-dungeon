// The two client calls released during the round. The participant build ships with the titles
// only; the organiser reads (or plays) the full call at the release time.
export const CLIENT_CALLS = [
  {
    id: 'C1',
    name: 'Client Call 1 — The King Fights Back',
    releaseAt: 30,
    points: 150,
    caller: 'Odette Vane, producer at Hollowbell Studio (the client)',
    transcript: [
      'Hi, it’s Odette from Hollowbell. Quick one, I’m between meetings.',
      'Our playtesters reached the Throne and said the Forgotten King is a sack of hit points: he just swings like a skeleton. That is not the boss we pitched.',
      'Every round he has to announce his next move before the party acts, so players can plan. Crown Strike: 35 damage to one named hero. Grave Wail: 12 to everyone, and it poisons. Defend and Shield Wall halve it like any other hit.',
      'He needs phases. Below two thirds of his HP he summons two skeletal thralls, once. Below one third he enrages, plus five damage on everything, once.',
      'Players need to see it: a proper HP bar for the King, the telegraphed move with its target and damage, and they must be able to target the thralls or the King.',
      'And please, all of the damage is worked out on the server, and his HP never goes below zero. Last build showed minus forty and the testers screenshotted it.',
      'That’s it. Ship it before the next call, thanks!',
    ],
    acceptance: [
      'The state sent to the browser has a `boss` object with the King’s next move: name, damage, target, poison.',
      'A new move is telegraphed at the start of every combat round and carried out in that round’s enemy phase.',
      'Crown Strike deals 35 to its target, Grave Wail deals 12 to all and poisons, and Defend and Shield Wall halve both.',
      'Thralls are summoned once below 66% HP, and the enrage (+5) triggers once below 33%.',
      'There is a King HP bar and a telegraph panel, and the thralls can be targeted.',
      'The King’s HP is never negative, and a client-sent damage value is ignored.',
    ],
  },
  {
    id: 'C2',
    name: 'Client Call 2 — Private Orders',
    releaseAt: 60,
    points: 150,
    caller: 'Odette Vane again, now with the community manager on speaker',
    transcript: [
      'Odette again. Good news: the King works, and the streamers love it. Bad news: the streamers.',
      'Our players want to command their companions privately. A streamer typed their plan in chat, and the whole audience and the AI narrator saw it. Spectators then spoiled every fight.',
      'So, a whisper. In chat, `/whisper Quill defend` or `/w Maren support` goes to that companion only. The companion answers privately too, for example “I will keep my guard up.”',
      'Orders are attack, defend, support, or free (back to their own judgement). They stand until changed, starting from the next round.',
      'The important part: a whisper is visible only to the hero and the companion. It never appears in the public chronicle, never reaches spectators, and is never sent to the AI Dungeon Master’s context. Legal was very clear about that.',
      'Unknown names get a clear error. Gibberish orders get a polite “I did not catch that” from the companion. Thanks, team!',
    ],
    acceptance: [
      '`/whisper <Name> <text>` and `/w <Name> <text>` reach only the sender’s and the recipient’s sockets.',
      'A companion replies with a private whisper and keeps a standing order: attack, defend, support or free.',
      'From the next round, the ordered companion acts accordingly (e.g. “defend” means it defends).',
      'Whisper text never appears in the public log, the public state, spectator sockets or the Dungeon Master’s context.',
      'Whispering to an unknown name is refused with a clear error.',
    ],
  },
];
