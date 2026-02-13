
import * as pdfjsLib from 'pdfjs-dist';
import { Area, Point, AreaType } from './types';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://aistudiocdn.com/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
}

export const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

export const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Only set crossOrigin for remote URLs to allow canvas export.
        // For blob: and data: URLs (local), setting this can cause SecurityError in some browsers/contexts.
        if (!src.startsWith('blob:') && !src.startsWith('data:')) {
            img.crossOrigin = "Anonymous";
        }
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};

export const convertFileToImages = async (file: File): Promise<string[]> => {
    if (file.type === 'application/pdf') {
        const arrayBuffer = await fileToArrayBuffer(file);
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const images: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); 
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context!, viewport: viewport } as any).promise;
            images.push(canvas.toDataURL('image/jpeg', 0.85));
        }
        return images;
    } else {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve([reader.result as string]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
};

interface PointCoord { x: number; y: number; }
interface Corners { tl: PointCoord; tr: PointCoord; br: PointCoord; bl: PointCoord; }

export const findAlignmentMarks = (
    imageData: ImageData, 
    settings: { minSize: number, threshold: number, padding: number } = { minSize: 10, threshold: 160, padding: 0 }
): Corners | null => {
    const { data, width, height } = imageData;
    const searchRange = 0.20;
    const cornerW = Math.floor(width * searchRange);
    const cornerH = Math.floor(height * searchRange);

    const findBestCentroid = (startX: number, startY: number, endX: number, endY: number, targetX: number, targetY: number): PointCoord | null => {
        const visited = new Uint8Array((endX - startX) * (endY - startY));
        let bestCandidate: { centroid: PointCoord, distSq: number } | null = null;
        const minArea = settings.minSize * settings.minSize;

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const vIdx = (y - startY) * (endX - startX) + (x - startX);
                if (visited[vIdx]) continue;

                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

                if (gray < settings.threshold) {
                    let sumX = 0, sumY = 0, count = 0;
                    let minX = x, maxX = x, minY = y, maxY = y;
                    const stack = [[x, y]];
                    visited[vIdx] = 1;

                    while (stack.length > 0) {
                        const [cx, cy] = stack.pop()!;
                        sumX += cx; sumY += cy; count++;
                        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
                        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;

                        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
                        for (const [nx, ny] of neighbors) {
                            if (nx >= startX && nx < endX && ny >= startY && ny < endY) {
                                const nvIdx = (ny - startY) * (endX - startX) + (nx - startX);
                                if (!visited[nvIdx]) {
                                    const nIdx = (ny * width + nx) * 4;
                                    const nGray = 0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2];
                                    if (nGray < settings.threshold) {
                                        visited[nvIdx] = 1;
                                        stack.push([nx, ny]);
                                    }
                                }
                            }
                        }
                        if (count > 5000) break;
                    }

                    const blobW = maxX - minX + 1;
                    const blobH = maxY - minY + 1;
                    const aspectRatio = Math.max(blobW, blobH) / Math.min(blobW, blobH);

                    if (count >= minArea && count < (width * height * 0.02) && aspectRatio < 3) {
                        const centroid = { x: sumX / count, y: sumY / count };
                        const distSq = Math.pow(centroid.x - targetX, 2) + Math.pow(centroid.y - targetY, 2);
                        if (!bestCandidate || distSq < bestCandidate.distSq) {
                            bestCandidate = { centroid, distSq };
                        }
                    }
                }
            }
        }
        return bestCandidate ? bestCandidate.centroid : null;
    };

    const tl = findBestCentroid(0, 0, cornerW, cornerH, 0, 0);
    const tr = findBestCentroid(width - cornerW, 0, width, cornerH, width, 0);
    const br = findBestCentroid(width - cornerW, height - cornerH, width, height, width, height);
    const bl = findBestCentroid(0, height - cornerH, cornerW, height, 0, height);

    if (tl && tr && br && bl) return { tl, tr, br, bl };
    return null;
};

