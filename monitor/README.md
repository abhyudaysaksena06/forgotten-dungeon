# Event monitor: Gemini only

Gemini is the only AI tool allowed during the round. This folder gives organisers three things:

| Part | What it does | Who runs it |
|---|---|---|
| `network/` | A blocklist of other AI services for the venue Wi-Fi, a router/DNS converter and a Chrome policy. This is the part that actually **blocks**. | Organisers, before the event |
| `agent.mjs` | Every 30 s, reports which known AI apps are running, which AI editor extensions are installed, the team's git activity, network connections and a fingerprint of its own code. | Every team, on every laptop |
| `dashboard.mjs` | Collects the reports and shows a live card per team: Gemini only / check / other AI running / not connected, plus a timeline. | Organisers, on one laptop |

The agent and dashboard need only Node 22, nothing to install. They ship inside every team build.

## Before the event

1. **Block other AI on the network.** Load the blocklist into the venue router or DNS:

   ```bash
   node monitor/network/make-blocklists.mjs dnsmasq > ai-block.conf   # OpenWrt / Pi-hole / dnsmasq
   node monitor/network/make-blocklists.mjs adguard > ai-block.txt    # AdGuard Home
   node monitor/network/make-blocklists.mjs chrome  > ai-block.json   # managed Chrome on lab PCs
   ```

   Then check from a laptop on the Wi-Fi that chatgpt.com and claude.ai fail and gemini.google.com works.
   Edit `network/blocklist.txt` to add or remove services. Never add google.com or googleapis.com, because Gemini runs on them.

2. **Tell students up front.** Put this in the briefing and the rules sheet:

   > Gemini is the only AI tool allowed. During the round, each laptop runs our event monitor
   > (`npm run monitor`). It tells the organisers which known AI apps are running, which AI extensions
   > your editors have, your game folder's git activity (commit messages, changed file names and line
   > counts), your computer's name and network connections. It does not record keystrokes, your screen,
   > clipboard, browsing history, file contents or passwords. You can read exactly what it sends with
   > `npm run monitor -- --dry-run`. If the monitor stops, your team shows as offline.

3. **Edit the rules if needed.** `rules.mjs` lists the AI apps and extensions the agent looks for. Change it **before** you build the team packages: the dashboard checks that every team's agent matches the organiser copy exactly.

## On the day

On the organiser laptop, connected to the venue Wi-Fi:

```bash
npm run monitor:dashboard -- --teams 12 --venue 192.168.10.
```

`--venue` is the start of the venue Wi-Fi addresses (the dashboard prints a suggestion). It prints:

- the **event key** to write on the board,
- the exact command teams run,
- the **dashboard link** with a view key. Keep that link for organisers only.

Each team, on each laptop, from their game folder:

```bash
npm run monitor -- --server http://<organiser-ip>:4545 --team team03 --key <event key>
```

They read the notice, type `yes`, and leave the window open.

Reports are saved to `monitor-data/beats.jsonl` (git-ignored). Restarting the dashboard replays them, so nothing is lost.

## What the dashboard flags

| Flag | Meaning |
|---|---|
| **Other AI running** (red) | A non-Gemini AI app or CLI is running now, found by name or by install path, so renamed apps are caught too. Also red: the team's agent code differs from the organiser copy. |
| **Check** (amber) | A laptop went offline (monitor stopped, paused or lost network), an AI extension or AI editor is installed, or the laptop is on a second network or off the venue Wi-Fi (possible hotspot). |
| Seen during the round | Every non-Gemini tool that was ever running, even if it was closed later. |
| Big changes or pastes | A commit adding 150+ lines, or 150+ uncommitted lines appearing within one 30 s report. Check these by hand: a large honest fix is possible. |
| Timeline | Starts, restarts, offline gaps, tools opened and closed, every commit with its size. |

## Loopholes that remain

No tool on a student's own laptop can prove "Gemini only". Treat flags as reasons to walk over and look, not as proof.

- **A second device.** A phone or another laptop can show ChatGPT and the student types the answer. Only room supervision catches this. The paste detector catches large blocks typed or pasted at once.
- **Websites in the browser.** The agent does not read browser tabs (by design). The network blocklist covers this on venue Wi-Fi, and the hotspot flag shows laptops on a second network. A VPN, or a service missing from the blocklist, gets around it. Add services you notice to `blocklist.txt`.
- **A modified or fake agent.** A team can edit the agent, or send fake reports with the event key. The fingerprint check catches an edited agent, but a determined student can fake the fingerprint too. Keep the event key off public screens and rotate it if it leaks.
- **Renamed apps copied elsewhere.** An AI app copied to a new folder under a new name is not caught by name or path.
- **Unknown tools.** Only the apps and extensions in `rules.mjs` are detected. New AI tools appear often, so review the list before each event.
- **Virtual machines and remote desktops.** An AI tool running inside a VM, or on another computer through remote desktop, is invisible to the agent.
- **AI features built into allowed software.** Some editors and browsers ship AI features without an extension (for example, chat built into a browser). The agent does not detect these.
- **Small edits.** Code from a forbidden AI that is typed in slowly looks like normal work.

For lab PCs you control, the managed Chrome policy plus a locked-down user account closes most of these. For students' own laptops, combine the network block, this dashboard and supervisors walking the room.

## Files

- `rules.mjs`: the AI apps and extensions to look for, and which are allowed.
- `agent.mjs`: the team-side reporter. `--dry-run` prints one report without sending it.
- `state.mjs`: how reports become flags and the timeline.
- `dashboard.mjs`: the organiser server and page.
- `network/`: the blocklist and converter.
- `test/`: run with `npm run test:monitor`.
