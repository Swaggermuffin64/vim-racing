import React, { useState } from 'react';

interface LobbyProps {
  isConnected: boolean;
  error: string | null;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '500px',
    margin: '0 auto',
    padding: '48px 32px',
  },
  title: {
    fontSize: '48px',
    fontWeight: 800,
    color: '#e0e0e0',
    marginBottom: '8px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: '18px',
    color: '#888',
    marginBottom: '48px',
    textAlign: 'center' as const,
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '32px',
    fontSize: '14px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  card: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '1px solid #0f3460',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ff6b6b',
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    background: '#0a0a0f',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#e0e0e0',
    marginBottom: '12px',
    boxSizing: 'border-box' as const,
  },
  button: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#1a1a2e',
    background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  buttonSecondary: {
    background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%)',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '24px 0',
    color: '#666',
    fontSize: '14px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#333',
  },
  dividerText: {
    padding: '0 16px',
  },
  error: {
    background: 'rgba(255, 107, 107, 0.1)',
    border: '1px solid #ff6b6b',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#ff6b6b',
    marginBottom: '24px',
    textAlign: 'center' as const,
  },
};

export const Lobby: React.FC<LobbyProps> = ({
  isConnected,
  error,
  onCreateRoom,
  onJoinRoom,
}) => {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');

  const handleCreate = () => {
    if (playerName.trim()) {
      onCreateRoom(playerName.trim());
    }
  };

  const handleJoin = () => {
    if (playerName.trim() && roomCode.trim()) {
      onJoinRoom(roomCode.trim().toUpperCase(), playerName.trim());
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>⌨️ Vim Racing</h1>
      <p style={styles.subtitle}>Race your friends with Vim motions</p>

      <div style={styles.connectionStatus}>
        <div
          style={{
            ...styles.dot,
            background: isConnected ? '#00ff88' : '#ff6b6b',
            boxShadow: isConnected
              ? '0 0 8px #00ff88'
              : '0 0 8px #ff6b6b',
          }}
        />
        <span style={{ color: isConnected ? '#00ff88' : '#ff6b6b' }}>
          {isConnected ? 'Connected' : 'Connecting...'}
        </span>
      </div>

      {error && <div style={styles.error}>❌ {error}</div>}

      {mode === 'select' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitle}>👤 Your Name</div>
            <input
              type="text"
              placeholder="Enter your name..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              style={styles.input}
              maxLength={20}
            />
          </div>

          <button
            style={{
              ...styles.button,
              ...((!isConnected || !playerName.trim()) ? styles.buttonDisabled : {}),
            }}
            onClick={() => playerName.trim() && setMode('create')}
            disabled={!isConnected || !playerName.trim()}
          >
            🏠 Create Room
          </button>

          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <div style={styles.dividerLine} />
          </div>

          <button
            style={{
              ...styles.button,
              ...styles.buttonSecondary,
              ...((!isConnected || !playerName.trim()) ? styles.buttonDisabled : {}),
            }}
            onClick={() => playerName.trim() && setMode('join')}
            disabled={!isConnected || !playerName.trim()}
          >
            🚪 Join Room
          </button>
        </>
      )}

      {mode === 'create' && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>🏠 Create a Room</div>
          <p style={{ color: '#888', marginBottom: '16px' }}>
            Creating room as <strong style={{ color: '#00ff88' }}>{playerName}</strong>
          </p>
          <button
            style={styles.button}
            onClick={handleCreate}
            disabled={!isConnected}
          >
            Create & Get Room Code
          </button>
          <button
            style={{
              ...styles.button,
              background: 'transparent',
              border: '1px solid #333',
              color: '#888',
              marginTop: '12px',
            }}
            onClick={() => setMode('select')}
          >
            ← Back
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>🚪 Join a Room</div>
          <p style={{ color: '#888', marginBottom: '16px' }}>
            Joining as <strong style={{ color: '#00ff88' }}>{playerName}</strong>
          </p>
          <input
            type="text"
            placeholder="Enter room code..."
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            style={{ ...styles.input, textTransform: 'uppercase', letterSpacing: '4px', textAlign: 'center' }}
            maxLength={6}
          />
          <button
            style={{
              ...styles.button,
              ...styles.buttonSecondary,
              ...(!roomCode.trim() ? styles.buttonDisabled : {}),
            }}
            onClick={handleJoin}
            disabled={!isConnected || !roomCode.trim()}
          >
            Join Room
          </button>
          <button
            style={{
              ...styles.button,
              background: 'transparent',
              border: '1px solid #333',
              color: '#888',
              marginTop: '12px',
            }}
            onClick={() => setMode('select')}
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
};

