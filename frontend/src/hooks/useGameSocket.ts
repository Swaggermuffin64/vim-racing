import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState } from '../types/multiplayer';
import { EMPTY_TASK } from '../types/multiplayer';

const SOCKET_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

interface UseGameSocketReturn {
  // State
  isConnected: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState>(initialGameState);

  // Initialize socket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Connected to server, socket id:', socket.id);
      setIsConnected(true);
      setGameState(prev => {
        const newState = { ...prev, myPlayerId: socket.id || null };
        console.log('Updated gameState with myPlayerId:', newState);
        return newState;
      });
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

    socket.on('game:start', ({ startTime, initialTask}) => {
      console.log('🏁 Race started!', initialTask);
      setGameState(prev => ({
        ...prev,
        roomState: 'racing',
        countdown: null,
        startTime,
        task: initialTask 
      }));
    });

    socket.on('game:player_finished_task', ({ playerId, taskProgress, newTask}) => {
      console.log('Player', playerId, 'finished task', taskProgress);
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === playerId ? { ...p, taskProgress: taskProgress } : p
        ),
        task: newTask 
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

    return () => {
      socket.disconnect();
    };
  }, []);

  // Debug: Log gameState changes (remove in production)
  useEffect(() => {
    console.log('🎮 GameState updated:', gameState);
  }, [gameState]);

  // Actions
  const createRoom = useCallback((playerName: string) => {
    if (socketRef.current) {
      socketRef.current.emit('room:create', { playerName });
    }
  }, []);

  const joinRoom = useCallback((roomId: string, playerName: string) => {
    if (socketRef.current) {
      socketRef.current.emit('room:join', { roomId: roomId.toUpperCase(), playerName });
    }
  }, []);

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

