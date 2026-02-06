import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import VimEditor from './pages/vim-editor';
import MultiplayerGame from './pages/multiplayer';
import './App.css';

// Shared color palette - matching race UI
const colors = {
  bgDark: '#0a0a0f',
  bgCard: '#12121a',
  bgGradientStart: '#0f172a',
  bgGradientEnd: '#1e1b4b',
  
  // Primary (cyan) - matches navigate highlight
  primary: '#06b6d4',
  primaryLight: '#22d3ee',
  primaryGlow: 'rgba(6, 182, 212, 0.3)',
  
  // Secondary (magenta) - matches delete highlight
  secondary: '#ec4899',
  secondaryLight: '#f472b6',
  secondaryGlow: 'rgba(236, 72, 153, 0.3)',
  
  // Success (emerald)
  success: '#10b981',
  successLight: '#34d399',
  successGlow: 'rgba(16, 185, 129, 0.3)',
  
  // Warning (amber)
  warning: '#fbbf24',
  
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  
  border: '#334155',
  borderLight: '#475569',
};

const homeStyles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: `linear-gradient(180deg, ${colors.bgDark} 0%, #0f0f1a 100%)`,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  topBanner: {
    width: '100%',
    padding: '16px 32px',
    background: '#000000',
    flexShrink: 0,
  },
  topBannerTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", monospace',
    margin: 0,
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
  },
  // Decorative background elements
  bgGlow1: {
    position: 'absolute' as const,
    top: '10%',
    left: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, ${colors.primaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
    animation: 'float 15s ease-in-out infinite, pulse-glow 4s ease-in-out infinite',
  },
  bgGlow2: {
    position: 'absolute' as const,
    bottom: '10%',
    right: '10%',
    width: '500px',
    height: '500px',
    background: `radial-gradient(circle, ${colors.secondaryGlow} 0%, transparent 70%)`,
    filter: 'blur(80px)',
    pointerEvents: 'none' as const,
    animation: 'float 18s ease-in-out infinite reverse, pulse-glow 5s ease-in-out infinite 1s',
  },
  content: {
    position: 'relative' as const,
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '48px',
  },
  titleContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '56px',
    fontWeight: 800,
    color: colors.textPrimary,
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    letterSpacing: '-2px',
    animation: 'title-glow 3s ease-in-out infinite',
  },
  subtitle: {
    fontSize: '18px',
    color: colors.textSecondary,
    fontFamily: '"JetBrains Mono", monospace',
    maxWidth: '500px',
    lineHeight: 1.6,
  },
  buttons: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap' as const,
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
    padding: '28px',
    width: '260px',
    textDecoration: 'none',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  cardGlow: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: '2px',
    background: 'transparent',
    transition: 'all 0.3s ease',
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: colors.textPrimary,
    marginBottom: '8px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  cardDescription: {
    fontSize: '13px',
    color: colors.textMuted,
    lineHeight: 1.6,
    fontFamily: '"JetBrains Mono", monospace',
    flex: 1,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: '6px',
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    marginTop: '16px',
    textTransform: 'uppercase' as const,
  },
  footer: {
    marginTop: '64px',
    display: 'flex',
    gap: '32px',
    color: colors.textMuted,
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", monospace',
  },
  footerLink: {
    color: colors.textMuted,
    textDecoration: 'none',
    transition: 'color 0.2s ease',
  },
};

function Home() {
  return (
    <div style={homeStyles.container}>
      {/* Top Banner */}
      <div style={homeStyles.topBanner}>
        <div style={homeStyles.topBannerTitle}>VIM_GYM</div>
      </div>

      <div style={homeStyles.mainContent}>
        {/* Background glow effects */}
        <div style={homeStyles.bgGlow1} />
        <div style={homeStyles.bgGlow2} />
        
        <div style={homeStyles.content}>
          {/* Header */}
          <div style={homeStyles.header}>
            <div style={homeStyles.titleContainer}>
              <h1 style={homeStyles.title}>VIM_GYM</h1>
            </div>
            <p style={homeStyles.subtitle}>
              Train your Vim muscles.
            </p>
          </div>
          
          {/* Game Mode Cards */}
          <div style={homeStyles.buttons}>
          {/* Quick Play Card */}
          <Link to="/multiplayer?mode=quick" style={homeStyles.cardLink}>
            <div
              style={homeStyles.card}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
                e.currentTarget.style.borderColor = colors.success;
                e.currentTarget.style.boxShadow = `0 12px 40px ${colors.successGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`;
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = `linear-gradient(90deg, transparent, ${colors.success}, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = 'none';
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = 'transparent';
              }}
            >
              <div className="card-glow" style={homeStyles.cardGlow} />
              <div style={homeStyles.cardTitle}>Quick Play</div>
              <div style={homeStyles.cardDescription}>
                Jump into a match instantly. Get paired with another player automatically.
              </div>
              <div 
                style={{
                  ...homeStyles.badge,
                  background: `${colors.success}15`,
                  color: colors.successLight,
                  border: `1px solid ${colors.success}40`,
                }}
              >
                Fastest
              </div>
            </div>
          </Link>

          {/* Private Match Card */}
          <Link to="/multiplayer?mode=private" style={homeStyles.cardLink}>
            <div
              style={homeStyles.card}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
                e.currentTarget.style.borderColor = colors.secondary;
                e.currentTarget.style.boxShadow = `0 12px 40px ${colors.secondaryGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`;
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = `linear-gradient(90deg, transparent, ${colors.secondary}, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = 'none';
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = 'transparent';
              }}
            >
              <div className="card-glow" style={homeStyles.cardGlow} />
              <div style={homeStyles.cardTitle}>Private Match</div>
              <div style={homeStyles.cardDescription}>
                Create a private room or join with a code. Challenge your friends!
              </div>
              <div 
                style={{
                  ...homeStyles.badge,
                  background: `${colors.secondary}15`,
                  color: colors.secondaryLight,
                  border: `1px solid ${colors.secondary}40`,
                }}
              >
                With Friends
              </div>
            </div>
          </Link>

          {/* Practice Card */}
          <Link to="/practice" style={homeStyles.cardLink}>
            <div
              style={homeStyles.card}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)';
                e.currentTarget.style.borderColor = colors.primary;
                e.currentTarget.style.boxShadow = `0 12px 40px ${colors.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.1)`;
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = `linear-gradient(90deg, transparent, ${colors.primary}, transparent)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.boxShadow = 'none';
                const glow = e.currentTarget.querySelector('.card-glow') as HTMLElement;
                if (glow) glow.style.background = 'transparent';
              }}
            >
              <div className="card-glow" style={homeStyles.cardGlow} />
              <div style={homeStyles.cardTitle}>Practice</div>
              <div style={homeStyles.cardDescription}>
                Hone your Vim skills. Complete navigation and deletion challenges.
              </div>
              <div 
                style={{
                  ...homeStyles.badge,
                  background: `${colors.primary}15`,
                  color: colors.primaryLight,
                  border: `1px solid ${colors.primary}40`,
                }}
              >
                Solo
              </div>
              </div>
            </Link>
          </div>
        </div>
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
