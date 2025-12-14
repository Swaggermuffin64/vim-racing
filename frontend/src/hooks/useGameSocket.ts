import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState } from '../types/multiplayer';
import { EMPTY_TASK } from '../types/multiplayer';

// For local development, use direct connection. For production, use Hathora.
const USE_HATHORA = import.meta.env.VITE_USE_HATHORA === 'true';
const LOCAL_SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const HATHORA_APP_ID = import.meta.env.VITE_HATHORA_APP_ID || '';

// Debug: Log environment configuration on load
console.log('🔧 Hathora Config:', {
  USE_HATHORA,
  HATHORA_APP_ID: HATHORA_APP_ID ? `${HATHORA_APP_ID.substring(0, 20)}...` : '(not set)',
  LOCAL_SOCKET_URL,
  RAW_USE_HATHORA: import.meta.env.VITE_USE_HATHORA,
  
});

// Lazily import Hathora SDK only when needed to avoid Zod compatibility issues
let hathoraClientPromise: Promise<any> | null = null;
let playerTokenPromise: Promise<string> | null = null;

const getHathoraClient = async () => {
  if (!USE_HATHORA) return null;
  if (!hathoraClientPromise) {
    hathoraClientPromise = import('@hathora/cloud-sdk-typescript').then(
      (module) => new module.HathoraCloud({ appId: HATHORA_APP_ID })
    );
  }
  return hathoraClientPromise;
};

// Get or create anonymous player token for Lobbies API
const getPlayerToken = async (): Promise<string> => {
  if (!playerTokenPromise) {
    playerTokenPromise = (async () => {
      const client = await getHathoraClient();
      if (!client) throw new Error('Hathora client not initialized');
      const auth = await client.authV1.loginAnonymous(HATHORA_APP_ID);
      return auth.token;
    })();
  }
  return playerTokenPromise;
};

interface UseGameSocketReturn {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  gameState: GameState;
  error: string | null;
  
  // Actions
  createRoom: (playerName: string) => void;
  joinRoom: (roomId: string, playerName: string) => void;
  leaveRoom: () => void;
  readyToPlay: () => void;
  sendCursorMove: (offset: number) => void;
  sendEditorText: (text: string) => void;
  sendTaskComplete: () => void;
  clearResetFlag: () => void;
}

const initialGameState: Omit<GameState, 'myPlayerId'> = {
  roomId: null,
  roomState: 'idle',
  players: [],
  task: EMPTY_TASK,
  num_tasks: 0,
  countdown: null,
  startTime: null,
  rankings: null,
  shouldResetEditor: false,
};

