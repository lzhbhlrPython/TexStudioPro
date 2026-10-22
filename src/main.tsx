import { createRoot } from 'react-dom/client';
import App from './App';
import 'katex/dist/katex.min.css';
import './styles/app.css';
import './styles/workbench.css';
import './styles/schematic.css';
import './styles/pdf.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(<App />);

import './styles/welcome.css';

import './styles/music.css';
import './styles/writing.css';
import './styles/artwork.css';
