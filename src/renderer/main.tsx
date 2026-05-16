import ReactDOM from 'react-dom/client';
import '../tauri-api';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import './styles/app.css';
import './styles/editor.css';
import './styles/print.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
