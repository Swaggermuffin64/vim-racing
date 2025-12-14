import React, { useState } from 'react';

interface LobbyProps {
  isConnected: boolean;
  isConnecting?: boolean;
  useHathora?: boolean; // In Hathora mode, connection happens on room create/join
  error: string | null;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomId: string, playerName: string) => void;
}

const colors = {
  bgDark: '#0a0a0f',
  bgGradientStart: '#0f172a',
  bgGradientEnd: '#1e1b4b',
  
  accent: '#a78bfa',
  accentLight: '#c4b5fd',
  accentGlow: 'rgba(167, 139, 250, 0.25)',
  
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  
  border: '#334155',
  borderLight: '#475569',
  
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '64px 32px',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '48px',
  },
  title: {
    fontSize: '42px',
    fontWeight: 800,
    color: colors.textPrimary,
    marginBottom: '12px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-1px',
  },
  subtitle: {
    fontSize: '16px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  connectionStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: colors.bgGradientStart,
    borderRadius: '20px',
    fontSize: '13px',
    marginTop: '20px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  card: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    padding: '28px',
    marginBottom: '20px',
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.textMuted,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
  },
  input: {
    width: '100%',
    padding: '14px 18px',
    fontSize: '16px',
    fontFamily: '"JetBrains Mono", monospace',
    background: colors.bgDark,
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    color: colors.textPrimary,
    marginBottom: '0',
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  button: {
    width: '100%',
    padding: '16px 24px',
    fontSize: '15px',
    fontWeight: 600,
    color: colors.bgDark,
    background: colors.accent,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    letterSpacing: '0.5px',
  },
  buttonOutline: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '20px 0',
    color: colors.textMuted,
    fontSize: '13px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: colors.border,
  },
  dividerText: {
    padding: '0 16px',
  },
  error: {
    background: 'rgba(248, 113, 113, 0.1)',
    border: `1px solid ${colors.error}`,
    borderRadius: '10px',
    padding: '14px 18px',
    color: colors.error,
    marginBottom: '24px',
    textAlign: 'center' as const,
    fontSize: '14px',
  },
  backButton: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '14px',
    fontWeight: 500,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
    marginTop: '12px',
  },
  playerBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    background: `${colors.accent}20`,
    border: `1px solid ${colors.accent}40`,
    borderRadius: '6px',
    color: colors.accentLight,
    fontWeight: 600,
    fontSize: '14px',
  },
};

export const Lobby: React.FC<LobbyProps> = ({
  isConnected,
  isConnecting = false,
  useHathora = false,
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
      // Pass room code as-is (Hathora IDs are case-sensitive)
      onJoinRoom(roomCode.trim(), playerName.trim());
    }
  };

  const isLoading = isConnecting;
  
  // In Hathora mode, we don't need to be connected before creating/joining
  // because the connection happens as part of that flow
  const canInteract = useHathora ? true : isConnected;

  const getStatusColor = () => {
    if (isConnecting) return colors.warning;
    if (useHathora || isConnected) return colors.success;
    return colors.textMuted;
  };

  const getStatusText = () => {
    if (useHathora) {
      return isConnecting ? 'Connecting...' : 'Ready to play';
    }
    return isConnected ? 'Connected' : 'Connecting...';
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🏎️ Multiplayer</h1>
        <p style={styles.subtitle}>Race your friends with Vim motions</p>
        
        <div style={styles.connectionStatus}>
          <div
            style={{
              ...styles.dot,
              background: getStatusColor(),
              boxShadow: `0 0 8px ${getStatusColor()}`,
            }}
          />
          <span style={{ color: getStatusColor() }}>
            {getStatusText()}
          </span>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {mode === 'select' && (
        <>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Your Name</div>
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
              ...((!canInteract || !playerName.trim() || isLoading) ? styles.buttonDisabled : {}),
            }}
            onClick={() => playerName.trim() && setMode('create')}
            disabled={!canInteract || !playerName.trim() || isLoading}
          >
            Create Room
          </button>

          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span style={styles.dividerText}>or</span>
            <div style={styles.dividerLine} />
          </div>

          <button
            style={{
              ...styles.button,
              ...styles.buttonOutline,
              ...((!canInteract || !playerName.trim() || isLoading) ? styles.buttonDisabled : {}),
            }}
            onClick={() => playerName.trim() && setMode('join')}
            disabled={!canInteract || !playerName.trim() || isLoading}
          >
            Join Room
          </button>
        </>
      )}

      {mode === 'create' && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Create a Room</div>
          <p style={{ color: colors.textSecondary, marginBottom: '20px', fontSize: '15px' }}>
            Playing as <span style={styles.playerBadge}>{playerName}</span>
          </p>
          <button
            style={{
              ...styles.button,
              ...(isLoading ? styles.buttonDisabled : {}),
            }}
            onClick={handleCreate}
            disabled={!canInteract || isLoading}
          >
            {isLoading ? 'Creating...' : 'Create Room'}
          </button>
          <button
            style={styles.backButton}
            onClick={() => setMode('select')}
            disabled={isLoading}
          >
            ← Back
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Join a Room</div>
          <p style={{ color: colors.textSecondary, marginBottom: '20px', fontSize: '15px' }}>
            Playing as <span style={styles.playerBadge}>{playerName}</span>
          </p>
          <input
            type="text"
            placeholder="Paste room ID here..."
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            style={{ ...styles.input, marginBottom: '16px' }}
            maxLength={50}
          />
          <button
            style={{
              ...styles.button,
              ...((!roomCode.trim() || isLoading) ? styles.buttonDisabled : {}),
            }}
            onClick={handleJoin}
            disabled={!canInteract || !roomCode.trim() || isLoading}
          >
            {isLoading ? 'Joining...' : 'Join Room'}
          </button>
          <button
            style={styles.backButton}
            onClick={() => setMode('select')}
            disabled={isLoading}
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
};