// Client-side flood fill detection for "Magic Wand" tool
export const detectRectFromPoint = (
    img: HTMLImageElement,
    x: number,
    y: number,
    threshold: number = 160
): { x: number, y: number, width: number, height: number } | null => {
    // Search Region of Interest (ROI) to avoid processing full 4K images
    // Centered around the click point
    const roiSize = 1000;
    const sx = Math.max(0, Math.floor(x - roiSize / 2));
    const sy = Math.max(0, Math.floor(y - roiSize / 2));
    const sw = Math.min(img.naturalWidth - sx, roiSize);
    const sh = Math.min(img.naturalHeight - sy, roiSize);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const imgData = ctx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    // Convert global click to ROI local coordinates
    const localX = Math.floor(x - sx);
    const localY = Math.floor(y - sy);

    if (localX < 0 || localX >= sw || localY < 0 || localY >= sh) return null;

    // Helper: is the pixel "background" (light enough)?
    // Returns true if light, false if dark (border)
    const isBackground = (lx: number, ly: number) => {
        if (lx < 0 || ly < 0 || lx >= sw || ly >= sh) return false;
        const idx = (ly * sw + lx) * 4;
        const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        return gray > threshold;
    };

    // If clicked on a dark line, fail immediately
    if (!isBackground(localX, localY)) return null;

    // BFS Flood Fill
    const visited = new Uint8Array(sw * sh); 
    const queue: number[] = [localX, localY];
    let minX = localX, maxX = localX, minY = localY, maxY = localY;
    
    // Safety limit to prevent freezing on huge white areas
    const limitPixels = 200000; 
    let count = 0;

    visited[localY * sw + localX] = 1;

    while (queue.length > 0) {
        const cy = queue.pop()!;
        const cx = queue.pop()!;
        count++;

        if (count > limitPixels) break;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
            cx + 1, cy,
            cx - 1, cy,
            cx, cy + 1,
            cx, cy - 1
        ];

        for (let i = 0; i < neighbors.length; i += 2) {
            const nx = neighbors[i];
            const ny = neighbors[i + 1];

            if (nx >= 0 && nx < sw && ny >= 0 && ny < sh) {
                const idx = ny * sw + nx;
                if (visited[idx] === 0) {
                    if (isBackground(nx, ny)) {
                        visited[idx] = 1;
                        queue.push(nx, ny);
                    } else {
                        // Hit a border pixel (dark), stop expansion here.
                        // Ideally we check if it's a valid edge.
                    }
                }
            }
        }
    }

    // Add padding to include the border width itself
    const padding = 2;
    const finalX = sx + minX - padding;
    const finalY = sy + minY - padding;
    const finalW = (maxX - minX) + (padding * 2);
    const finalH = (maxY - minY) + (padding * 2);

    // Filter out noise / tiny spots
    if (finalW < 10 || finalH < 10) return null;

    return { x: finalX, y: finalY, width: finalW, height: finalH };
};

export const findPeaks = (profile: number[], thresholdRatio = 0.35): number[] => {
    const peaks: number[] = [];
    let inPeak = false;
    let sum = 0; 
    let mass = 0;
    const max = Math.max(...profile);
    const threshold = max * thresholdRatio;
    for (let i = 0; i < profile.length; i++) {
        if (profile[i] > threshold) {
            if (!inPeak) { inPeak = true; sum = 0; mass = 0; }
            sum += i * profile[i]; mass += profile[i];
        } else if (inPeak) {
            inPeak = false;
            if (mass > 0) peaks.push(sum / mass);
        }
    }
    if (inPeak && mass > 0) peaks.push(sum / mass);
    return peaks;
};

export const findNearestAlignedRefArea = (target: Area, candidates: Area[], type: AreaType): Area | undefined => {
    const pageIndex = target.pageIndex || 0;
    const alignedCandidates = candidates.filter(c => c.type === type && (c.pageIndex || 0) === pageIndex);
    if (alignedCandidates.length === 0) return undefined;
    return alignedCandidates.sort((a, b) => {
        if (type === AreaType.MARKSHEET_REF_RIGHT) {
            const vOverlapA = Math.max(0, Math.min(target.y + target.height, a.y + a.height) - Math.max(target.y, a.y));
            const vOverlapB = Math.max(0, Math.min(target.y + target.height, b.y + b.height) - Math.max(target.y, b.y));
            if (vOverlapA > 0 && vOverlapB === 0) return -1;
            if (vOverlapB > 0 && vOverlapA === 0) return 1;
            return (a.x - target.x) - (b.x - target.x);
        } else {
            const hOverlapA = Math.max(0, Math.min(target.x + target.width, a.x + a.width) - Math.max(target.x, a.x));
            const hOverlapB = Math.max(0, Math.min(target.x + target.width, b.x + b.width) - Math.max(target.x, b.x));
            if (hOverlapA > 0 && hOverlapB === 0) return -1;
            if (hOverlapB > 0 && hOverlapA === 0) return 1;
            return (a.y - target.y) - (b.y - target.y);
        }
    })[0];
};

