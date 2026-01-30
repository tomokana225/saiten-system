
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

/**
 * Finds the four corner alignment marks (fiducial markers) in an image.
 * Improves robustness by using adaptive thresholding and centroid calculation.
 * @param imageData The ImageData object of the image to analyze.
 * @returns An object with the coordinates of the four corners, or null if not found.
 */
export const findAlignmentMarks = (imageData: ImageData) => {
    const { data, width, height } = imageData;
    // Scan larger area (25%) to ensure marks are caught even if slightly offset
    const cornerSizeW = Math.floor(width * 0.25);
    const cornerSizeH = Math.floor(height * 0.25);

    const getCornerCentroid = (startX: number, startY: number, endX: number, endY: number) => {
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

/**
 * Performs a perspective transform on an image to correct distortion,
 * given the source (distorted) and destination (ideal) corners.
 * @param image The source HTMLImageElement.
 * @param srcCorners The coordinates of the four corners in the source image.
 * @param destCorners The coordinates of the four corners in the destination image.
 * @param width The desired width of the output image.
 * @param height The desired height of the output image.
 * @returns A data URL of the transformed image.
 */
export const perspectiveTransform = (
    image: HTMLImageElement,
    srcCorners: { tl: { x: number, y: number }, tr: { x: number, y: number }, br: { x: number, y: number }, bl: { x: number, y: number } },
    destCorners: { tl: { x: number, y: number }, tr: { x: number, y: number }, br: { x: number, y: number }, bl: { x: number, y: number } },
    width: number,
    height: number
): string => {
    const src = [srcCorners.tl, srcCorners.tr, srcCorners.br, srcCorners.bl];
    const dst = [destCorners.tl, destCorners.tr, destCorners.br, destCorners.bl];
    
    // --- Matrix Math for Homography Calculation ---
    // Solves for the perspective transformation matrix using a standard algorithm.
    const getHomography = (src: {x:number, y:number}[], dest: {x:number, y:number}[]) => {
        const P = [
            [-src[0].x, -src[0].y, -1, 0, 0, 0, src[0].x * dest[0].x, src[0].y * dest[0].x, dest[0].x],
            [0, 0, 0, -src[0].x, -src[0].y, -1, src[0].x * dest[0].y, src[0].y * dest[0].y, dest[0].y],
            [-src[1].x, -src[1].y, -1, 0, 0, 0, src[1].x * dest[1].x, src[1].y * dest[1].x, dest[1].x],
            [0, 0, 0, -src[1].x, -src[1].y, -1, src[1].x * dest[1].y, src[1].y * dest[1].y, dest[1].y],
            [-src[2].x, -src[2].y, -1, 0, 0, 0, src[2].x * dest[2].x, src[2].y * dest[2].x, dest[2].x],
            [0, 0, 0, -src[2].x, -src[2].y, -1, src[2].x * dest[2].y, src[2].y * dest[2].y, dest[2].y],
            [-src[3].x, -src[3].y, -1, 0, 0, 0, src[3].x * dest[3].x, src[3].y * dest[3].x, dest[3].x],
            [0, 0, 0, -src[3].x, -src[3].y, -1, src[3].x * dest[3].y, src[3].y * dest[3].y, dest[3].y]
        ];
        
        // Gaussian elimination to solve P*h = 0
        for (let i = 0; i < 8; i++) {
            let maxRow = i;
            for (let k = i + 1; k < 8; k++) {
                if (Math.abs(P[k][i]) > Math.abs(P[maxRow][i])) maxRow = k;
            }
            [P[i], P[maxRow]] = [P[maxRow], P[i]];
            for (let k = i + 1; k < 9; k++) P[i][k] /= P[i][i];
            for (let k = 0; k < 8; k++) {
                if (k !== i) {
                    for (let j = i + 1; j < 9; j++) P[k][j] -= P[k][i] * P[i][j];
                }
            }
        }
        
        const h = Array(9).fill(0);
        for (let i = 0; i < 8; i++) h[i] = -P[i][8];
        h[8] = 1;

        return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], h[8]]];
    };

    const H = getHomography(dst, src); // Get inverse transform
    
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
    
    // Apply transformation using inverse mapping
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
 * Detects the bounding box of the content using Projection Profiles.
 * This is robust against noise and finds the rectangular frame (answer box) accurately
 * even if the image contains some artifacts.
 */
export const detectContentBox = (imageData: ImageData): { x: number, y: number, w: number, h: number } | null => {
    const { data, width, height } = imageData;
    const threshold = 160; // Lightness threshold (pixels darker than this are counted)
    const lineThreshold = 0.25; // A line must be at least this portion of the perpendicular dimension to be considered a border

    const rowCounts = new Int32Array(height).fill(0);
    const colCounts = new Int32Array(width).fill(0);

    // 1. Build Histogram (Projection Profile)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            
            if (gray < threshold) {
                rowCounts[y]++;
                colCounts[x]++;
            }
        }
    }

    // 2. Find boundaries by scanning from outside in
    // We look for the first row/col that has a significant number of dark pixels (indicating a line)
    
    // Top
    let minY = 0;
    for (let y = 0; y < height / 2; y++) {
        if (rowCounts[y] > width * lineThreshold) {
            minY = y;
            break;
        }
    }

    // Bottom
    let maxY = height - 1;
    for (let y = height - 1; y > height / 2; y--) {
        if (rowCounts[y] > width * lineThreshold) {
            maxY = y;
            break;
        }
    }

    // Left
    let minX = 0;
    for (let x = 0; x < width / 2; x++) {
        if (colCounts[x] > height * lineThreshold) {
            minX = x;
            break;
        }
    }

    // Right
    let maxX = width - 1;
    for (let x = width - 1; x > width / 2; x--) {
        if (colCounts[x] > height * lineThreshold) {
            maxX = x;
            break;
        }
    }

    // Validation: Check if we found a reasonable box
    if (maxX <= minX || maxY <= minY) {
        // Fallback: If projection failed (e.g. dotted lines or very faint), 
        // try a simpler bounding box of all dark pixels, but with a center bias
        return null;
    }

    // Refinement: The detected lines usually have thickness. 
    // We ideally want the *outer* boundary for cropping, or *inner*?
    // Usually marks are inside. Let's return the outer boundary of the found lines.
    // The current loop finds the *outermost* index that met the threshold.
    
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;

    // Safety: don't return tiny noise boxes
    if (w < 10 || h < 10) return null;

    return { x: minX, y: minY, w, h };
};
