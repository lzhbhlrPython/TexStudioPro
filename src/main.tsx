import { createRoot } from 'react-dom/client';
import App from './App';
import 'katex/dist/katex.min.css';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(<App />);
