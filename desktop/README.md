# The Forgotten Dungeon — desktop app

The whole game in one program: the game server runs inside the app and a GPU-accelerated window
opens onto it. Nothing goes over the network, so there's no lag from a host, and every machine
renders the game itself.

## Install on the event's computers

- **Windows:** copy `The Forgotten Dungeon 1.0.0.exe` and double-click it (portable: nothing to
  install). Or unzip `The Forgotten Dungeon-1.0.0-win.zip` and run the `.exe` inside.
  Windows SmartScreen may warn about an unknown publisher (the app isn't code-signed): click
  **More info → Run anyway**.
- **Mac:** build with the GitHub Action below and open the `.dmg`; first launch: right-click the app → Open.

Keys: **F11** full screen, **F12** developer tools. Saves live in the user's app-data folder
(Windows: `%APPDATA%\The Forgotten Dungeon\saves`).

## Fixing runes (the event)

The game's server code ships as plain files, not sealed: participants find it next to the app, in
`resources/app/game/server/src` (Windows: inside the unzipped folder; Mac: right-click the app →
Show Package Contents → `Contents/Resources/app/game/server/src`). Fix a rune, then close and
reopen the app.

## Building

```
cd desktop && npm install
npm run win     # Windows .exe + .zip (works from Linux too)
npm run mac     # Mac .dmg (must run on a Mac)
npm run linux   # Linux AppImage
```

Or on GitHub: **Actions → Desktop app → Run workflow**, then download the builds from the run.
