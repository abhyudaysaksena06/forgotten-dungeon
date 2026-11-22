# The Forgotten Dungeon — The Shattered Heart

The Heart of Eternity broke into five pieces, and the kingdom of Eldermoor sank beneath the earth.
Kael goes alone through the dungeon, recovers the fragments, and faces Morvath on the Throne of Eternity.

You are a **Runewright**. The dungeon runs on runes, and some of the runes are written wrong: this
game has bugs. Play it, notice where it misbehaves, find the cause in the code, fix it, and carry on.
You can only finish the quest once every broken rune is restored.

## 1. What you need

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| **Node.js 22 or newer** | Installer from [nodejs.org](https://nodejs.org/en/download) (LTS) | Installer from [nodejs.org](https://nodejs.org/en/download), or `brew install node@22` | [nodejs.org/en/download](https://nodejs.org/en/download) (nvm), or your package manager |
| **Git** (optional, for cloning) | [git-scm.com/download/win](https://git-scm.com/download/win) | `xcode-select --install`, or `brew install git` | `sudo apt install git` (or your package manager) |
| **Browser** | Chrome or Edge, up to date | Chrome or Edge | Chrome or Chromium |

Check your setup in a terminal (PowerShell on Windows, Terminal on macOS/Linux):

```bash
node -v   # must print v22 or higher
npm -v
```

The game is 3D, so use a computer with a graphics card and an up-to-date graphics driver.

## 2. Get the game

**With Git:**

```bash
git clone https://github.com/abhyudaysaksena06/forgotten-dungeon.git
cd forgotten-dungeon
```

**Without Git:** on the repository page click **Code → Download ZIP**, unzip it, and open a
terminal in the unzipped `forgotten-dungeon` folder (the one that has `package.json` in it).

## 3. Install and start

```bash
npm install     # once; takes a minute or two
npm start       # builds the game and starts the server
```

Open **http://localhost:3001** in Chrome or Edge, pick your team and press **Enter the dungeon**.
Stop the game with **Ctrl+C** in the terminal.

### While you fix bugs: use dev mode

```bash
npm run dev
```

Then open **http://localhost:5173** instead. In dev mode, **saving a file restarts the game for
you**: a change in `server/` restarts the server, and a change in `client/` reloads the page. With
`npm start`, stop it (Ctrl+C) and run `npm start` again after every change.

Your run is saved after every move and replayed when the server starts, so restarting never loses
your progress.

### If something goes wrong

| Problem | What to do |
| --- | --- |
| `node` is not recognised, or `node -v` is below 22 | Install Node 22+ (step 1), then **close and reopen** the terminal. |
| `npm install` fails | Make sure you are in the folder that has `package.json`. Delete `node_modules` and run `npm install` again. On a school or office network, try another network. |
| `EADDRINUSE` / port 3001 already in use | Another copy is still running: close it, or start on another port: `PORT=3002 npm start` (PowerShell: `$env:PORT=3002; npm start`) and open that port. |
| Port 5173 in use (dev mode) | Close the other dev server; Vite prints the URL it actually uses. |
| The page is blank, or the 3D view is black | Use Chrome or Edge, turn on **Settings → System → Use graphics acceleration**, update your graphics driver and reload. Open the browser console (**F12**) to see errors. |
| The game is very slow | It is drawing without the graphics card: see the row above. Close other heavy tabs. |
| The start screen shows an error from the game server | That is the game talking to you. Read it carefully. |

## 4. How to play

### The goal

Recover the Heart fragments from the four rooms of the dungeon, then defeat Morvath, the Shadow
Dragon, on the **Throne of Eternity**. The Throne stays **sealed until every broken rune is
restored**, so finishing the game means fixing the code.

### What the game tells you

- **The Rune Ledger** (top of the map panel) counts the runes still broken: *in the rules* (checked
  by the server each time it starts) and *in the world* (checked by the browser each time the game
  loads). It never says which ones. Restart the game after a fix to see the count change.
- **The choice pop-up.** After a judged choice (a route, a rest, the altar, a potion, a skipped
  heal…) Seraphine the Oracle shows **✔ Right choice** or **✘ Wrong choice**, with how sure she is
  and your tally for the session.
- Read everything the game shows you: the chronicle, the banners, the numbers on Kael's card and in
  the top bar, and the browser console. When what the game *says* and what it *does* disagree, look
  closer.

### Your hero

You play **Kael, the Knight**, alone.

| | |
| --- | --- |
| **Iron Sword** | Its sharpness adds to every blow and dulls with each blow that lands; its durability wears too, and a broken sword hits for half. |
| **Shield** | Takes every blow before your health does. |
| **Bulwark** (E in a fight) | You take half damage this round. |
| **Rune Strike** (Q) | A sure blow, and the only thing that breaks Morvath's shadow armour. |

### The cage

Every room keeps a cage at its side with two cells: a **Healer** and a **Weaponsmith**. The cage is
locked while the room's skeletons stand, and it stays locked while that round still has a broken
rune in your code (the HUD's "The cage" section says how many). Clear the room and fix the round's
runes, restart the server, and it opens: walk up to a cell's door and press **E**. The Healer restores your health and shield; the Weaponsmith restores your sword's
sharpness and durability. It's free, and it opens again whenever you come back to a cleared room.

### The dungeon

- Five rounds, one room each: the Gate Courtyard, the Hall of Portraits, the Hall of Trials, the
  Hollow Barracks, and the Throne of Eternity.
- Rooms 1–4 can be taken in any order. Each holds six skeletons (in the Hall of Trials, the Hell
  Nemesis steps out once they are down) and gives a
  **Heart fragment**, gold, potions and XP. Higher rooms are harder, and every room grows harder as
  your quest goes on.
- The **Throne** opens with three fragments. Six skeleton guards stand before Morvath, and his fight
  changes as he weakens.
- Each corridor costs one **torch**. When the torches run out, the quest is over.
- At the camp you can **rest** (health and shield, 1 torch), use the **Rune Altar**, or use the **Forge**.
  Pip the goblin cook sells potions, and turns 3 monster parts into a Monster Meal.
- Clearing a room opens a waystone back to the camp.
- King Aldric and Pip hand out **quests**. The tracker on the left shows what's next; press **J** for
  the full quest log.

**Your choices are judged.** Your team's starting stats are different from every other team's.
Whether to prepare first, take an easy room, or risk a harder one depends on your stats, and every
readiness choice you make is scored against them.

### Controls

In a fight you walk around the room:

| Key | Does |
| --- | --- |
| **W A S D** | Move (relative to the camera) |
| **Space** | Jump |
| Click the view, then move the mouse | Look around (left-click attacks what's in the crosshair). **Esc** gives you the cursor back |
| Mouse drag, **← →**, wheel | Look around, zoom |
| **F**, right-click (or click an enemy) | Attack; **Tab** picks the next target. Middle-click: Rune Strike. Mouse side buttons: skill / defend |
| **E** | In a fight: Bulwark. In a cleared room: use the cage cell you stand at |
| **Q** | Rune Strike |
| **R** | Defend |
| **H** / **G** | Potion / Monster Meal |
| **X** | Retreat (costs a torch) |
| **J** | Quest log |
| Settings (top bar) | Mouse sensitivity |

Attacks need you close enough: melee heroes must walk up to their target, while magic and ranged
heroes can strike from further away. The ring under your target turns green when you're in reach.
Every fight has three lanes. **Red lanes on the floor get hit next round**: walk into another lane before you act (the action bar shows yours). Morvath has tricks worth learning. If you do nothing for a few seconds, the round plays out
without you; the clock pauses while you're in another window.

Your team's profile is in `server/teams/profile.json` and your save is in `server/saves/`.

## 5. Your task

1. Play the game and watch for anything that doesn't behave the way the game says it should.
2. Find the cause in the code (`server/` and `client/`), fix it, and restart (or use `npm run dev`).
3. Check the Rune Ledger and keep going until it reaches 0 and the Throne opens.
4. Report each bug you fixed on the submission portal (see below).

## 6. Rules

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
- **AI:** Gemini is the only AI assistant you may use. No other AI tools.
- **Submitting:** report **each bug separately** on the submission portal,
  **https://abhyudaysaksena06.github.io/OBSCURA_R2-SUBMISSIONS-/**, signed in with your team login.
  Say what went wrong in the game, which file(s) you changed, and what you changed.
