import { IS_HATHORA } from '../config.js';

// Lobby state that we sync to Hathora for matchmaking
export interface LobbyState {
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  playerCount: number;
  maxPlayers: number;
}

// Lazily import Hathora SDK to avoid issues when not in Hathora env
let hathoraClientPromise: Promise<any> | null = null;

const getHathoraClient = async () => {
  if (!IS_HATHORA) return null;
  
  const appId = process.env.HATHORA_APP_ID;
  const devToken = process.env.HATHORA_DEV_TOKEN;
  
  if (!appId || !devToken) {
    console.warn('⚠️ HATHORA_APP_ID or HATHORA_DEV_TOKEN not set, lobby state updates disabled');
    return null;
  }
  
  if (!hathoraClientPromise) {
    hathoraClientPromise = import('@hathora/cloud-sdk-typescript').then(
      (module) => new module.HathoraCloud({ 
        appId,
        hathoraDevToken: devToken,
      })
    );
  }
  return hathoraClientPromise;
};

/**
 * Update the lobby state in Hathora so clients can filter lobbies by status.
 * This is called whenever the game state changes.
 */
export async function updateLobbyState(roomId: string, state: LobbyState): Promise<void> {
  console.log(`🔍 updateLobbyState called: roomId=${roomId}, IS_HATHORA=${IS_HATHORA}`);
  
  if (!IS_HATHORA) {
    console.log(`⏭️ Skipping lobby state update (not in Hathora environment)`);
    return;
  }
  
  try {
    console.log(`🔑 Getting Hathora client... APP_ID=${process.env.HATHORA_APP_ID ? 'set' : 'NOT SET'}, DEV_TOKEN=${process.env.HATHORA_DEV_TOKEN ? 'set' : 'NOT SET'}`);
    const client = await getHathoraClient();
    if (!client) {
      console.log(`⏭️ No Hathora client available`);
      return;
    }
    
    console.log(`📡 Updating Hathora lobby state for ${roomId}:`, state);
    
    await client.lobbiesV3.setLobbyState(roomId, {
      state: JSON.stringify(state),
    });
    
    console.log(`✅ Lobby state updated for ${roomId}`);
  } catch (err: any) {
    // Don't fail the game if lobby state update fails
    console.error(`⚠️ Failed to update lobby state for ${roomId}:`, err?.message, err?.stack);
  }
}

