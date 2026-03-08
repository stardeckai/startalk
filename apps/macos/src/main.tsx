import { setFetchImpl } from '@startalk/core';
import { invoke } from '@tauri-apps/api/core';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

// Route fetch through Rust to avoid CORS issues in Tauri webview
setFetchImpl(async (input, init) => {
  const url = typeof input === 'string' ? input : (input as Request).url;
  const method = init?.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = init.headers;
    if (h instanceof Headers) {
      h.forEach((v, k) => {
        headers[k] = v;
      });
    } else if (Array.isArray(h)) {
      h.forEach(([k, v]) => {
        headers[k] = v;
      });
    } else {
      Object.assign(headers, h);
    }
  }
  const body = typeof init?.body === 'string' ? init.body : undefined;

  const text = await invoke<string>('proxy_fetch', { url, method, headers, body });
  return new Response(text, { status: 200 });
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
