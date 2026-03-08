import { Settings } from './components/Settings';
import { useRecordingFlow } from './hooks/useRecordingFlow';

function App() {
  useRecordingFlow();

  return <Settings />;
}

export default App;
