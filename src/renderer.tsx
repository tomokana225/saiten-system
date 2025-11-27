import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './components/App';
import { webElectronAPI } from './webPolyfill';

// Check if running in a browser environment without Electron
if (!window.electronAPI) {
    console.log('Running in Web Mode - Initializing Polyfills');
    // @ts-ignore
    window.electronAPI = webElectronAPI;
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);