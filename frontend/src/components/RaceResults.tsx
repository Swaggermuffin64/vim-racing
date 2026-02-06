import React from 'react';
import type { Ranking } from '../types/multiplayer';

interface RaceResultsProps {
  rankings: Ranking[];
  myPlayerId: string | null;
  onPlayAgain: () => void;
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
  
  gold: '#fbbf24',
  silver: '#94a3b8',
  bronze: '#d97706',
};

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
    backdropFilter: 'blur(4px)',
  },
  container: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '20px',
    padding: '48px',
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    marginBottom: '8px',
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: '15px',
    color: colors.textSecondary,
    marginBottom: '32px',
  },
  rankingList: {
    marginBottom: '32px',
  },
  rankingItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderRadius: '12px',
    marginBottom: '10px',
  },
  position: {
    fontSize: '22px',
    fontWeight: 700,
    width: '44px',
    textAlign: 'left' as const,
  },
  playerInfo: {
    flex: 1,
    textAlign: 'left' as const,
    marginLeft: '12px',
  },
  playerName: {
    fontSize: '16px',
    fontWeight: 600,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
  },
  time: {
    fontSize: '13px',
    color: colors.textMuted,
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
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: '"JetBrains Mono", monospace',
    transition: 'all 0.2s ease',
  },
  primaryButton: {
    background: colors.accent,
    border: 'none',
    color: colors.bgDark,
  },
  secondaryButton: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    color: colors.textMuted,
  },
};

const positionLabels = ['1st', '2nd', '3rd'];
const positionColors = [colors.gold, colors.silver, colors.bronze];

export const RaceResults: React.FC<RaceResultsProps> = ({
  rankings,
  myPlayerId,
  onPlayAgain,
  onLeave,
}) => {
  const winner = rankings[0];
  const isWinner = winner?.playerId === myPlayerId;
  
  const formatTime = (ms: number): string => {
    if (ms === 0) return 'DNF';
    const seconds = ms / 1000;
    return `${seconds.toFixed(2)}s`;
  };

  const getMyPosition = () => {
    const idx = rankings.findIndex(r => r.playerId === myPlayerId);
    return idx >= 0 ? idx + 1 : null;
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.title}>
          {isWinner ? 'Victory!' : 'Race Complete'}
        </div>
        <p style={styles.subtitle}>
          {isWinner 
            ? 'Congratulations, you won!' 
            : `You finished #${getMyPosition()}`
          }
        </p>

        <div style={styles.rankingList}>
          {rankings.map((ranking, index) => (
            <div
              key={ranking.playerId}
              style={{
                ...styles.rankingItem,
                background: `${colors.accent}15`,
                border: `1px solid ${colors.accent}40`,
              }}
            >
              <div
                style={{
                  ...styles.position,
                  color: positionColors[index] || colors.textMuted,
                }}
              >
                {positionLabels[index] || `#${index + 1}`}
              </div>
              <div style={styles.playerInfo}>
                <div style={styles.playerName}>
                  {ranking.playerName}
                  {ranking.playerId === myPlayerId && (
                    <span style={{ color: colors.textMuted, fontWeight: 400 }}> (You)</span>
                  )}
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

