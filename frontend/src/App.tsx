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
  
  // Quick Play - vibrant green
  quickPlay: '#10b981',
  quickPlayGlow: 'rgba(16, 185, 129, 0.25)',
  
  // Private Match - purple accent
  privateMatch: '#a78bfa',
  privateMatchGlow: 'rgba(167, 139, 250, 0.25)',
  
  // Practice - cyan
  practice: '#06b6d4',
  practiceGlow: 'rgba(6, 182, 212, 0.25)',
  
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
    gap: '24px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '1000px',
  },
  cardLink: {
    textDecoration: 'none',
    display: 'flex',
  },
  card: {
    background: `linear-gradient(135deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    padding: '32px',
    width: '280px',
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  cardTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '10px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  cardDescription: {
    fontSize: '13px',
    color: colors.textMuted,
    lineHeight: 1.6,
    fontFamily: '"JetBrains Mono", monospace',
  },
  badge: {
    display: 'inline-block',
    alignSelf: 'flex-start',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
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
        {/* Quick Play Card */}
        <Link to="/multiplayer?mode=quick" style={homeStyles.cardLink}>
          <div
            style={homeStyles.card}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.borderColor = colors.quickPlay;
              e.currentTarget.style.boxShadow = `0 8px 32px ${colors.quickPlayGlow}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = colors.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div 
              style={{
                ...homeStyles.badge,
                background: `${colors.quickPlay}20`,
                color: colors.quickPlay,
                border: `1px solid ${colors.quickPlay}40`,
              }}
            >
              Fastest
            </div>
            <div style={homeStyles.cardTitle}>Quick Play</div>
            <div style={homeStyles.cardDescription}>
              Jump into a match instantly. Get paired with another player automatically.
            </div>
          </div>
        </Link>

        {/* Private Match Card */}
        <Link to="/multiplayer?mode=private" style={homeStyles.cardLink}>
          <div
            style={homeStyles.card}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.borderColor = colors.privateMatch;
              e.currentTarget.style.boxShadow = `0 8px 32px ${colors.privateMatchGlow}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = colors.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div 
              style={{
                ...homeStyles.badge,
                background: `${colors.privateMatch}20`,
                color: colors.privateMatch,
                border: `1px solid ${colors.privateMatch}40`,
              }}
            >
              With Friends
            </div>
            <div style={homeStyles.cardTitle}>Private Match</div>
            <div style={homeStyles.cardDescription}>
              Create a private room or join with a code. Race against friends!
            </div>
          </div>
        </Link>

        {/* Practice Card */}
        <Link to="/practice" style={homeStyles.cardLink}>
          <div
            style={homeStyles.card}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.borderColor = colors.practice;
              e.currentTarget.style.boxShadow = `0 8px 32px ${colors.practiceGlow}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = colors.border;
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div 
              style={{
                ...homeStyles.badge,
                background: `${colors.practice}20`,
                color: colors.practice,
                border: `1px solid ${colors.practice}40`,
              }}
            >
              Solo
            </div>
            <div style={homeStyles.cardTitle}>Practice</div>
            <div style={homeStyles.cardDescription}>
              Hone your Vim skills. Complete challenges at your own pace.
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
