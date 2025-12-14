import React from 'react';
import type { Player } from '../types/multiplayer';

interface WaitingRoomProps {
  roomId: string;
  players: Player[];
  onLeave: () => void;
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
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '64px 32px',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '8px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  subtitle: {
    fontSize: '15px',
    color: colors.textSecondary,
    marginBottom: '40px',
  },
  roomCodeCard: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.accent}40`,
    borderRadius: '16px',
    padding: '28px',
    marginBottom: '32px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  roomCodeLabel: {
    fontSize: '12px',
    color: colors.textMuted,
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
  },
  roomCode: {
    fontSize: '15px',
    fontWeight: 600,
    color: colors.accentLight,
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '0.5px',
    wordBreak: 'break-all' as const,
    padding: '12px 16px',
    background: colors.bgDark,
    borderRadius: '8px',
    border: `1px solid ${colors.border}`,
  },
  shareText: {
    fontSize: '13px',
    color: colors.textMuted,
    marginTop: '16px',
  },
  playersSection: {
    marginBottom: '32px',
    textAlign: 'left' as const,
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: colors.textMuted,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
  },
  playerCard: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  playerAvatar: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    background: `${colors.accent}30`,
    border: `1px solid ${colors.accent}40`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
  },
  playerName: {
    fontSize: '15px',
    fontWeight: 600,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  waitingCard: {
    background: colors.bgGradientStart,
    border: `1px dashed ${colors.border}`,
    borderRadius: '12px',
    padding: '20px',
    color: colors.textMuted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    fontSize: '14px',
  },
  spinner: {
    width: '18px',
    height: '18px',
    border: `2px solid ${colors.border}`,
    borderTopColor: colors.accent,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  button: {
    padding: '14px 28px',
    fontSize: '14px',
    fontWeight: 600,
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
};

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  roomId,
  players,
  onLeave,
}) => {
  const [copied, setCopied] = React.useState(false);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={styles.container}>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      <h1 style={styles.title}>Waiting Room</h1>
      <p style={styles.subtitle}>Share the room ID to invite a friend</p>

      <div 
        style={{
          ...styles.roomCodeCard,
          borderColor: copied ? colors.accent : `${colors.accent}40`,
        }} 
        onClick={copyRoomCode}
      >
        <div style={styles.roomCodeLabel}>Room ID</div>
        <div style={styles.roomCode}>{roomId}</div>
        <div style={styles.shareText}>
          {copied ? '✓ Copied to clipboard!' : 'Click to copy'}
        </div>
      </div>

      <div style={styles.playersSection}>
        <div style={styles.sectionTitle}>Players ({players.length}/2)</div>
        
        {players.map((player, index) => (
          <div key={player.id} style={styles.playerCard}>
            <div style={styles.playerAvatar}>
              {index === 0 ? '👤' : '👤'}
            </div>
            <div style={styles.playerName}>{player.name}</div>
          </div>
        ))}

        {players.length < 2 && (
          <div style={styles.waitingCard}>
            <div style={styles.spinner} />
            Waiting for opponent to join...
          </div>
        )}
      </div>

      <button style={styles.button} onClick={onLeave}>
        Leave Room
      </button>
    </div>
  );
};

