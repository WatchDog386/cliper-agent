import { colors, desk } from '../theme';

export function TabNav() {
  const tabs = ['Jobs', 'Create', 'Library', 'Channels', 'Scout', 'Settings'];
  
  return (
    <nav style={{
      width: 236,
      backgroundColor: desk.nav,
      padding: '24px 14px',
      gap: 4,
      borderRight: `1px solid ${desk.navBorder}`,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        paddingBottom: 16,
        marginBottom: 16,
        borderBottom: `1px solid ${desk.navBorder}`,
      }}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: 'linear-gradient(180deg, #45B65C 0%, #2DA043 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.charcoal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="12" x2="20" y2="12"></line>
            <polyline points="8,16 12,12 16,16"></polyline>
          </svg>
        </div>
        <span style={{
          fontFamily: 'Inter, sans-serif',
          fontWeight: 700,
          fontSize: '1.5rem',
          color: '#FFFFFF',
        }}>
          Cliper Agent
        </span>
      </div>
      
      {tabs.map((tab, i) => (
        <a key={tab} href={`#${tab.toLowerCase()}`} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          height: 44,
          padding: '0 12px',
          borderRadius: 10,
          color: desk.navText,
          textDecoration: 'none',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          fontSize: '0.875rem',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 4.41 14.59 8L9 3.21l-1 1.58-6.01 4.21a1 1 0 0 0 0 1.78l6.02 4.21-1 1.58-4.59-2.42a1 1 0 0 1-1.41-1.41l3.21-4.59-4.21-6.02a1 1 0 0 1 1.78-1.41l6 4.21 4.59-3.21a1 1 0 0 1 1.41 1.41L9.41 8z"></path>
          </svg>
          {tab}
        </a>
      ))}
    </nav>
  );
}