import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import VimEditor from './pages/vim-editor';
import MultiplayerGame from './pages/multiplayer';
import './App.css';

const homeStyles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#0a0a0f',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
  },
  title: {
    fontSize: '64px',
    fontWeight: 800,
    color: '#e0e0e0',
    marginBottom: '16px',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  },
  subtitle: {
    fontSize: '20px',
    color: '#888',
    marginBottom: '48px',
    textAlign: 'center',
  },
  buttons: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  card: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '1px solid #0f3460',
    borderRadius: '16px',
    padding: '32px',
    width: '280px',
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
  },
  cardIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  cardTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#e0e0e0',
    marginBottom: '8px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  cardDescription: {
    fontSize: '14px',
    color: '#888',
    lineHeight: 1.5,
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
              e.currentTarget.style.borderColor = '#00ff88';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#0f3460';
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
              e.currentTarget.style.borderColor = '#ff6b6b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#0f3460';
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
