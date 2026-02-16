import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState } from '../types/multiplayer';
import { EMPTY_TASK } from '../types/multiplayer';

// Environment configuration
const USE_HATHORA = import.meta.env.VITE_USE_HATHORA === 'true';
const LOCAL_SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const HATHORA_APP_ID = import.meta.env.VITE_HATHORA_APP_ID || '';
const MATCHMAKING_URL = import.meta.env.VITE_MATCHMAKING_URL || 'ws://localhost:3002';

// Lazily import Hathora SDK only when needed
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

/**
 * Get or create anonymous player token for authentication.
 * This token is used for:
 * - Hathora Lobbies API (creating/joining rooms)
 * - Authenticating Socket.IO connections to game servers
 * - Authenticating with matchmaking service
 * 
 * In production (USE_HATHORA=true), gets a real Hathora token.
 * In local development, returns null (backend allows unauthenticated connections).
 */
const getPlayerToken = async (): Promise<string | null> => {
  if (!USE_HATHORA) {
    // Local development - no auth required
    return null;
  }
  
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
  queuePosition: number | null;
  
  // Actions
  createRoom: (playerName: string) => void;
  joinRoom: (roomId: string, playerName: string) => void;
  quickMatch: (playerName: string) => void;
  cancelQuickMatch: () => void;
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
  const matchmakingWsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>({ ...initialGameState, myPlayerId: null });
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  
  // Store player name for use after matchmaking connects us to a room
  const pendingPlayerNameRef = useRef<string | null>(null);
  
  // Tracks whether the current quick match flow has been cancelled.
  // Checked by async operations (connectToMatchedRoom) to bail out if
  // the user cancelled while we were awaiting.
  const quickMatchCancelledRef = useRef(false);

  // Setup socket event listeners
  const setupSocketListeners = useCallback((socket: Socket) => {
    socket.on('connect', () => {
      setIsConnected(true);
      setIsConnecting(false);
      setGameState(prev => ({
        ...prev,
        myPlayerId: socket.id || null,
      }));
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Room events
    socket.on('room:created', ({ roomId, player }) => {
      setGameState(prev => ({
        ...prev,
        roomId,
        roomState: 'waiting',
        players: [player],
      }));
    });

    socket.on('room:joined', ({ roomId, players }) => {
      setGameState(prev => ({
        ...prev,
        roomId,
        roomState: 'waiting',
        players,
      }));
    });

    socket.on('room:player_joined', ({ player }) => {
      setGameState(prev => ({
        ...prev,
        players: [...prev.players, player],
      }));
    });

    socket.on('room:player_left', ({ playerId }) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== playerId),
      }));
    });

    socket.on('room:player_ready', ({ playerId }) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, readyToPlay: true } : p
        ),
      }));
    });

    socket.on('room:reset', ({ players }) => {
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
      setGameState(prev => ({
        ...prev,
        roomState: 'countdown',
        countdown: seconds,
      }));
    });

    socket.on('game:start', ({ startTime, initialTask, num_tasks }) => {
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
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, taskProgress: taskProgress } : p
        ),
        task: newTask,
      }));
    });

    socket.on('game:opponent_finished_task', ({ playerId, taskProgress }) => {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, taskProgress: taskProgress } : p
        ),
      }));
    });

    socket.on('game:player_finished', ({ playerId, time }) => {
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
      setGameState(prev => ({
        ...prev,
        roomState: 'finished',
        rankings,
        players: prev.players.map(p => ({ ...p, cursorOffset: 0, taskProgress: 0, isFinished: false, readyToPlay: false })),
      }));
    });

    socket.on('game:validation_failed', () => {
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

    // Get auth token for authenticated connections
    const token = await getPlayerToken();

    const socket = io(url, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
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

    // First check room status to help debug issues
    try {
      const roomInfo = await hathoraClient.roomsV2.getRoomInfo(roomId);
      if (roomInfo.status === 'destroyed') {
        throw new Error('Room was destroyed - server may have crashed on startup');
      }
      
      if (roomInfo.status === 'suspended') {
        throw new Error('Room is suspended');
      }
    } catch (err: any) {
    }

    const connectionInfo = await hathoraClient.roomsV2.getConnectionInfo(roomId);
    
    if (connectionInfo.status !== 'active' || !connectionInfo.exposedPort) {
      throw new Error(`Room not ready yet (status: ${connectionInfo.status})`);
    }

    const { host, port } = connectionInfo.exposedPort;
    return `https://${host}:${port}`;
  }, []);

  // Actions
  const createRoom = useCallback(async (playerName: string) => {
    if (USE_HATHORA) {
      // Hathora flow: create private lobby via Lobbies API, then connect
      try {
        setIsConnecting(true);
        setError(null);

        const hathoraClient = await getHathoraClient();
        if (!hathoraClient) {
          throw new Error('Hathora client not initialized');
        }

        const playerToken = await getPlayerToken();
        const lobby = await hathoraClient.lobbiesV3.createLobby(
          { playerAuth: playerToken },
          {
            visibility: 'private',
            region: 'Seattle',
            roomConfig: JSON.stringify({ createdBy: playerName }),
          }
        );

        const roomId = lobby.roomId;

        // Wait for room to be ready and get connection info
        let connectionUrl: string | null = null;
        for (let i = 0; i < 10; i++) {
          try {
            connectionUrl = await getHathoraConnectionInfo(roomId);
            break;
          } catch {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (!connectionUrl) {
          throw new Error('Failed to get connection info');
        }

        await connectSocket(connectionUrl);
        socketRef.current?.emit('room:create', { playerName, roomId });
      } catch (err: any) {
        console.error('❌ Failed to create Hathora lobby:', err);
        setError(`Failed to create room: ${err?.message || 'Unknown error'}`);
        setIsConnecting(false);
      }
    } else {
      // Local flow: just emit to existing socket
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
        await connectSocket(connectionUrl);
        socketRef.current?.emit('room:join', { roomId, playerName });
      } catch (err: any) {
        console.error('❌ Failed to join Hathora room:', err);
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

  // Connect to matchmaking service and join the game room when matched.
  // Returns false if the flow was cancelled during connection.
  const connectToMatchedRoom = useCallback(async (connectionUrl: string, roomId: string, playerName: string): Promise<boolean> => {
    await connectSocket(connectionUrl);

    // If user cancelled while we were connecting, tear down the socket
    // that connectSocket just created and bail out.
    if (quickMatchCancelledRef.current) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return false;
    }

    socketRef.current?.emit('room:join_matched', { roomId, playerName });
    return true;
  }, [connectSocket]);

  const quickMatch = useCallback(async (playerName: string) => {
    if (USE_HATHORA) {
      // Use dedicated matchmaking service
      try {
        quickMatchCancelledRef.current = false;
        setIsConnecting(true);
        setError(null);
        setQueuePosition(null);
        pendingPlayerNameRef.current = playerName;

        // Close existing matchmaking connection if any
        if (matchmakingWsRef.current) {
          matchmakingWsRef.current.close();
        }

        // Get auth token for matchmaking
        const token = await getPlayerToken();
        if (quickMatchCancelledRef.current) return;
        const ws = new WebSocket(MATCHMAKING_URL);
        matchmakingWsRef.current = ws;

        ws.onopen = () => {
          if (quickMatchCancelledRef.current) { ws.close(); return; }
          ws.send(JSON.stringify({ type: 'queue:join', playerName, token }));
        };

        ws.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data);

            switch (msg.type) {
              case 'queue:joined':
                setQueuePosition(msg.position);
                break;

              case 'queue:position':
                setQueuePosition(msg.position);
                break;

              case 'queue:left':
                setQueuePosition(null);
                setIsConnecting(false);
                break;

              case 'match:found': {
                setQueuePosition(null);
                ws.close();
                matchmakingWsRef.current = null;

                // Bail out if cancelled while in queue
                if (quickMatchCancelledRef.current) break;
                
                // Connect to the Hathora game server
                const connected = await connectToMatchedRoom(
                  msg.connectionUrl, 
                  msg.roomId, 
                  pendingPlayerNameRef.current || playerName
                );
                if (!connected) break;
                break;
              }

              case 'error':
                console.error('❌ Matchmaking error:', msg.message);
                setError(msg.message);
                break;
            }
          } catch (err) {
            console.error('Failed to parse matchmaking message:', err);
          }
        };

        ws.onclose = () => {
          matchmakingWsRef.current = null;
        };

        ws.onerror = () => {
          console.error('❌ Matchmaking WebSocket error');
          setError('Failed to connect to matchmaking server');
          setIsConnecting(false);
          setQueuePosition(null);
        };

      } catch (err: any) {
        console.error('❌ Quick match failed:', err);
        setError(`Quick match failed: ${err?.message || 'Unknown error'}`);
        setIsConnecting(false);
      }
    } else {
      // Local flow: emit quick match to backend
      if (socketRef.current) {
        socketRef.current.emit('room:quick_match', { playerName });
      }
    }
  }, [connectToMatchedRoom]);

  const cancelQuickMatch = useCallback(() => {
    // Signal any in-flight async work (connectToMatchedRoom, etc.) to bail out
    quickMatchCancelledRef.current = true;

    // 1. Close matchmaking WebSocket if still in queue
    if (matchmakingWsRef.current) {
      try {
        matchmakingWsRef.current.send(JSON.stringify({ type: 'queue:leave' }));
      } catch {
        // WebSocket may already be closing
      }
      matchmakingWsRef.current.close();
      matchmakingWsRef.current = null;
    }

    // 2. Leave the game room if we already connected to one
    if (socketRef.current?.connected) {
      socketRef.current.emit('room:leave');
    }

    // 3. In Hathora mode the game socket is per-room — disconnect it
    //    so we don't leak a connection to a room we no longer care about.
    //    In local mode the socket is shared and stays connected.
    if (USE_HATHORA && socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // 4. Reset all UI state
    setQueuePosition(null);
    setIsConnecting(false);
    setError(null);
    setGameState(prev => ({
      ...initialGameState,
      // In local mode keep the persistent socket's player ID;
      // in Hathora mode clear it since we disconnected.
      myPlayerId: USE_HATHORA ? null : prev.myPlayerId,
    }));
    pendingPlayerNameRef.current = null;
  }, []);

  const leaveRoom = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('room:leave');
      setGameState(prev => ({ ...initialGameState, myPlayerId: prev.myPlayerId }));
    }
  }, []);

  const readyToPlay = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('player:ready_to_play');
      setGameState(prev => ({ ...prev, roomState: 'waiting' }));
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

  // Cleanup matchmaking WebSocket on unmount
  useEffect(() => {
    return () => {
      if (matchmakingWsRef.current) {
        matchmakingWsRef.current.close();
      }
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    gameState,
    error,
    queuePosition,
    createRoom,
    joinRoom,
    quickMatch,
    cancelQuickMatch,
    leaveRoom,
    readyToPlay,
    sendCursorMove,
    sendEditorText,
    sendTaskComplete,
    clearResetFlag,
  };
}
