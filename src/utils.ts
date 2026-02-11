
import * as pdfjsLib from 'pdfjs-dist';

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
        img.crossOrigin = "Anonymous";
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

interface Point { x: number; y: number; }
interface Corners { tl: Point; tr: Point; br: Point; bl: Point; }

/**
 * Finds alignment marks by looking for the outermost dark blobs in each corner quadrant.
 */
export const findAlignmentMarks = (
    imageData: ImageData, 
    settings: { minSize: number, threshold: number, padding: number } = { minSize: 10, threshold: 160, padding: 0 }
): Corners | null => {
    const { data, width, height } = imageData;
    const searchRange = 0.20; // Search within outer 20% of page
    const cornerW = Math.floor(width * searchRange);
    const cornerH = Math.floor(height * searchRange);

    const findBestCentroid = (startX: number, startY: number, endX: number, endY: number, targetX: number, targetY: number): Point | null => {
        const visited = new Uint8Array((endX - startX) * (endY - startY));
        let bestCandidate: { centroid: Point, distSq: number } | null = null;

        const minArea = settings.minSize * settings.minSize;
        const threshold = settings.threshold;

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const vIdx = (y - startY) * (endX - startX) + (x - startX);
                if (visited[vIdx]) continue;

                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

                if (gray < threshold) {
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
                                    if (nGray < threshold) {
                                        visited[nvIdx] = 1;
                                        stack.push([nx, ny]);
                                    }
                                }
                            }
                        }
                        if (count > 5000) break; // Blob too large
                    }

                    const blobW = maxX - minX + 1;
                    const blobH = maxY - minY + 1;
                    const aspectRatio = Math.max(blobW, blobH) / Math.min(blobW, blobH);

                    // Filters: Minimum size, not too thin (like a line), not too huge
                    if (count >= minArea && count < (width * height * 0.05) && aspectRatio < 2.5) {
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

// HOMOGRAPHY / WARP Logic (Unchanged but ensuring efficiency)
const getHomographyMatrix = (src: Point[], dst: Point[]): number[][] => {
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
