
// This file contains utility functions used across the application,
// including file handling and advanced image processing.
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://aistudiocdn.com/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
}

/**
 * Reads a File object and converts it into an ArrayBuffer.
 */
export const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

/**
 * Loads an image from a given source (URL, data URL, or file path).
 */
export const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};

/**
 * Converts a File (Image or PDF) into an array of image data URLs.
 */
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

            await page.render({
                canvasContext: context!,
                viewport: viewport
            } as any).promise;

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
 * Finds the four corner alignment marks (fiducial markers) in an image.
 * Enhanced to detect smaller marks more reliably.
 */
export const findAlignmentMarks = (imageData: ImageData): Corners | null => {
    const { data, width, height } = imageData;
    // Increase search area to 30% of width/height to handle significant shifts
    const cornerSizeW = Math.floor(width * 0.30);
    const cornerSizeH = Math.floor(height * 0.30);

    const getCornerCentroid = (startX: number, startY: number, endX: number, endY: number, label: string): Point | null => {
        let totalBrightness = 0;
        let pixelCount = 0;

        // Sampling to determine background brightness in the corner
        for (let y = startY; y < endY; y += 8) {
            for (let x = startX; x < endX; x += 8) {
                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                totalBrightness += gray;
                pixelCount++;
            }
        }
        
        if (pixelCount === 0) return null;
        const avgBrightness = totalBrightness / pixelCount;
        // Use a dynamic threshold based on background brightness
        // Marks are expected to be significantly darker than the paper
        const threshold = Math.min(120, avgBrightness * 0.6);

        let maxBlob = { size: 0, sumX: 0, sumY: 0 };
        const cornerW = endX - startX;
        const visited = new Uint8Array(cornerW * (endY - startY));

        const getVisited = (x: number, y: number) => visited[(y - startY) * cornerW + (x - startX)];
        const setVisited = (x: number, y: number) => visited[(y - startY) * cornerW + (x - startX)] = 1;

        // Lower minBlobSize to detect smaller marks (e.g. 10x10 pixels)
        // Set an absolute minimum of 9 pixels (3x3 area)
        const minBlobSize = Math.max(9, (width * height) * 0.000005); 
        const maxBlobSize = (width * height) * 0.02; // Ignore too large blobs (borders, etc.)

        for (let y = startY; y < endY; y += 1) {
            for (let x = startX; x < endX; x += 1) {
                if (getVisited(x, y)) continue;

                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

                if (gray < threshold) {
                    let currentSize = 0;
                    let currentSumX = 0;
                    let currentSumY = 0;
                    const stack = [[x, y]];
                    setVisited(x, y);

                    while (stack.length > 0) {
                        const [cx, cy] = stack.pop()!;
                        currentSize++;
                        currentSumX += cx;
                        currentSumY += cy;

                        // 4-neighbor connectivity
                        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
                        for (const [nx, ny] of neighbors) {
                            if (nx >= startX && nx < endX && ny >= startY && ny < endY && !getVisited(nx, ny)) {
                                const nIdx = (ny * width + nx) * 4;
                                const nGray = 0.299 * data[nIdx] + 0.587 * data[nIdx + 1] + 0.114 * data[nIdx + 2];
                                if (nGray < threshold) {
                                    setVisited(nx, ny);
                                    stack.push([nx, ny]);
                                }
                            }
                        }
                        // Limit stack size to prevent crashes on extremely large noisy areas
                        if (currentSize > maxBlobSize) break;
                    }

                    if (currentSize > maxBlob.size && currentSize > minBlobSize && currentSize < maxBlobSize) {
                        maxBlob = { size: currentSize, sumX: currentSumX, sumY: currentSumY };
                    }
                }
            }
        }

        if (maxBlob.size > 0) {
            return { x: maxBlob.sumX / maxBlob.size, y: maxBlob.sumY / maxBlob.size };
        }
        return null;
    };

    const tl = getCornerCentroid(0, 0, cornerSizeW, cornerSizeH, 'TL');
    const tr = getCornerCentroid(width - cornerSizeW, 0, width, cornerSizeH, 'TR');
    const br = getCornerCentroid(width - cornerSizeW, height - cornerSizeH, width, height, 'BR');
    const bl = getCornerCentroid(0, height - cornerSizeH, cornerSizeW, height, 'BL');

    if (tl && tr && br && bl) return { tl, tr, br, bl };
    return null;
};

// --- Perspective Transformation Utilities ---

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

// Cache to store pixel data of the full source image to avoid redundant getImageData calls
const sourceImageDataCache = new WeakMap<HTMLImageElement, Uint8ClampedArray>();

/**
 * Extracts a specific area from a source image, applying the perspective transform.
 */
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
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const destData = ctx.createImageData(w, h);

    // Reuse or create pixel data cache
    let srcData = sourceImageDataCache.get(srcImage);
    if (!srcData) {
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = srcImageWidth;
        srcCanvas.height = srcImageHeight;
        const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
        srcCtx.drawImage(srcImage, 0, 0);
        srcData = srcCtx.getImageData(0, 0, srcImageWidth, srcImageHeight).data;
        sourceImageDataCache.set(srcImage, srcData);
    }

    const h00 = H[0][0], h01 = H[0][1], h02 = H[0][2];
    const h10 = H[1][0], h11 = H[1][1], h12 = H[1][2];
    const h20 = H[2][0], h21 = H[2][1], h22 = H[2][2];
    const areaX = targetArea.x;
    const areaY = targetArea.y;

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const tx = areaX + dx;
            const ty = areaY + dy;
            const denom = h20 * tx + h21 * ty + h22;
            const sx = (h00 * tx + h01 * ty + h02) / denom;
            const sy = (h10 * tx + h11 * ty + h12) / denom;

            const srcX = Math.round(sx);
            const srcY = Math.round(sy);
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

/**
 * Detects alignment marks and returns a warped crop of the target area.
 */
export const detectAndWarpCrop = async (
    img: HTMLImageElement,
    idealCorners: Corners,
    targetArea: { x: number, y: number, width: number, height: number },
    cachedCorners?: Corners
): Promise<{ url: string | null, corners?: Corners }> => {
    let srcCorners = cachedCorners;
    
    if (!srcCorners) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { url: null };
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = findAlignmentMarks(imageData);
        if (found) srcCorners = found;
    }

    if (srcCorners) {
        const url = warpArea(img, img.naturalWidth, img.naturalHeight, srcCorners, idealCorners, targetArea);
        return { url, corners: srcCorners };
    }

    return { url: null };
};
