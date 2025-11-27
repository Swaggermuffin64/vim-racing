import React from 'react';
import type { Player } from '../types/multiplayer';

interface WaitingRoomProps {
  roomId: string;
  players: Player[];
  onLeave: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '500px',
    margin: '0 auto',
    padding: '48px 32px',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: '32px',
  },
  roomCodeCard: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '2px solid #00ff88',
    borderRadius: '12px',
    padding: '32px',
    marginBottom: '32px',
  },
  roomCodeLabel: {
    fontSize: '14px',
    color: '#888',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
  },
  roomCode: {
    fontSize: '48px',
    fontWeight: 800,
    color: '#00ff88',
    fontFamily: '"JetBrains Mono", monospace',
    letterSpacing: '8px',
    textShadow: '0 0 20px rgba(0, 255, 136, 0.5)',
  },
  shareText: {
    fontSize: '14px',
    color: '#888',
    marginTop: '16px',
  },
  playersSection: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ff6b6b',
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  playerCard: {
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  playerAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
  },
  playerName: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#e0e0e0',
  },
  waitingCard: {
    background: '#1a1a2e',
    border: '1px dashed #333',
    borderRadius: '8px',
    padding: '16px',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid #333',
    borderTopColor: '#ff6b6b',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  button: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: 600,
    background: 'transparent',
    border: '1px solid #ff6b6b',
    borderRadius: '8px',
    color: '#ff6b6b',
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
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
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

      <h1 style={styles.title}>🏠 Waiting for Opponent</h1>

      <div style={styles.roomCodeCard} onClick={copyRoomCode}>
        <div style={styles.roomCodeLabel}>Room Code</div>
        <div style={styles.roomCode}>{roomId}</div>
        <div style={styles.shareText}>
          📋 Click to copy • Share with a friend!
        </div>
      </div>

      <div style={styles.playersSection}>
        <div style={styles.sectionTitle}>Players ({players.length}/2)</div>
        
        {players.map((player, index) => (
          <div key={player.id} style={styles.playerCard}>
            <div style={styles.playerAvatar}>
              {index === 0 ? '🏎️' : '🚗'}
            </div>
            <div style={styles.playerName}>{player.name}</div>
          </div>
        ))}

        {players.length < 2 && (
          <div style={styles.waitingCard}>
            <div style={styles.spinner} />
            Waiting for opponent...
          </div>
        )}
      </div>

      <button style={styles.button} onClick={onLeave}>
        Leave Room
      </button>
    </div>
  );
};

