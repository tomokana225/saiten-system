
import { GoogleGenAI } from '@google/genai';

export const webElectronAPI = {
  invoke: async (channel: string, ...args: any[]) => {
    console.log(`[Web Shim] Invoke ${channel}`, args);

    switch (channel) {
      case 'save-file-temp': {
        const { buffer, originalName } = args[0];
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);
        return url; 
      }
      case 'get-image-details': {
        const filePath = args[0];
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    success: true,
                    details: { width: img.naturalWidth, height: img.naturalHeight, url: filePath }
                });
            };
            img.onerror = (e) => resolve({ success: false, error: 'Image load failed' });
            img.src = filePath;
        });
      }
      case 'load-data': {
        const key = args[0];
        const data = localStorage.getItem(key === 'projects' ? 'gradingProjects' : (key === 'layouts' ? 'sheetLayouts' : key));
        return data ? JSON.parse(data) : null;
      }
      case 'save-data': {
        const { key, data } = args[0];
        const storageKey = key === 'projects' ? 'gradingProjects' : (key === 'layouts' ? 'sheetLayouts' : key);
        try {
            localStorage.setItem(storageKey, JSON.stringify(data));
            return { success: true };
        } catch (e: any) {
            console.error("LocalStorage Save Error", e);
            if (e.name === 'QuotaExceededError') {
                alert('ブラウザの保存容量上限に達しました。');
            }
            return { success: false, error: e.message };
        }
      }
      case 'gemini-validate-key': {
        try {
            // Updated to use process.env.API_KEY exclusively and recommended model 'gemini-3-flash-preview'
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: 'hello' });
            return { success: true };
        } catch (e: any) {
            return { success: false, error: { message: e.message } };
        }
      }
      case 'gemini-generate-content': {
        const { model, contents, config } = args[0];
        try {
            // Updated to use process.env.API_KEY exclusively
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({ model: model || 'gemini-3-flash-preview', contents, config });
            return { success: true, text: response.text };
        } catch (e: any) {
            return { success: false, error: { message: e.message } };
        }
      }
      case 'export-project': 
      case 'export-sheet-layout': {
        const { projectData, layoutData, projectName, layoutName } = args[0] || {};
        const data = projectData || JSON.stringify(layoutData, null, 2);
        const name = projectName || layoutName || 'download';
        
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.json`;
        a.click();
        return { success: true, path: 'Downloads' };
      }
      case 'import-project':
      case 'import-sheet-layout': {
         return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                    const text = await file.text();
                    resolve({ success: true, data: channel === 'import-sheet-layout' ? JSON.parse(text) : text });
                } else {
                    resolve({ success: false, error: 'No file selected' });
                }
            };
            input.click();
         });
      }
    }
    return null;
  }
};
