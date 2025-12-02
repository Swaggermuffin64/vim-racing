import React from 'react';
import type { Ranking } from '../types/multiplayer';

interface RaceResultsProps {
  rankings: Ranking[];
  myPlayerId: string | null;
  onPlayAgain: () => void;
  onLeave: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(10, 10, 15, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  container: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '2px solid #333',
    borderRadius: '16px',
    padding: '48px',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '32px',
    fontWeight: 800,
    marginBottom: '32px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  rankingList: {
    marginBottom: '32px',
  },
  rankingItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  position: {
    fontSize: '24px',
    fontWeight: 700,
    width: '50px',
  },
  playerInfo: {
    flex: 1,
    textAlign: 'left' as const,
    marginLeft: '16px',
  },
  playerName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#e0e0e0',
  },
  time: {
    fontSize: '14px',
    color: '#888',
    marginTop: '4px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
  },
  button: {
    flex: 1,
    padding: '14px 24px',
    fontSize: '14px',
    fontWeight: 600,
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
    border: 'none',
    color: '#1a1a2e',
  },
  secondaryButton: {
    background: 'transparent',
    border: '1px solid #333',
    color: '#888',
  },
};

const positionEmojis = ['🥇', '🥈', '🥉'];
const positionColors = ['#ffd700', '#c0c0c0', '#cd7f32'];

export const RaceResults: React.FC<RaceResultsProps> = ({
  rankings,
  myPlayerId,
  onPlayAgain,
  onLeave,
}) => {
  const winner = rankings[0];
  const isWinner = winner?.playerId === myPlayerId;
  console.log("myPlayerId", myPlayerId);
  console.log("rankings", rankings);
  const formatTime = (ms: number): string => {
    if (ms === 0) return 'DNF';
    const seconds = ms / 1000;
    return `${seconds.toFixed(2)}s`;
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div
          style={{
            ...styles.title,
            color: isWinner ? '#00ff88' : '#ff6b6b',
          }}
        >
          {isWinner ? '🎉 You Win!' : '😢 You Lose'}
        </div>

        <div style={styles.rankingList}>
          {rankings.map((ranking, index) => (
            <div
              key={ranking.playerId}
              style={{
                ...styles.rankingItem,
                background:
                  ranking.playerId === myPlayerId
                    ? 'rgba(0, 255, 136, 0.1)'
                    : '#0a0a0f',
                border:
                  ranking.playerId === myPlayerId
                    ? '1px solid #00ff88'
                    : '1px solid transparent',
              }}
            >
              <div
                style={{
                  ...styles.position,
                  color: positionColors[index] || '#888',
                }}
              >
                {positionEmojis[index] || `#${index + 1}`}
              </div>
              <div style={styles.playerInfo}>
                <div style={styles.playerName}>
                  {ranking.playerName}
                  {ranking.playerId === myPlayerId && ' (You)'}
                </div>
                <div style={styles.time}>{formatTime(ranking.time)}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.buttons}>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={onLeave}
          >
            Leave
          </button>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={onPlayAgain}
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
};

