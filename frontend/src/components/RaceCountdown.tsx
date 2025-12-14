import React from 'react';

interface RaceCountdownProps {
  seconds: number;
}

const colors = {
  accent: '#a78bfa',
  accentLight: '#c4b5fd',
  textPrimary: '#f1f5f9',
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(10, 10, 15, 0.92)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  countdown: {
    fontSize: '180px',
    fontWeight: 900,
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
    textShadow: `0 0 60px ${colors.accent}80, 0 0 120px ${colors.accent}40`,
    animation: 'countdownPulse 1s ease-in-out',
  },
  go: {
    color: colors.accentLight,
    textShadow: `0 0 60px ${colors.accent}, 0 0 120px ${colors.accent}80`,
  },
  label: {
    fontSize: '18px',
    fontWeight: 500,
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.accent,
    marginTop: '24px',
    letterSpacing: '4px',
    textTransform: 'uppercase' as const,
  },
};

export const RaceCountdown: React.FC<RaceCountdownProps> = ({ seconds }) => {
  return (
    <div style={styles.overlay}>
      <style>
        {`
          @keyframes countdownPulse {
            0% { transform: scale(0.5); opacity: 0; }
            50% { transform: scale(1.05); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}
      </style>
      <div
        key={seconds}
        style={{
          ...styles.countdown,
          ...(seconds === 0 ? styles.go : {}),
        }}
      >
        {seconds === 0 ? 'GO!' : seconds}
      </div>
      {seconds > 0 && (
        <div style={styles.label}>Get Ready</div>
      )}
    </div>
  );
};

