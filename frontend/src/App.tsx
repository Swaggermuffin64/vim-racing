import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import VimEditor from './pages/vim-editor';
import MultiplayerGame from './pages/multiplayer';
import './App.css';

// Shared color palette
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
  borderHover: '#475569',
};

const homeStyles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
  },
  title: {
    fontSize: '72px',
    fontWeight: 800,
    color: colors.textPrimary,
    marginBottom: '16px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-2px',
  },
  subtitle: {
    fontSize: '20px',
    color: colors.textSecondary,
    marginBottom: '56px',
    textAlign: 'center',
    fontFamily: '"JetBrains Mono", monospace',
  },
  buttons: {
    display: 'flex',
    gap: '32px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  card: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    padding: '36px',
    width: '300px',
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
  },
  cardIcon: {
    fontSize: '52px',
    marginBottom: '20px',
  },
  cardTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '12px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  cardDescription: {
    fontSize: '14px',
    color: colors.textMuted,
    lineHeight: 1.6,
    fontFamily: '"JetBrains Mono", monospace',
  },
};

function Home() {
  return (
    <div style={homeStyles.container}>
      <h1 style={homeStyles.title}>⌨️ Vim Racing</h1>
      <p style={homeStyles.subtitle}>
        Master Vim motions through racing challenges
      </p>
      
      <div style={homeStyles.buttons}>
        <Link to="/practice" style={{ textDecoration: 'none' }}>
          <div
            style={homeStyles.card}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.borderColor = colors.borderHover;
              e.currentTarget.style.boxShadow = `0 8px 24px ${colors.accentGlow}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = colors.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={homeStyles.cardIcon}>🎯</div>
            <div style={homeStyles.cardTitle}>Practice</div>
            <div style={homeStyles.cardDescription}>
              Solo practice mode. Complete navigation challenges at your own pace.
            </div>
          </div>
        </Link>

        <Link to="/multiplayer" style={{ textDecoration: 'none' }}>
          <div
            style={homeStyles.card}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.borderColor = colors.borderHover;
              e.currentTarget.style.boxShadow = `0 8px 24px ${colors.accentGlow}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = colors.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={homeStyles.cardIcon}>🏎️</div>
            <div style={homeStyles.cardTitle}>Multiplayer</div>
            <div style={homeStyles.cardDescription}>
              Race against friends! Create a room or join with a code.
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/practice" element={<VimEditor />} />
        <Route path="/multiplayer" element={<MultiplayerGame />} />
        {/* Keep old route for backwards compatibility */}
        <Route path="/vim-editor" element={<VimEditor />} />
      </Routes>
    </Router>
  );
}

export default App;