export const analyzeMarkSheetSnippet = async (
    imagePath: string, 
    area: Area, 
    point: Point, 
    sensitivity: number = 1.5,
    refR?: Area, 
    refB?: Area,
    idealCorners?: Corners
): Promise<{ index: number | number[], positions: {x:number,y:number}[] }> => {
    const result = await window.electronAPI.invoke('get-image-details', imagePath);
    if (!result.success || !result.details?.url) return { index: -1, positions: [] };
    
    const img = await loadImage(result.details.url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    
    // Check if alignment is needed
    let finalCtx = ctx;
    let finalCanvas = canvas;
    
    if (idealCorners) {
        const srcCtx = ctx;
        srcCtx.drawImage(img, 0, 0);
        const imageData = srcCtx.getImageData(0, 0, canvas.width, canvas.height);
        const srcCorners = findAlignmentMarks(imageData, { minSize: 8, threshold: 160, padding: 0 });
        
        if (srcCorners) {
            // Create a temporary canvas for the warped version of the entire page
            const warpedCanvas = document.createElement('canvas');
            warpedCanvas.width = img.naturalWidth;
            warpedCanvas.height = img.naturalHeight;
            const warpedCtx = warpedCanvas.getContext('2d')!;
            
            // Warp the entire image so it matches the template coordinate system
            const warpUrl = warpArea(img, img.naturalWidth, img.naturalHeight, srcCorners, idealCorners, { 
                x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight 
            });
            const warpedImg = await loadImage(warpUrl);
            warpedCtx.drawImage(warpedImg, 0, 0);
            
            finalCanvas = warpedCanvas;
            finalCtx = warpedCtx;
        } else {
            finalCtx.drawImage(img, 0, 0);
        }
    } else {
        finalCtx.drawImage(img, 0, 0);
    }

    const fillGrayThreshold = Math.floor(255 / sensitivity);
    const fillRatioThreshold = 0.20 + (sensitivity - 1.1) * 0.1;

    const getProj = (a: Area, dir: 'x' | 'y') => {
        const sx = Math.floor(a.x); const sy = Math.floor(a.y);
        const sw = Math.floor(a.width); const sh = Math.floor(a.height);
        if (sw <= 0 || sh <= 0) return [];
        const data = finalCtx.getImageData(sx, sy, sw, sh).data;
        const size = dir === 'x' ? sw : sh;
        const profile = new Array(size).fill(0);
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const idx = (y * sw + x) * 4;
                if ((0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2]) < 160) {
                    if (dir === 'x') profile[x]++; else profile[y]++;
                }
            }
        }
        return profile;
    };

    let options = point.markSheetOptions || 4;
    const isH = point.markSheetLayout === 'horizontal';
    let rows: number[] = [], cols: number[] = [];

    if (isH) {
        rows = [area.y + area.height / 2];
        if (refB) {
            const peaks = findPeaks(getProj(refB, 'x'));
            if (peaks.length > 0) { cols = peaks.map(px => refB.x + px); options = cols.length; }
        }
        if (cols.length === 0) for(let i=0; i<options; i++) cols.push(area.x + (area.width/options) * (i+0.5));
    } else {
        cols = [area.x + area.width / 2];
        if (refR) {
            const peaks = findPeaks(getProj(refR, 'y'));
            if (peaks.length > 0) { rows = peaks.map(py => refR.y + py); options = rows.length; }
        }
        if (rows.length === 0) for(let i=0; i<options; i++) rows.push(area.y + (area.height/options) * (i+0.5));
    }

    const pos: {x:number,y:number}[] = [];
    const marks: number[] = [];
    const roi = 14;

    for (let i = 0; i < options; i++) {
        const cx = isH ? cols[i] : cols[0];
        const cy = isH ? rows[0] : rows[i];
        pos.push({ x: cx, y: cy });
        
        let darkCount = 0;
        const data = finalCtx.getImageData(cx - roi/2, cy - roi/2, roi, roi).data;
        for(let k=0; k<data.length; k+=4) {
            const gray = (0.299*data[k]+0.587*data[k+1]+0.114*data[k+2]);
            if(gray < fillGrayThreshold) darkCount++;
        }
        const ratio = darkCount / (roi * roi);
        if (ratio > fillRatioThreshold) marks.push(i);
    }

    return { 
        index: marks.length === 1 ? marks[0] : marks.length > 1 ? marks : -1, 
        positions: pos 
    };
};

