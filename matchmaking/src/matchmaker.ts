import type { WebSocket } from 'ws';
import { Mutex } from 'async-mutex';
import { HathoraCloud } from '@hathora/cloud-sdk-typescript';
import type { QueuedPlayer, ServerMessage, MatchResult } from './types.js';

function createHathoraClient() {
  const appId = process.env.HATHORA_APP_ID;
  const devToken = process.env.HATHORA_TOKEN;

  if (!appId || !devToken) {
    throw new Error('HATHORA_APP_ID and HATHORA_TOKEN must be set');
  }

  return new HathoraCloud({ appId, hathoraDevToken: devToken });
}

export class Matchmaker {
  private queue: Map<string, QueuedPlayer> = new Map();
  private mutex = new Mutex();
  private readonly hathoraClient: HathoraCloud;
  private readonly playersPerMatch: number;
  private retryScheduled: boolean = false;
  private readonly retryDelayMs: number = 3000; // Wait 3s before retrying after rate limit

  constructor(options?: { playersPerMatch?: number; retryDelayMs?: number }) {
    this.hathoraClient = createHathoraClient();
    this.playersPerMatch = options?.playersPerMatch ?? 2;
    this.retryDelayMs = options?.retryDelayMs ?? 3000;
  }

  start() {
    console.log('🎮 Matchmaker started');
    console.log(`   Players per match: ${this.playersPerMatch}`);
  }

  stop() {
    console.log('🛑 Matchmaker stopped');
  }

  async addPlayer(player: QueuedPlayer): Promise<void> {
    const shouldTryMatch = await this.mutex.runExclusive(() => {
      this.queue.set(player.id, player);
      console.log(`Player "${player.name}" (${player.id}) joined queue`);
      console.log(this.queue);
      return this.queue.size >= this.playersPerMatch;
    });

    if (shouldTryMatch) {
      this.tryMatch();
    }
  }

  async removePlayer(playerId: string): Promise<boolean> {
    return this.mutex.runExclusive(() => {
      const player = this.queue.get(playerId);
      if (player) {
        this.queue.delete(playerId);
        console.log(`Player "${player.name}" (${playerId}) left queue`);
        return true;
      }
      return false;
    });
  }

  async removePlayerBySocket(socket: WebSocket): Promise<boolean> {
    return this.mutex.runExclusive(() => {
      for (const [id, player] of this.queue) {
        if (player.socket === socket) {
          this.queue.delete(id);
          console.log(`Player "${player.name}" (${id}) left queue`);
          return true;
        }
      }
      return false;
    });
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  private scheduleRetry(): void {
    // Prevent multiple concurrent retries
    if (this.retryScheduled) return;
    
    this.retryScheduled = true;
    console.log(`🔄 Scheduling retry in ${this.retryDelayMs}ms (queue size: ${this.queue.size})`);
    
    setTimeout(() => {
      this.retryScheduled = false;
      if (this.queue.size >= this.playersPerMatch) {
        console.log(`🔄 Retrying match for ${this.queue.size} queued players`);
        this.tryMatch();
      }
    }, this.retryDelayMs);
  }

  groupPlayers(): { roomGroups: QueuedPlayer[][], groupedPlayers: QueuedPlayer[] } {
    const roomGroups: QueuedPlayer[][] = [];
    let currentGroup: QueuedPlayer[] = [];
    const playerArray = Array.from(this.queue.values());
    for (let i = 0; i < this.queue.size; i++) {
      const currPlayer = playerArray[i];
      currentGroup.push(currPlayer);
      // push to roomGroups when max Players hit
      if (currentGroup.length === this.playersPerMatch) {
        roomGroups.push(currentGroup);
        currentGroup = [];
      }
    }

    console.log(playerArray);
    console.log(roomGroups);
    // don't include room with one player as a group
    if (currentGroup.length === 1) {
      return {
        roomGroups,
        groupedPlayers: playerArray.slice(0,-1)
      };
    }

    roomGroups.push(currentGroup);
    return {
      roomGroups,
      groupedPlayers: playerArray
    };
  }
  
  

  
  private async tryMatch() {
    // Short lock: Get room groups, matched players, and remove them from queue
    const result = await this.mutex.runExclusive(() => {
      if (this.queue.size < this.playersPerMatch) {
        return null;
      }

      const { roomGroups, groupedPlayers } = this.groupPlayers();

      // Remove them from queue immediately to prevent double-matching
      for (const player of groupedPlayers) {
        this.queue.delete(player.id);
      }

      return { roomGroups, groupedPlayers };
    });

    if (!result) {
      console.log("Failed to group players")
      return;
    }

    const { roomGroups, groupedPlayers } = result;
    if (!groupedPlayers) {
      return;
    }
    console.log(`🎯 Matching ${groupedPlayers.length} players:`, groupedPlayers.map((p) => p.name).join(', '));
    // No lock: create rooms in parallel (this can take several seconds)

    try {
      // Create Hathora rooms for all groups in parallel
      const matchResults = await Promise.allSettled(
        roomGroups.map((roomGroup) => this.createHathoraRoom(roomGroup))
      );

      // Notify all matched players in each group
      for (let i = 0; i < roomGroups.length; i++) {
        const roomGroup = roomGroups[i];
        const matchResult = matchResults[i];

        //if successful Hathora room creation, notify players
        if (matchResult.status === "fulfilled") {
          console.log(`✅ Match created: ${matchResult.value.roomId}`);

          for (const player of roomGroup) {
            this.send(player.socket, {
              type: 'match:found',
              roomId: matchResult.value.roomId,
              connectionUrl: matchResult.value.connectionUrl,
              players: matchResult.value.players,
            });
          }

        }
        // otherwise requeue
        else {
          for (const player of roomGroup){
            if (player.socket.readyState !== player.socket.OPEN) continue;
            this.queue.set(player.id, player);
            this.send(player.socket, {type: 'error', message: 'Failed to create match'})
          }
          // Schedule retry for re-queued players
          this.scheduleRetry();
        }
      }
    } catch (err: any) {
      console.error('❌ Failed to create match:', err?.message);

      // Short lock: put players back in queue on failure
      await this.mutex.runExclusive(() => {
        for (const player of groupedPlayers) {
          this.queue.set(player.id, player);
          this.send(player.socket, {
            type: 'error',
            message: 'Failed to create match, you have been re-queued',
          });
        }
      });
      
      // Schedule retry for re-queued players
      this.scheduleRetry();
    }
  }

  private async createHathoraRoom(players: QueuedPlayer[]): Promise<MatchResult> {
    // Create room using Rooms API (requires dev token)
    const room = await this.hathoraClient.roomsV2.createRoom({
      region: 'Washington_DC',
      roomConfig: JSON.stringify({
        quickMatch: true,
        matchedPlayers: players.map((p) => ({ id: p.id, name: p.name })),
      }),
    });

    const roomId = room.roomId;
    console.log(`🏠 Hathora room created: ${roomId}`);

    // Wait for room to be ready
    let connectionUrl: string | null = null;
    for (let i = 0; i < 15; i++) {
      try {
        const connectionInfo = await this.hathoraClient.roomsV2.getConnectionInfo(roomId);
        if (connectionInfo.status === 'active' && connectionInfo.exposedPort) {
          const { host, port } = connectionInfo.exposedPort;
          connectionUrl = `https://${host}:${port}`;
          break;
        }
      } catch {
        // Room not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (!connectionUrl) {
      throw new Error('Room failed to become ready');
    }

    return {
      roomId,
      connectionUrl,
      players: players.map((p) => ({ id: p.id, name: p.name })),
    };
  }

  private send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}

