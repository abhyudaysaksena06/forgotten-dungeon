import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { EventControl } from './admin/eventControl.js';
import { config } from './config.js';
import { MemoryStore } from './db/memoryStore.js';
import { createDungeonMaster } from './dm/dungeonMaster.js';
import { createApp } from './http.js';
import { RoomManager } from './rooms/roomManager.js';
import { attachSockets } from './sockets.js';
import { loadProfiles } from './quest/profiles.js';
import { questRouter } from './quest/routes.js';
import { QuestRuns } from './quest/runs.js';

const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: config.clientOrigin } });

const manager = new RoomManager({
  store: new MemoryStore(),
  dm: createDungeonMaster(config.dm),
  emit: (code, event, payload) => io.to(`room:${code}`).emit(event, payload),
  seed: config.dungeonSeed,
  voteSeconds: config.voteSeconds,
  actionSeconds: config.actionSeconds,
  npcSeconds: config.npcSeconds,
  speedTargetMinutes: config.speedTargetMinutes,
});
const control = new EventControl({ durationMinutes: config.eventMinutes, broadcast: (event, payload) => io.emit(event, payload) });

const quest = new QuestRuns({ profiles: loadProfiles(config.questTeams), saveDir: config.questSaves });
httpServer.on('request', createApp({ manager, control, config, quest: questRouter(quest), stats: () => ({ sockets: io.engine.clientsCount }) }));
attachSockets(io, { manager, control });

httpServer.listen(config.port, () => {
  console.log(`The Forgotten Dungeon is listening on http://localhost:${config.port}`);
  console.log(`Dungeon Master: ${manager.dm.mode} · seed "${config.dungeonSeed}"`);
  console.log(`Quest teams: ${[...quest.profiles.keys()].join(', ')} · saves in ${config.questSaves}`);
  if (config.adminTokenGenerated) console.log(`Admin token for this run (set ADMIN_TOKEN to fix it): ${config.adminToken}`);
});
