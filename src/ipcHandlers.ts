import { ipcMain, dialog, app, nativeImage } from 'electron';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Manually declare Node.js global `Buffer` to resolve TypeScript errors as the node type definitions could not be found.
declare const Buffer: {
    from(data: any): any;
};

// Create a dedicated persistent storage directory for this application
const persistentStorageDir = path.join(app.getPath('userData'), 'batch-grader-files');
fs.mkdir(persistentStorageDir, { recursive: true }).catch(console.error);

export const registerIpcHandlers = () => {
    // The channel is still 'save-file-temp' for compatibility, but it now saves persistently.
    ipcMain.handle('save-file-temp', async (event, { buffer, originalName }) => {
        try {
            const fileName = `${Date.now()}-${path.basename(originalName)}`;
            const filePath = path.join(persistentStorageDir, fileName);
            await fs.writeFile(filePath, Buffer.from(buffer));
            // Return a valid file protocol URL for cross-platform compatibility
            return pathToFileURL(filePath).href;
        } catch (error) {
            console.error('Failed to save persistent file:', error);
            return null;
        }
    });

    ipcMain.handle('get-image-details', async (event, filePath) => {
        try {
            if (!filePath || typeof filePath !== 'string') {
                throw new Error('Invalid file path provided to get-image-details.');
            }
            const systemPath = fileURLToPath(filePath);
            const image = nativeImage.createFromPath(systemPath);
            if (image.isEmpty()) {
                throw new Error(`Electron nativeImage failed to load the image at: ${systemPath}`);
            }
            const size = image.getSize();
            const dataUrl = image.toDataURL();
            return {
                success: true,
                details: {
                    width: size.width,
                    height: size.height,
                    url: dataUrl
                }
            };
        } catch (error) {
            console.error(`[IPC: get-image-details] Failed for path: ${filePath}`, error);
            return { success: false, error: error.message };
        }
    });

    // A handler to check if the API key is valid
    ipcMain.handle('gemini-validate-key', async (event, { apiKey }) => {
        if (!apiKey) {
            return { success: false, error: { message: 'APIキーが提供されていません。' } };
        }
        try {
            const ai = new GoogleGenAI({ apiKey });
            // A lightweight call to check if the key is valid and the service is reachable.
            await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: 'hello'
            });
            return { success: true };
        } catch (error) {
            console.error('Gemini API key validation failed:', error);
            return { success: false, error: { message: error.message } };
        }
    });

    // Content generation
    ipcMain.handle('gemini-generate-content', async (event, { apiKey, model = 'gemini-2.5-flash', contents, config }) => {
        if (!apiKey) {
            return { success: false, error: { message: 'APIキーが設定されていません。設定画面でキーを入力してください。' } };
        }
        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({ model, contents, config });
            return { success: true, text: response.text };

        } catch (error) {
            console.error('Error calling Gemini API:', error);
            let errorMessage = error.message;
            if (error.message?.includes('API key not valid')) {
                errorMessage = 'APIキーが無効です。設定画面で正しいキーを入力してください。';
            }
            return { success: false, error: { message: errorMessage } };
        }
    });

    // Project import
    ipcMain.handle('import-project', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'JSON Project Files', extensions: ['json'] }]
        });

        if (canceled || filePaths.length === 0) {
            return { success: false, error: 'Import canceled.' };
        }

        try {
            const data = await fs.readFile(filePaths[0], 'utf-8');
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Project export
    ipcMain.handle('export-project', async (event, { projectName, projectData }) => {
         const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'プロジェクトをエクスポート',
            defaultPath: `${projectName}.json`,
            filters: [{ name: 'JSON Project Files', extensions: ['json'] }]
        });

        if (canceled || !filePath) {
             return { success: false, error: 'Export canceled.' };
        }

        try {
            await fs.writeFile(filePath, projectData, 'utf-8');
            return { success: true, path: filePath };
        } catch (error) {
             return { success: false, error: error.message };
        }
    });

    // Sheet Layout Import
    ipcMain.handle('import-sheet-layout', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Layout Files', extensions: ['json'] }]
        });
        if (canceled || filePaths.length === 0) return { success: false };
        try {
            const data = await fs.readFile(filePaths[0], 'utf-8');
            return { success: true, data: JSON.parse(data) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Sheet Layout Export
    ipcMain.handle('export-sheet-layout', async (event, { layoutName, layoutData }) => {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'レイアウトをエクスポート',
            defaultPath: `${layoutName}.json`,
            filters: [{ name: 'Layout Files', extensions: ['json'] }]
        });
        if (canceled || !filePath) return { success: false };
        try {
            await fs.writeFile(filePath, JSON.stringify(layoutData, null, 2), 'utf-8');
            return { success: true, path: filePath };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
};