export function useGameSocket(): UseGameSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>({ ...initialGameState, myPlayerId: null });

  // Setup socket event listeners
  const setupSocketListeners = useCallback((socket: Socket) => {
    socket.on('connect', () => {
      console.log('🔌 Connected to server, socket id:', socket.id);
      setIsConnected(true);
      setIsConnecting(false);
      setGameState(prev => ({
        ...prev,
        myPlayerId: socket.id || null,
      }));
    });

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
      setIsConnected(false);
    });

    // Room events
    socket.on('room:created', ({ roomId, player }) => {
      console.log('🏠 Room created:', roomId);
      setGameState(prev => ({
        ...prev,
        roomId,
        roomState: 'waiting',
        players: [player],
      }));
    });

    socket.on('room:joined', ({ roomId, players }) => {
      console.log('🚪 Joined room:', roomId);
      setGameState(prev => ({
        ...prev,
        roomId,
        roomState: 'waiting',
        players,
      }));
    });

    socket.on('room:player_joined', ({ player }) => {
      console.log('👤 Player joined:', player.name);
      setGameState(prev => ({
        ...prev,
        players: [...prev.players, player],
      }));
    });

    socket.on('room:player_left', ({ playerId }) => {
      console.log('👋 Player left:', playerId);
      setGameState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== playerId),
      }));
    });

    socket.on('room:player_ready', ({ playerId }) => {
      console.log('👤 Player ready:', playerId);
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, readyToPlay: true } : p
        ),
      }));
    });

    socket.on('room:reset', ({ players }) => {
      console.log('🔄 Room reset for new game');
      setGameState(prev => ({
        ...prev,
        roomState: 'waiting',
        players,
        task: EMPTY_TASK,
        countdown: null,
        startTime: null,
        rankings: null,
        shouldResetEditor: false,
      }));
    });

    socket.on('room:error', ({ message }) => {
      console.error('❌ Room error:', message);
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    // Game events
    socket.on('game:countdown', ({ seconds }) => {
      console.log('⏱️ Countdown:', seconds);
      setGameState(prev => ({
        ...prev,
        roomState: 'countdown',
        countdown: seconds,
      }));
    });

    socket.on('game:start', ({ startTime, initialTask, num_tasks }) => {
      console.log('🏁 Race started!', initialTask);
      setGameState(prev => ({
        ...prev,
        roomState: 'racing',
        countdown: null,
        startTime,
        task: initialTask,
        num_tasks,
      }));
    });

    socket.on('game:player_finished_task', ({ playerId, taskProgress, newTask }) => {
      console.log('Player', playerId, 'finished task', taskProgress);
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, taskProgress: taskProgress } : p
        ),
        task: newTask,
      }));
    });

    socket.on('game:opponent_finished_task', ({ playerId, taskProgress }) => {
      console.log('Player', playerId, 'finished task', taskProgress);
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, taskProgress: taskProgress } : p
        ),
      }));
    });

    socket.on('game:player_finished', ({ playerId, time, position }) => {
      console.log('🎉 Player finished:', playerId, 'Position:', position);
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, isFinished: true, finishTime: time } : p
        ),

        // Only clear task if the local player finished
        task: playerId === prev.myPlayerId ? EMPTY_TASK : prev.task,
      }));
    });

    socket.on('game:complete', ({ rankings }) => {
      console.log('🏆 Race complete:', rankings);
      setGameState(prev => ({
        ...prev,
        roomState: 'finished',
        rankings,
        players: prev.players.map(p => ({ ...p,cursorOffset: 0, taskProgress: 0, isFinished: false, readyToPlay: false })),
      }));
    });

    socket.on('game:validation_failed', () => {
      console.log('❌ Validation failed, flagging editor reset');
      setGameState(prev => ({
        ...prev,
        shouldResetEditor: true,
      }));
    });
  }, []);

  // Connect to socket (local or Hathora)
  const connectSocket = useCallback(async (url: string) => {
    // Disconnect existing socket if any
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io(url, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;
    setupSocketListeners(socket);
  }, [setupSocketListeners]);

  // For local development: connect on mount
  useEffect(() => {
    if (!USE_HATHORA) {
      connectSocket(LOCAL_SOCKET_URL);
      return () => {
        socketRef.current?.disconnect();
      };
    }
  }, [connectSocket]);

  // Get Hathora connection info for a room
  const getHathoraConnectionInfo = useCallback(async (roomId: string): Promise<string> => {
    const hathoraClient = await getHathoraClient();
    if (!hathoraClient) {
      throw new Error('Hathora client not initialized');
    }

    const connectionInfo = await hathoraClient.roomsV2.getConnectionInfo(roomId);
    
    if (connectionInfo.status !== 'active' || !connectionInfo.exposedPort) {
      throw new Error('Room not ready yet');
    }

    const { host, port } = connectionInfo.exposedPort;
    return `https://${host}:${port}`;
  }, []);

  // Debug: Log gameState changes (remove in production)
  useEffect(() => {
    console.log('🎮 GameState updated:', gameState);
  }, [gameState]);

  // Actions
  const createRoom = useCallback(async (playerName: string) => {
    if (USE_HATHORA) {
      // Hathora flow: create lobby via Lobbies API (client-side friendly), then connect
      try {
        setIsConnecting(true);
        setError(null);

        const hathoraClient = await getHathoraClient();
        if (!hathoraClient) {
          throw new Error('Hathora client not initialized');
        }

        // Get player token for Lobbies API authentication
        console.log('🔑 Getting player token...');
        const playerToken = await getPlayerToken();
        console.log('✅ Got player token');

        // Create a lobby in Hathora using Lobbies API (doesn't require dev token)
        console.log('🏠 Creating lobby...');
        const lobby = await hathoraClient.lobbiesV3.createLobby(
          { playerAuth: playerToken },
          {
            visibility: 'private',
            region: 'Seattle',
            roomConfig: JSON.stringify({ createdBy: playerName }),
          }
        );

        const roomId = lobby.roomId;
        console.log('🎮 Hathora lobby created:', roomId);

        // Wait for room to be ready and get connection info
        let connectionUrl: string | null = null;
        for (let i = 0; i < 10; i++) {
          try {
            connectionUrl = await getHathoraConnectionInfo(roomId);
            break;
          } catch {
            // Room not ready yet, wait and retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (!connectionUrl) {
          throw new Error('Failed to get connection info');
        }

        // Connect to the Hathora server
        await connectSocket(connectionUrl);

        // Create room with Hathora roomId so backend uses the same ID
        socketRef.current?.emit('room:create', { playerName, roomId,});
      } catch (err: any) {
        console.error('❌ Failed to create Hathora lobby:', err);
        console.error('❌ Error details:', {
          message: err?.message,
          status: err?.status,
          body: err?.body,
          stack: err?.stack,
        });
        setError(`Failed to create room: ${err?.message || 'Unknown error'}`);
        setIsConnecting(false);
      }
    } else {
      // Local flow: just emit to existing socket (backend will generate roomId)
      if (socketRef.current) {
        socketRef.current.emit('room:create', { playerName });
      }
    }
  }, [connectSocket, getHathoraConnectionInfo]);

  const joinRoom = useCallback(async (roomId: string, playerName: string) => {
    if (USE_HATHORA) {
      // Hathora flow: get connection info for existing room, then connect
      try {
        setIsConnecting(true);
        setError(null);

        const connectionUrl = await getHathoraConnectionInfo(roomId);

        // Connect to the Hathora server
        await connectSocket(connectionUrl);

        // Join room using the Hathora roomId (same ID used by backend)
        socketRef.current?.emit('room:join', { roomId, playerName });
      } catch (err: any) {
        console.error('❌ Failed to join Hathora room:', err);
        console.error('❌ Error details:', {
          message: err?.message,
          status: err?.status,
          body: err?.body,
        });
        setError(`Failed to join room: ${err?.message || 'Please check the room ID.'}`);
        setIsConnecting(false);
      }
    } else {
      // Local flow: just emit to existing socket
      if (socketRef.current) {
        socketRef.current.emit('room:join', { roomId: roomId.toUpperCase(), playerName });
      }
    }
  }, [connectSocket, getHathoraConnectionInfo]);

  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('room:leave');
      setGameState(prev => ({ ...initialGameState, myPlayerId: prev.myPlayerId }));
    }
  }, []);

  const readyToPlay = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('player:ready_to_play');
      setGameState(prev => ({ ...prev, roomState: 'waiting',  }));
    }
  }, []);

  const sendCursorMove = useCallback((offset: number) => {
    if (socketRef.current && gameState.task.type === 'navigate' && gameState.roomState === 'racing') {
      socketRef.current.emit('player:cursor', { offset });
    }
  }, [gameState.roomState, gameState.task.type]);

  const sendEditorText = useCallback((text: string) => {
    if (socketRef.current && gameState.task.type === 'delete' && gameState.roomState === 'racing') {
      socketRef.current.emit('player:editorText', { text });
    }
  }, [gameState.roomState, gameState.task.type]);

  const sendTaskComplete = useCallback(() => {
    if (socketRef.current && gameState.roomState === 'racing') {
      socketRef.current.emit('player:task_complete');
    }
  }, [gameState.roomState]);

  const clearResetFlag = useCallback(() => {
    setGameState(prev => ({ ...prev, shouldResetEditor: false }));
  }, []);

  return {
    isConnected,
    isConnecting,
    gameState,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    readyToPlay,
    sendCursorMove,
    sendEditorText,
    sendTaskComplete,
    clearResetFlag,
  };
}

