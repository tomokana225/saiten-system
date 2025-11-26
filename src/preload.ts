import { contextBridge, ipcRenderer } from 'electron';

export interface IElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}

const electronAPI: IElectronAPI = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// To inform TypeScript that the window object has an 'electronAPI' property.
// This can be in a separate .d.ts file, but for simplicity, it's here.
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
