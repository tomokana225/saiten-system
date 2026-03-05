
import * as pdfjsLib from 'pdfjs-dist';
import { Area, Point, AreaType } from './types';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://aistudiocdn.com/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
}

export const toHalfWidth = (str: string): string => {
    return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
};

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
    settings: { minSize: number, threshold: number, padding: number } = { minSize: 10, threshold: 160, padding: 0 },
    searchZones?: { tl: Area; tr: Area; br: Area; bl: Area }
): Corners | null => {
    const { data, width, height } = imageData;
    
    // If search zones are provided, use them. Otherwise use the default corner search.
    const getZone = (type: 'tl' | 'tr' | 'br' | 'bl', useSearchZones: boolean) => {
        if (useSearchZones && searchZones && searchZones[type]) {
            const zone = searchZones[type];
            // Increased margin to 30% to handle larger shifts/tilts
            const margin = Math.max(50, Math.min(width, height) * 0.30);
            return {
                x1: Math.max(0, Math.floor(zone.x - margin)),
                y1: Math.max(0, Math.floor(zone.y - margin)),
                x2: Math.min(width, Math.ceil(zone.x + zone.width + margin)),
                y2: Math.min(height, Math.ceil(zone.y + zone.height + margin)),
                tx: zone.x + zone.width / 2,
                ty: zone.y + zone.height / 2
            };
        }
        
        const searchRange = 0.35; // 35% range
        const cornerW = Math.floor(width * searchRange);
        const cornerH = Math.floor(height * searchRange);
        
        switch(type) {
            case 'tl': return { x1: 0, y1: 0, x2: cornerW, y2: cornerH, tx: 0, ty: 0 };
            case 'tr': return { x1: width - cornerW, y1: 0, x2: width, y2: cornerH, tx: width, ty: 0 };
            case 'br': return { x1: width - cornerW, y1: height - cornerH, x2: width, y2: height, tx: width, ty: height };
            case 'bl': return { x1: 0, y1: height - cornerH, x2: cornerW, y2: height, tx: 0, ty: height };
        }
    };

    const findBestCentroid = (startX: number, startY: number, endX: number, endY: number, targetX: number, targetY: number, threshold: number): PointCoord | null => {
        const visited = new Uint8Array((endX - startX) * (endY - startY));
        let bestCandidate: { centroid: PointCoord, distSq: number, weight: number } | null = null;
        const minArea = settings.minSize * settings.minSize;

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const vIdx = (y - startY) * (endX - startX) + (x - startX);
                if (visited[vIdx]) continue;

                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

                if (gray < threshold) {
                    let sumX = 0, sumY = 0, count = 0, totalWeight = 0;
                    let minX = x, maxX = x, minY = y, maxY = y;
                    const stack = [[x, y]];
                    visited[vIdx] = 1;

                    while (stack.length > 0) {
                        const [cx, cy] = stack.pop()!;
                        const cIdx = (cy * width + cx) * 4;
                        const cGray = 0.299 * data[cIdx] + 0.587 * data[cIdx + 1] + 0.114 * data[cIdx + 2];
                        
                        // Weighted centroid: darker pixels have more influence
                        const weight = (255 - cGray) / 255;
                        sumX += cx * weight; 
                        sumY += cy * weight; 
                        totalWeight += weight;
                        count++;

                        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
                        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;

                        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
                        for (const [nx, ny] of neighbors) {
                            if (nx >= startX && nx < endX && ny >= startY && ny < endY) {
                                const nvIdx = (ny - startY) * (endX - startX) + (nx - startX);
                                if (!visited[nvIdx]) {
                                    const nIdx = (ny * width + nx) * 4;
                                    const nGray = 0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2];
                                    if (nGray < threshold) {
                                        visited[nvIdx] = 1;
                                        stack.push([nx, ny]);
                                    }
                                }
                            }
                        }
                        if (count > 20000) break; // Increased safety limit
                    }

                    const blobW = maxX - minX + 1;
                    const blobH = maxY - minY + 1;
                    const aspectRatio = Math.max(blobW, blobH) / Math.min(blobW, blobH);

                    // Relaxed criteria for detection
                    const adjustedMinArea = threshold > 180 ? minArea * 0.3 : minArea * 0.5;

                    if (count >= adjustedMinArea && count < (width * height * 0.1) && aspectRatio < 8) {
                        const centroid = { x: sumX / totalWeight, y: sumY / totalWeight };
                        const distSq = Math.pow(centroid.x - targetX, 2) + Math.pow(centroid.y - targetY, 2);
                        // Prefer darker blobs (higher totalWeight) if distance is similar
                        const score = distSq / (totalWeight * 0.1 + 1); 
                        if (!bestCandidate || score < bestCandidate.distSq) {
                            bestCandidate = { centroid, distSq: score, weight: totalWeight };
                        }
                    }
                }
            }
        }
        return bestCandidate ? bestCandidate.centroid : null;
    };

    // Try even more thresholds if the primary one fails
    const thresholdsToTry = [settings.threshold, 140, 180, 120, 200, 220, 100, 80, 240];
    
    // First pass: try with searchZones if available
    if (searchZones) {
        for (const threshold of thresholdsToTry) {
            const zTL = getZone('tl', true);
            const zTR = getZone('tr', true);
            const zBR = getZone('br', true);
            const zBL = getZone('bl', true);

            const tl = findBestCentroid(zTL.x1, zTL.y1, zTL.x2, zTL.y2, zTL.tx, zTL.ty, threshold);
            const tr = findBestCentroid(zTR.x1, zTR.y1, zTR.x2, zTR.y2, zTR.tx, zTR.ty, threshold);
            const br = findBestCentroid(zBR.x1, zBR.y1, zBR.x2, zBR.y2, zBR.tx, zBR.ty, threshold);
            const bl = findBestCentroid(zBL.x1, zBL.y1, zBL.x2, zBL.y2, zBL.tx, zBL.ty, threshold);

            if (tl && tr && br && bl) return { tl, tr, br, bl };
        }
    }

    // Second pass: fallback to default corner search (ignore searchZones)
    // This handles cases where the image is shifted significantly outside the expected zones
    for (const threshold of thresholdsToTry) {
        const zTL = getZone('tl', false);
        const zTR = getZone('tr', false);
        const zBR = getZone('br', false);
        const zBL = getZone('bl', false);

        const tl = findBestCentroid(zTL.x1, zTL.y1, zTL.x2, zTL.y2, zTL.tx, zTL.ty, threshold);
        const tr = findBestCentroid(zTR.x1, zTR.y1, zTR.x2, zTR.y2, zTR.tx, zTR.ty, threshold);
        const br = findBestCentroid(zBR.x1, zBR.y1, zBR.x2, zBR.y2, zBR.tx, zBR.ty, threshold);
        const bl = findBestCentroid(zBL.x1, zBL.y1, zBL.x2, zBL.y2, zBL.tx, zBL.ty, threshold);

        if (tl && tr && br && bl) return { tl, tr, br, bl };
    }

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
    let imgUrl = imagePath;
    if (!imagePath.startsWith('data:') && !imagePath.startsWith('blob:')) {
        const result = await window.electronAPI.invoke('get-image-details', imagePath);
        if (!result.success || !result.details?.url) return { index: -1, positions: [] };
        imgUrl = result.details.url;
    }
    const img = await loadImage(imgUrl);
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
    const roi = 20; // Increased ROI for better robustness

    for (let i = 0; i < options; i++) {
        const cx = isH ? cols[i] : cols[0];
        const cy = isH ? rows[0] : rows[i];
        pos.push({ x: cx, y: cy });
        
        let darkCount = 0;
        // Ensure we don't go out of bounds
        const startX = Math.max(0, Math.floor(cx - roi/2));
        const startY = Math.max(0, Math.floor(cy - roi/2));
        const actualRoiW = Math.min(roi, finalCanvas.width - startX);
        const actualRoiH = Math.min(roi, finalCanvas.height - startY);
        
        if (actualRoiW <= 0 || actualRoiH <= 0) continue;

        const data = finalCtx.getImageData(startX, startY, actualRoiW, actualRoiH).data;
        for(let k=0; k<data.length; k+=4) {
            const gray = (0.299*data[k]+0.587*data[k+1]+0.114*data[k+2]);
            if(gray < fillGrayThreshold) darkCount++;
        }
        const ratio = darkCount / (actualRoiW * actualRoiH);
        
        // Slightly more lenient threshold for warped images
        const adjustedFillRatioThreshold = idealCorners ? fillRatioThreshold * 0.85 : fillRatioThreshold;
        
        if (ratio > adjustedFillRatioThreshold) marks.push(i);
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
        // Standard homography equations:
        // u = (h00*x + h01*y + h02) / (h20*x + h21*y + 1)
        // v = (h10*x + h11*y + h12) / (h20*x + h21*y + 1)
        P.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
        P.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    const N = 8;
    for (let i = 0; i < N; i++) {
        let maxRow = i;
        for (let j = i + 1; j < N; j++) if (Math.abs(P[j][i]) > Math.abs(P[maxRow][i])) maxRow = j;
        [P[i], P[maxRow]] = [P[maxRow], P[i]];
        const pivot = P[i][i];
        if (Math.abs(pivot) < 1e-10) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        for (let j = i; j < 9; j++) P[i][j] /= pivot;
        for (let k = 0; k < N; k++) if (k !== i) {
            const factor = P[k][i];
            for (let j = i; j < 9; j++) P[k][j] -= factor * P[i][j];
        }
    }
    const h = P.map(row => row[8]);
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
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
    // Validation logs
    // console.log("warpArea input:", { srcCorners, idealCorners, targetArea });

    const idealPts = [idealCorners.tl, idealCorners.tr, idealCorners.br, idealCorners.bl];
    const srcPts = [srcCorners.tl, srcCorners.tr, srcCorners.br, srcCorners.bl];
    
    // The original code used getHomographyMatrix(idealPts, srcPts).
    // Let's revert to that and see if the issue is elsewhere.
    const H = getHomographyMatrix(idealPts, srcPts);
    
    // Check for invalid matrix
    if (H.flat().some(v => isNaN(v) || !isFinite(v))) {
        console.error("warpArea: Invalid Homography Matrix calculated", H);
        return srcImage.src; // Fallback to original (or empty?)
    }

    const w = Math.floor(targetArea.width);
    const h = Math.floor(targetArea.height);
    
    if (w <= 0 || h <= 0) {
        console.error("warpArea: Invalid target dimensions", { w, h });
        return "";
    }

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
    
    let validPixels = 0;

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            // tx, ty are coordinates in the IDEAL (template) space
            const tx = targetArea.x + dx;
            const ty = targetArea.y + dy;
            
            // Map ideal coordinates back to the scanned image coordinates
            const denom = h20 * tx + h21 * ty + h22;
            
            // Avoid division by zero
            if (Math.abs(denom) < 1e-10) continue;

            const sx = (h00 * tx + h01 * ty + h02) / denom;
            const sy = (h10 * tx + h11 * ty + h12) / denom;
            
            const destIdx = (dy * w + dx) * 4;
            
            // Check if the mapped source coordinate is within the bounds of the scanned image
            if (sx >= 0 && sx < srcImageWidth - 1 && sy >= 0 && sy < srcImageHeight - 1) {
                // Bilinear Interpolation for smoother tilted images
                const x0 = Math.floor(sx);
                const x1 = x0 + 1;
                const y0 = Math.floor(sy);
                const y1 = y0 + 1;
                
                const dx1 = sx - x0;
                const dy1 = sy - y0;
                const dx0 = 1 - dx1;
                const dy0 = 1 - dy1;
                
                const idx00 = (y0 * srcImageWidth + x0) * 4;
                const idx10 = (y0 * srcImageWidth + x1) * 4;
                const idx01 = (y1 * srcImageWidth + x0) * 4;
                const idx11 = (y1 * srcImageWidth + x1) * 4;
                
                for (let c = 0; c < 4; c++) {
                    destData.data[destIdx + c] = 
                        srcData[idx00 + c] * dx0 * dy0 +
                        srcData[idx10 + c] * dx1 * dy0 +
                        srcData[idx01 + c] * dx0 * dy1 +
                        srcData[idx11 + c] * dx1 * dy1;
                }
                // Force alpha to 255 if it's somehow getting zeroed out by interpolation
                destData.data[destIdx + 3] = 255;
                validPixels++;
            } else {
                // Pixel is outside the scanned image, make it transparent
                destData.data[destIdx + 0] = 0;
                destData.data[destIdx + 1] = 0;
                destData.data[destIdx + 2] = 0;
                destData.data[destIdx + 3] = 0;
            }
        }
    }
    
    if (validPixels === 0) {
        console.warn("warpArea: Result image is completely empty/transparent. Check alignment coordinates.", {
            targetArea,
            srcImageSize: { w: srcImageWidth, h: srcImageHeight },
            H,
            srcCorners,
            idealCorners
        });
        return ""; // Return empty string to signal failure
    }

    ctx.putImageData(destData, 0, 0);
    return canvas.toDataURL();
};

export const detectAndWarpCrop = async (
    img: HTMLImageElement,
    idealCorners: Corners,
    targetArea: { x: number, y: number, width: number, height: number },
    cachedCorners?: Corners,
    settings?: { minSize: number, threshold: number, padding: number },
    searchZones?: { tl: Area; tr: Area; br: Area; bl: Area }
): Promise<{ url: string | null, corners?: Corners }> => {
    let srcCorners = cachedCorners;
    if (!srcCorners) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { url: null };
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = findAlignmentMarks(imageData, settings, searchZones);
        if (found) srcCorners = found;
    }
    if (srcCorners) {
        const url = warpArea(img, img.naturalWidth, img.naturalHeight, srcCorners, idealCorners, targetArea);
        return { url, corners: srcCorners };
    }
    return { url: null };
};
