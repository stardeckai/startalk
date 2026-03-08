import { useState } from 'react';
import { Settings } from './components/Settings';
import { History } from './components/History';
import { StatusPill } from './components/StatusPill';
import { useRecordingFlow } from './hooks/useRecordingFlow';
import { currentWindowLabel } from './windowLabel';

console.log('[StarTalk] Window label:', currentWindowLabel);

type Tab = 'settings' | 'history';

function MainApp() {
  useRecordingFlow();
  const [tab, setTab] = useState<Tab>('settings');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          padding: '0 16px',
          flexShrink: 0,
        }}
      >
        {(['settings', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 16px',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'none',
              color: tab === t ? 'var(--foreground)' : 'var(--muted-foreground)',
              fontWeight: tab === t ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'settings' ? <Settings /> : <History />}
      </div>
    </div>
  );
}

function App() {
  if (currentWindowLabel === 'pill') {
    return <StatusPill />;
  }
  return <MainApp />;
}

export default App;
