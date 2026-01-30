// This file contains utility functions used across the application,
// including file handling and advanced image processing.
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://aistudiocdn.com/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
}

/**
 * Reads a File object and converts it into an ArrayBuffer.
 * @param file The file to read.
 * @returns A promise that resolves with the ArrayBuffer.
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
 * @param src The source of the image.
 * @returns A promise that resolves with the HTMLImageElement.
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
 * If image, returns [dataUrl]. If PDF, returns [page1DataUrl, page2DataUrl...].
 */
export const convertFileToImages = async (file: File): Promise<string[]> => {
    if (file.type === 'application/pdf') {
        const arrayBuffer = await fileToArrayBuffer(file);
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const images: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); // High quality scale
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
        // Assume image
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
 * Improves robustness by using adaptive thresholding and centroid calculation.
 * @param imageData The ImageData object of the image to analyze.
 * @returns An object with the coordinates of the four corners, or null if not found.
 */
export const findAlignmentMarks = (imageData: ImageData): Corners | null => {
    const { data, width, height } = imageData;
    // Scan larger area (25%) to ensure marks are caught even if slightly offset
    const cornerSizeW = Math.floor(width * 0.25);
    const cornerSizeH = Math.floor(height * 0.25);

    const getCornerCentroid = (startX: number, startY: number, endX: number, endY: number): Point | null => {
        let totalBrightness = 0;
        let pixelCount = 0;

        // 1. Calculate local average brightness to determine adaptive threshold
        // Sampling every 4th pixel for speed
        for (let y = startY; y < endY; y += 4) {
            for (let x = startX; x < endX; x += 4) {
                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                totalBrightness += gray;
                pixelCount++;
            }
        }
        
        if (pixelCount === 0) return null;
        const avgBrightness = totalBrightness / pixelCount;
        // Threshold: pixels significantly darker than average (e.g., 70% of average)
        const threshold = avgBrightness * 0.7;

        // 2. Find the largest connected component (blob) of dark pixels
        let maxBlob = { size: 0, sumX: 0, sumY: 0 };
        const visited = new Uint8Array((endX - startX) * (endY - startY)); // 0: unvisited, 1: visited

        const getVisited = (x: number, y: number) => visited[(y - startY) * (endX - startX) + (x - startX)];
        const setVisited = (x: number, y: number) => visited[(y - startY) * (endX - startX) + (x - startX)] = 1;

        // We assume the alignment mark is somewhat significant in size
        const minBlobSize = (cornerSizeW * cornerSizeH) * 0.001; // 0.1% of area

        for (let y = startY; y < endY; y += 2) {
            for (let x = startX; x < endX; x += 2) {
                if (getVisited(x, y)) continue;

                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

                if (gray < threshold) {
                    // Start BFS for blob
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

                        // Check neighbors (4-connectivity)
                        const neighbors = [
                            [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
                        ];

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
                    }

                    if (currentSize > maxBlob.size && currentSize > minBlobSize) {
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

    const tl = getCornerCentroid(0, 0, cornerSizeW, cornerSizeH);
    const tr = getCornerCentroid(width - cornerSizeW, 0, width, cornerSizeH);
    const br = getCornerCentroid(width - cornerSizeW, height - cornerSizeH, width, height);
    const bl = getCornerCentroid(0, height - cornerSizeH, cornerSizeW, height);

    if (tl && tr && br && bl) {
        return { tl, tr, br, bl };
    }
    return null;
};

// --- Perspective Transformation Utilities ---

// Calculates the 3x3 homography matrix that maps srcPoints to dstPoints
const getHomographyMatrix = (src: Point[], dst: Point[]): number[][] => {
    const P: number[][] = [];
    for (let i = 0; i < 4; i++) {
        const x = src[i].x;
        const y = src[i].y;
        const u = dst[i].x;
        const v = dst[i].y;
        P.push([-x, -y, -1, 0, 0, 0, x * u, y * u, u]);
        P.push([0, 0, 0, -x, -y, -1, x * v, y * v, v]);
    }

    // Gaussian elimination to solve Ph = 0
    // We are solving for 8 unknowns (h33 = 1)
    const N = 8;
    for (let i = 0; i < N; i++) {
        let maxRow = i;
        for (let j = i + 1; j < N; j++) {
            if (Math.abs(P[j][i]) > Math.abs(P[maxRow][i])) maxRow = j;
        }
        [P[i], P[maxRow]] = [P[maxRow], P[i]];

        // Make P[i][i] == 1
        const pivot = P[i][i];
        if (Math.abs(pivot) < 1e-8) continue; // Singular?

        for (let j = i; j < 9; j++) P[i][j] /= pivot;

        for (let k = 0; k < N; k++) {
            if (k !== i) {
                const factor = P[k][i];
                for (let j = i; j < 9; j++) P[k][j] -= factor * P[i][j];
            }
        }
    }

    const h = Array(9).fill(0);
    for (let i = 0; i < N; i++) h[i] = P[i][8];
    h[8] = 1;

    return [
        [h[0], h[1], h[2]],
        [h[3], h[4], h[5]],
        [h[6], h[7], h[8]]
    ];
};

// Applies homography matrix to a point
const transformPoint = (p: Point, H: number[][]): Point => {
    const x = p.x, y = p.y;
    const denom = H[2][0] * x + H[2][1] * y + H[2][2];
    return {
        x: (H[0][0] * x + H[0][1] * y + H[0][2]) / denom,
        y: (H[1][0] * x + H[1][1] * y + H[1][2]) / denom
    };
};

/**
 * Extracts a specific area from a source image, applying the perspective transform
 * calculated from finding marks. 
 * Instead of warping the whole image (slow), we inversely map the pixels of the target area
 * back to the source image (fast for small areas).
 */
export const warpArea = (
    srcImage: HTMLImageElement,
    srcImageWidth: number,
    srcImageHeight: number,
    srcCorners: Corners, // Where marks ARE (on student image)
    idealCorners: Corners, // Where marks SHOULD BE (on template)
    targetArea: { x: number, y: number, width: number, height: number }
): string => {
    // 1. Calculate Matrix: Maps Ideal -> Actual (Student Image)
    // We want to know: "For pixel (x,y) in the ideal answer box, where is it on the scanned image?"
    // So we map Ideal -> Actual.
    const idealPts = [idealCorners.tl, idealCorners.tr, idealCorners.br, idealCorners.bl];
    const srcPts = [srcCorners.tl, srcCorners.tr, srcCorners.br, srcCorners.bl];
    
    const H = getHomographyMatrix(idealPts, srcPts);

    // 2. Setup Canvas for result
    const canvas = document.createElement('canvas');
    canvas.width = targetArea.width;
    canvas.height = targetArea.height;
    const ctx = canvas.getContext('2d')!;
    const destData = ctx.createImageData(canvas.width, canvas.height);

    // 3. Draw source image to canvas to get pixel data (or use cached canvas if possible, but keeping it robust here)
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcImageWidth;
    srcCanvas.height = srcImageHeight;
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.drawImage(srcImage, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, srcImageWidth, srcImageHeight).data;

    // 4. Inverse mapping: Loop through destination pixels (target area)
    // For each pixel (dx, dy) in target area:
    //   Real Template Coord = (targetArea.x + dx, targetArea.y + dy)
    //   Source Coord = H * Real Template Coord
    //   Sample color from Source Coord
    
    const w = canvas.width;
    const h = canvas.height;
    
    // Optimization variables
    const h00 = H[0][0], h01 = H[0][1], h02 = H[0][2];
    const h10 = H[1][0], h11 = H[1][1], h12 = H[1][2];
    const h20 = H[2][0], h21 = H[2][1], h22 = H[2][2];
    const areaX = targetArea.x;
    const areaY = targetArea.y;

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            // Coordinate in "Ideal Template Space"
            const tx = areaX + dx;
            const ty = areaY + dy;

            // Map to "Actual Source Image Space"
            const denom = h20 * tx + h21 * ty + h22;
            const sx = (h00 * tx + h01 * ty + h02) / denom;
            const sy = (h10 * tx + h11 * ty + h12) / denom;

            // Nearest Neighbor sampling (could be Bilinear for better quality)
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
                // Transparent if out of bounds
                destData.data[destIdx + 3] = 0;
            }
        }
    }

    ctx.putImageData(destData, 0, 0);
    return canvas.toDataURL();
};

/**
 * Legacy whole-image transform (kept for compatibility or specific full-page use cases)
 */
export const perspectiveTransform = (
    image: HTMLImageElement,
    srcCorners: Corners,
    destCorners: Corners,
    width: number,
    height: number
): string => {
    // This transforms the WHOLE image based on source corners -> dest corners
    // Effectively used for "Scanning" a full page document rectification
    const srcPts = [srcCorners.tl, srcCorners.tr, srcCorners.br, srcCorners.bl];
    const dstPts = [destCorners.tl, destCorners.tr, destCorners.br, destCorners.bl];
    
    // We want output (dest) -> input (src) mapping for pixel filling
    const H = getHomographyMatrix(dstPts, srcPts);
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = image.naturalWidth;
    srcCanvas.height = image.naturalHeight;
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.drawImage(image, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
    
    const destData = ctx.createImageData(width, height);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const denom = H[2][0] * x + H[2][1] * y + H[2][2];
            const srcX = (H[0][0] * x + H[0][1] * y + H[0][2]) / denom;
            const srcY = (H[1][0] * x + H[1][1] * y + H[1][2]) / denom;

            if (srcX >= 0 && srcX < image.naturalWidth && srcY >= 0 && srcY < image.naturalHeight) {
                const sx_floor = Math.floor(srcX);
                const sy_floor = Math.floor(srcY);
                const idx = (sy_floor * image.naturalWidth + sx_floor) * 4;
                const dest_idx = (y * width + x) * 4;
                destData.data[dest_idx] = srcData[idx];
                destData.data[dest_idx + 1] = srcData[idx + 1];
                destData.data[dest_idx + 2] = srcData[idx + 2];
                destData.data[dest_idx + 3] = srcData[idx + 3];
            }
        }
    }
    
    ctx.putImageData(destData, 0, 0);
    return canvas.toDataURL();
};

/**
 * Detects alignment marks (if not cached) and returns a warped crop of the target area.
 */
export const detectAndWarpCrop = async (
    img: HTMLImageElement,
    idealCorners: Corners,
    targetArea: { x: number, y: number, width: number, height: number },
    cachedCorners?: Corners
): Promise<{ url: string | null, corners?: Corners }> => {
    let srcCorners = cachedCorners;
    
    if (!srcCorners) {
        // We need ImageData to find marks
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { url: null };
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = findAlignmentMarks(imageData);
        if (found) {
            srcCorners = found;
        }
    }

    if (srcCorners) {
        // Perform warp
        const url = warpArea(img, img.naturalWidth, img.naturalHeight, srcCorners, idealCorners, targetArea);
        return { url, corners: srcCorners };
    }

    return { url: null };
};
