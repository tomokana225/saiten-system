
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
            const { apiKey } = args[0] || {};
            const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY });
            await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: 'hello' });
            return { success: true };
        } catch (e: any) {
            return { success: false, error: { message: e.message } };
        }
      }
      case 'gemini-generate-content': {
        const { model, contents, config, apiKey } = args[0];
        const maxRetries = 3;
        let retryCount = 0;

        const executeRequest = async (): Promise<any> => {
            try {
                const ai = new GoogleGenAI({ apiKey: apiKey || process.env.API_KEY });
                const response = await ai.models.generateContent({ model: model || 'gemini-3-flash-preview', contents, config });
                return { success: true, text: response.text };
            } catch (e: any) {
                // Check if it's a rate limit error (429)
                const isRateLimit = e.message?.includes('429') || e.message?.toLowerCase().includes('rate limit') || e.status === 429;
                
                if (isRateLimit && retryCount < maxRetries) {
                    retryCount++;
                    const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
                    console.warn(`[Web Shim] Gemini API Rate Limit (429). Retrying in ${Math.round(delay)}ms... (Attempt ${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return executeRequest();
                }
                
                console.error(`[Web Shim] Gemini API Error:`, e);
                return { success: false, error: { message: e.message } };
            }
        };

        return executeRequest();
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
