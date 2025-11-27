import React from 'react';

interface RaceCountdownProps {
  seconds: number;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(10, 10, 15, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  countdown: {
    fontSize: '200px',
    fontWeight: 900,
    fontFamily: '"JetBrains Mono", monospace',
    color: '#ff6b6b',
    textShadow: '0 0 60px rgba(255, 107, 107, 0.8), 0 0 120px rgba(255, 107, 107, 0.4)',
    animation: 'pulse 1s ease-in-out',
  },
  go: {
    color: '#00ff88',
    textShadow: '0 0 60px rgba(0, 255, 136, 0.8), 0 0 120px rgba(0, 255, 136, 0.4)',
  },
};

export const RaceCountdown: React.FC<RaceCountdownProps> = ({ seconds }) => {
  return (
    <div style={styles.overlay}>
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(0.5); opacity: 0; }
            50% { transform: scale(1.1); opacity: 1; }
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
    </div>
  );
};

