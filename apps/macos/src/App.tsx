import { Tabs } from '@base-ui/react/tabs';
import { BookOpen, Clock, Settings as SettingsIcon } from 'lucide-react';
import { History } from './components/History';
import { Settings } from './components/Settings';
import { StatusPill } from './components/StatusPill';
import { Vocabulary } from './components/Vocabulary';
import { useBackendEvents } from './hooks/useBackendEvents';
import { currentWindowLabel } from './windowLabel';

console.log('[StarTalk] Window label:', currentWindowLabel);

function MainApp() {
  useBackendEvents();

  return (
    <Tabs.Root defaultValue="settings" className="flex flex-col h-screen">
      <Tabs.List className="relative flex shrink-0 border-b border-border px-4">
        <Tabs.Tab
          value="settings"
          className="flex items-center gap-1.5 px-4 py-2.5 border-none bg-transparent text-muted-foreground text-[13px] cursor-pointer font-inherit data-[selected]:text-foreground data-[selected]:font-semibold"
        >
          <SettingsIcon size={14} />
          Settings
        </Tabs.Tab>
        <Tabs.Tab
          value="vocabulary"
          className="flex items-center gap-1.5 px-4 py-2.5 border-none bg-transparent text-muted-foreground text-[13px] cursor-pointer font-inherit data-[selected]:text-foreground data-[selected]:font-semibold"
        >
          <BookOpen size={14} />
          Vocabulary
        </Tabs.Tab>
        <Tabs.Tab
          value="history"
          className="flex items-center gap-1.5 px-4 py-2.5 border-none bg-transparent text-muted-foreground text-[13px] cursor-pointer font-inherit data-[selected]:text-foreground data-[selected]:font-semibold"
        >
          <Clock size={14} />
          History
        </Tabs.Tab>
        <Tabs.Indicator className="tab-indicator" />
      </Tabs.List>
      <Tabs.Panel value="settings" className="flex-1 overflow-auto">
        <Settings />
      </Tabs.Panel>
      <Tabs.Panel value="vocabulary" className="flex-1 overflow-auto">
        <Vocabulary />
      </Tabs.Panel>
      <Tabs.Panel value="history" className="flex-1 overflow-auto">
        <History />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function App() {
  if (currentWindowLabel === 'pill') {
    return <StatusPill />;
  }
  return <MainApp />;
}

export default App;
