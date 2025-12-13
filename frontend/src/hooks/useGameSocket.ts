import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState } from '../types/multiplayer';
import { EMPTY_TASK } from '../types/multiplayer';

// For local development, use direct connection. For production, use Hathora.
const USE_HATHORA = process.env.REACT_APP_USE_HATHORA === 'true';
const LOCAL_SOCKET_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
const HATHORA_APP_ID = process.env.REACT_APP_HATHORA_APP_ID || '';

// Lazily import Hathora SDK only when needed to avoid Zod compatibility issues
let hathoraClientPromise: Promise<any> | null = null;
const getHathoraClient = async () => {
  if (!USE_HATHORA) return null;
  if (!hathoraClientPromise) {
    hathoraClientPromise = import('@hathora/cloud-sdk-typescript').then(
      (module) => new module.HathoraCloud({ appId: HATHORA_APP_ID })
    );
  }
  return hathoraClientPromise;
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
  sendCursorMove: (offset: number) => void;
  sendEditorText: (text: string) => void;
  sendTaskComplete: () => void;
  clearResetFlag: () => void;
}

const initialGameState: GameState = {
  roomId: null,
  roomState: 'idle',
  players: [],
  task: EMPTY_TASK,
  countdown: null,
  startTime: null,
  rankings: null,
  myPlayerId: null,
  shouldResetEditor: false,
};

export function useGameSocket(): UseGameSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(initialGameState);

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

    socket.on('game:start', ({ startTime, initialTask }) => {
      console.log('🏁 Race started!', initialTask);
      setGameState(prev => ({
        ...prev,
        roomState: 'racing',
        countdown: null,
        startTime,
        task: initialTask,
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
      }));
    });

    socket.on('game:complete', ({ rankings }) => {
      console.log('🏆 Race complete:', rankings);
      setGameState(prev => ({
        ...prev,
        roomState: 'finished',
        rankings,
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
      // Hathora flow: create room via API, then connect
      try {
        setIsConnecting(true);
        setError(null);

        const hathoraClient = await getHathoraClient();
        if (!hathoraClient) {
          throw new Error('Hathora client not initialized');
        }

        // Create a room in Hathora (Seattle region, closest to west coast)
        const { roomId } = await hathoraClient.roomsV2.createRoom({
          region: 'Seattle',
        });

        console.log('🎮 Hathora room created:', roomId);

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
        socketRef.current?.emit('room:create', { playerName, roomId });
      } catch (err) {
        console.error('Failed to create Hathora room:', err);
        setError('Failed to create room. Please try again.');
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
      } catch (err) {
        console.error('Failed to join Hathora room:', err);
        setError('Failed to join room. Please check the room ID.');
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
      setGameState(initialGameState);
    }
  }, []);

  const sendCursorMove = useCallback((offset: number) => {
    if (socketRef.current && gameState.task.type === 'navigate' && gameState.roomState === 'racing') {
      socketRef.current.emit('player:cursor', { offset });
    }
  }, [gameState.roomState, gameState.task.type]);

  const sendEditorText = useCallback((text: string) => {
    if (socketRef.current && gameState.task.type === 'delete' && gameState.roomState === 'racing') {
      console.log("firing");
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
    sendCursorMove,
    sendEditorText,
    sendTaskComplete,
    clearResetFlag,
  };
}