const getHomographyMatrix = (src: PointCoord[], dst: PointCoord[]): number[][] => {
    const P: number[][] = [];
    for (let i = 0; i < 4; i++) {
        const x = src[i].x; const y = src[i].y;
        const u = dst[i].x; const v = dst[i].y;
        P.push([-x, -y, -1, 0, 0, 0, x * u, y * u, u]);
        P.push([0, 0, 0, -x, -y, -1, x * v, y * v, v]);
    }
    const N = 8;
    for (let i = 0; i < N; i++) {
        let maxRow = i;
        for (let j = i + 1; j < N; j++) if (Math.abs(P[j][i]) > Math.abs(P[maxRow][i])) maxRow = j;
        [P[i], P[maxRow]] = [P[maxRow], P[i]];
        const pivot = P[i][i];
        if (Math.abs(pivot) < 1e-8) continue;
        for (let j = i; j < 9; j++) P[i][j] /= pivot;
        for (let k = 0; k < N; k++) if (k !== i) {
            const factor = P[k][i];
            for (let j = i; j < 9; j++) P[k][j] -= factor * P[i][j];
        }
    }
    const h = Array(9).fill(0);
    for (let i = 0; i < N; i++) h[i] = P[i][8];
    h[8] = 1;
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], h[8]]];
};

const sourceImageDataCache = new WeakMap<HTMLImageElement, Uint8ClampedArray>();

export const warpArea = (
    srcImage: HTMLImageElement,
    srcImageWidth: number,
    srcImageHeight: number,
    srcCorners: Corners,
    idealCorners: Corners,
    targetArea: { x: number, y: number, width: number, height: number }
): string => {
    const idealPts = [idealCorners.tl, idealCorners.tr, idealCorners.br, idealCorners.bl];
    const srcPts = [srcCorners.tl, srcCorners.tr, srcCorners.br, srcCorners.bl];
    const H = getHomographyMatrix(idealPts, srcPts);
    const w = Math.floor(targetArea.width);
    const h = Math.floor(targetArea.height);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const destData = ctx.createImageData(w, h);
    let srcData = sourceImageDataCache.get(srcImage);
    if (!srcData) {
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = srcImageWidth; srcCanvas.height = srcImageHeight;
        const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
        srcCtx.drawImage(srcImage, 0, 0);
        srcData = srcCtx.getImageData(0, 0, srcImageWidth, srcImageHeight).data;
        sourceImageDataCache.set(srcImage, srcData);
    }
    const h00 = H[0][0], h01 = H[0][1], h02 = H[0][2];
    const h10 = H[1][0], h11 = H[1][1], h12 = H[1][2];
    const h20 = H[2][0], h21 = H[2][1], h22 = H[2][2];
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const tx = targetArea.x + dx;
            const ty = targetArea.y + dy;
            const denom = h20 * tx + h21 * ty + h22;
            const sx = (h00 * tx + h01 * ty + h02) / denom;
            const sy = (h10 * tx + h11 * ty + h12) / denom;
            const srcX = Math.round(sx); const srcY = Math.round(sy);
            const destIdx = (dy * w + dx) * 4;
            if (srcX >= 0 && srcX < srcImageWidth && srcY >= 0 && srcY < srcImageHeight) {
                const srcIdx = (srcY * srcImageWidth + srcX) * 4;
                destData.data[destIdx] = srcData[srcIdx];
                destData.data[destIdx + 1] = srcData[srcIdx + 1];
                destData.data[destIdx + 2] = srcData[srcIdx + 2];
                destData.data[destIdx + 3] = srcData[srcIdx + 3];
            } else {
                destData.data[destIdx + 3] = 0;
            }
        }
    }
    ctx.putImageData(destData, 0, 0);
    return canvas.toDataURL();
};

export const detectAndWarpCrop = async (
    img: HTMLImageElement,
    idealCorners: Corners,
    targetArea: { x: number, y: number, width: number, height: number },
    cachedCorners?: Corners
): Promise<{ url: string | null, corners?: Corners }> => {
    let srcCorners = cachedCorners;
    if (!srcCorners) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { url: null };
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = findAlignmentMarks(imageData, { minSize: 8, threshold: 160, padding: 0 });
        if (found) srcCorners = found;
    }
    if (srcCorners) {
        const url = warpArea(img, img.naturalWidth, img.naturalHeight, srcCorners, idealCorners, targetArea);
        return { url, corners: srcCorners };
    }
    return { url: null };
};
