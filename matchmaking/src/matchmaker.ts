import type { WebSocket } from 'ws';
import { Mutex } from 'async-mutex';
import type { QueuedPlayer, ServerMessage, MatchResult } from './types.js';

// Hathora client (lazy loaded)
let hathoraClientPromise: Promise<any> | null = null;

const getHathoraClient = async () => {
  const appId = process.env.HATHORA_APP_ID;
  const devToken = process.env.HATHORA_TOKEN;

  if (!appId || !devToken) {
    throw new Error('2 HATHORA_APP_ID and HATHORA_TOKEN must be set');
  }

  if (!hathoraClientPromise) {
    hathoraClientPromise = import('@hathora/cloud-sdk-typescript').then(
      (module) =>
        new module.HathoraCloud({
          appId,
          hathoraDevToken: devToken,
        })
    );
  }
  return hathoraClientPromise;
};

export class Matchmaker {
  private queue: Map<string, QueuedPlayer> = new Map();
  private mutex = new Mutex();
  private matchInterval: NodeJS.Timeout | null = null;
  private readonly playersPerMatch: number;
  private readonly matchCheckIntervalMs: number;
  private readonly region: string;

  constructor(options?: {
    playersPerMatch?: number;
    matchCheckIntervalMs?: number;
    region?: string;
  }) {
    this.playersPerMatch = options?.playersPerMatch ?? 2;
    this.matchCheckIntervalMs = options?.matchCheckIntervalMs ?? 500;
    this.region = options?.region ?? 'Seattle';
  }

  start() {
    console.log('🎮 Matchmaker started');
    console.log(`   Players per match: ${this.playersPerMatch}`);
    console.log(`   Check interval: ${this.matchCheckIntervalMs}ms`);
    console.log(`   Region: ${this.region}`);

    this.matchInterval = setInterval(() => {
      this.tryMatch();
    }, this.matchCheckIntervalMs);
  }

  stop() {
    if (this.matchInterval) {
      clearInterval(this.matchInterval);
      this.matchInterval = null;
    }
    console.log('🛑 Matchmaker stopped');
  }

  async addPlayer(player: QueuedPlayer): Promise<number> {
    return this.mutex.runExclusive(() => {
      this.queue.set(player.id, player);
      const position = this.getQueuePosition(player.id);
      console.log(`➕ Player "${player.name}" (${player.id}) joined queue at position ${position}`);
      this.broadcastQueuePositions();
      return position;
    });
  }

  async removePlayer(playerId: string): Promise<boolean> {
    return this.mutex.runExclusive(() => {
      const player = this.queue.get(playerId);
      if (player) {
        this.queue.delete(playerId);
        console.log(`➖ Player "${player.name}" (${playerId}) left queue`);
        this.broadcastQueuePositions();
        return true;
      }
      return false;
    });
  }

  getQueuePosition(playerId: string): number {
    const players = Array.from(this.queue.keys());
    return players.indexOf(playerId) + 1;
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  private broadcastQueuePositions() {
    let position = 1;
    for (const [, player] of this.queue) {
      this.send(player.socket, { type: 'queue:position', position });
      position++;
    }
  }

  private async tryMatch() {
    await this.mutex.runExclusive(async () => {
      if (this.queue.size < this.playersPerMatch) {
        return;
      }

      // Get the first N players from the queue (FIFO)
      const players = Array.from(this.queue.values()).slice(0, this.playersPerMatch);

      // Remove them from queue immediately to prevent double-matching
      for (const player of players) {
        this.queue.delete(player.id);
      }

      console.log(`🎯 Matching ${players.length} players:`, players.map((p) => p.name).join(', '));

      try {
        const result = await this.createHathoraRoom(players);
        
        // Notify all matched players
        for (const player of players) {
          this.send(player.socket, {
            type: 'match:found',
            roomId: result.roomId,
            connectionUrl: result.connectionUrl,
            players: result.players,
          });
        }

        console.log(`✅ Match created: ${result.roomId}`);
      } catch (err: any) {
        console.error('❌ Failed to create match:', err?.message);
        
        // Put players back in queue on failure
        for (const player of players) {
          this.queue.set(player.id, player);
          this.send(player.socket, {
            type: 'error',
            message: 'Failed to create match, you have been re-queued',
          });
        }
        this.broadcastQueuePositions();
      }
    });
  }

  private async createHathoraRoom(players: QueuedPlayer[]): Promise<MatchResult> {
    const client = await getHathoraClient();

    // Create room using Rooms API (requires dev token)
    const room = await client.roomsV2.createRoom({
      region: this.region,
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
        const connectionInfo = await client.roomsV2.getConnectionInfo(roomId);
        if (connectionInfo.status === 'active' && connectionInfo.exposedPort) {
          const { host, port } = connectionInfo.exposedPort;
          connectionUrl = `https://${host}:${port}`;
          break;
        }
      } catch {
        // Room not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
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

