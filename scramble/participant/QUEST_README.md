# The Forgotten Dungeon — The Shattered Heart

The Heart of Eternity broke into five pieces, and the kingdom of Eldermoor sank beneath the earth.
Lead four heroes through the dungeon, recover the fragments, and face Morvath on the Throne of Eternity.

You are a **Runewright**. The dungeon runs on runes, and the runes are written wrong: bugs are
hidden in this game, and some of them make the quest impossible to finish. Find them while you play,
fix the code, restart, and carry on. Your progress is saved after every move.

## Your party

Pick one hero to **lead** at the start. You control the leader; the other three are AI companions.

| Hero | Role | Skill |
| --- | --- | --- |
| Kael, the Knight | Defence | Bulwark: the party takes half damage this round. |
| Lyra, the Mage | Healer, magic | Mend: heal an ally, or revive the Fallen. |
| Rook, the Rogue | Striker | Twin Strike: a sure double-damage blow. |
| Mira, the Ranger | Long range | Volley: hits every enemy, flyers included. |

The leader also has **Rune Strike**. Only the leader's Rune Strike can break Morvath's shadow armour,
so keep your leader alive. Melee can't reach flying enemies; magic and ranged can.

## The dungeon

- Five rounds, one room each: the Gate Courtyard, the Hall of Portraits, the Hall of Trials, the
  Hollow Barracks, and the Throne of Eternity.
- Rooms 1–4 can be taken in any order. Each holds six skeletons and gives a
  **Heart fragment**, gold, potions and XP. Higher rooms are harder, and every room grows harder as
  your quest goes on.
- The **Throne** opens with three fragments. Six skeleton guards stand before Morvath, and his fight
  changes as he weakens.
- Each corridor costs one **torch**. When the torches run out, the quest is over.
- At the camp you can **rest** (heal and revive, 1 torch), use the **Rune Altar**, or use the **Forge**.
  Pip the goblin cook sells potions, and turns 3 monster parts into a Monster Meal.
- Clearing a room opens a waystone back to the camp.
- The people you meet hand out **quests**. The tracker on the left shows what's next; press **J** for
  the full quest log.

**Your choices are judged.** Your team's starting stats are different from every other team's.
Whether to prepare first, take an easy room, or risk a harder one depends on your stats, and every
readiness choice you make is scored against them.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

In a fight you walk around the room:

| Key | Does |
| --- | --- |
| **W A S D** | Move (relative to the camera) |
| **Space** | Jump |
| Click the view, then move the mouse | Look around (left-click attacks what's in the crosshair). **Esc** gives you the cursor back |
| Mouse drag, **← →**, wheel | Look around, zoom |
| **F**, right-click (or click an enemy) | Attack; **Tab** picks the next target. Middle-click: Rune Strike. Mouse side buttons: skill / defend |
| **E** | Your leader's skill |
| **Q** | Rune Strike |
| **R** | Defend |
| **H** / **G** | Potion / Monster Meal |
| **X** | Retreat (costs a torch) |
| **J** | Quest log |
| Settings (top bar) | Mouse sensitivity |

Attacks need you close enough: melee heroes must walk up to their target, while magic and ranged
heroes can strike from further away. The ring under your target turns green when you're in reach.
Every fight has three lanes. **Red lanes on the floor get hit next round**: walk into another lane before you act (the action bar shows yours). Each boss has a trick worth learning. Your companions move and fight on their own. If you do nothing for a few seconds, the round plays out
without you; the clock pauses while you're in another window.

Your team's profile is in `server/teams/profile.json` and your save is in `server/saves/`.

## Rules

- **Fix bugs, not numbers.** Your score is rebuilt by replaying your inputs on the official game
  with your official stats. Edited stats, torches, saves or "fixes" that change the real rules
  only break your own run.
- **Saves replay through your code.** After you fix a bug and restart, your saved moves are replayed
  under the fixed rules; any move that no longer fits is dropped from there on. Fix early.
- **Write tests.** `server/test/` is yours. Hidden tests decide which bugs you fixed; your own tests
  earn the testing score. The judge runs your `server/test` suite on the original game with each of
  your bugs put back one at a time: a test that passes on the original and fails with the bug has
  caught it. Test the game's behaviour through its existing functions. A test that needs your own
  new helpers can't run on the original, so it doesn't count.
- Breaking something that worked costs marks.
- Stuck? Hints cost CTF tokens and come one level at a time: what's wrong, then where, then the
  direction of the fix.
