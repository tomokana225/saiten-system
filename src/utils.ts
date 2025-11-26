// This file contains utility functions used across the application,
// including file handling and advanced image processing.

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
 * Finds the four corner alignment marks (fiducial markers) in an image.
 * This is a simplified implementation that scans the corners of the image for dark squares.
 * @param imageData The ImageData object of the image to analyze.
 * @returns An object with the coordinates of the four corners, or null if not found.
 */
export const findAlignmentMarks = (imageData: ImageData) => {
    const { data, width, height } = imageData;
    const threshold = 128; // Binarization threshold
    const cornerSize = Math.min(width, height) * 0.2; // Scan 20% of the image in each corner

    const findMarkInCorner = (xStart: number, yStart: number, xEnd: number, yEnd: number) => {
        let maxBlob = { size: 0, x: 0, y: 0, count: 0 };
        const visited = new Array(width * height).fill(false);

        for (let y = yStart; y < yEnd; y++) {
            for (let x = xStart; x < xEnd; x++) {
                const idx = (y * width + x);
                const pixelIdx = idx * 4;
                const r = data[pixelIdx];
                const g = data[pixelIdx + 1];
                const b = data[pixelIdx + 2];
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;

                if (!visited[idx] && gray < threshold) {
                    const blob = { size: 0, x: 0, y: 0, count: 0 };
                    const stack = [[x, y]];
                    visited[idx] = true;

                    while (stack.length > 0) {
                        const [cx, cy] = stack.pop()!;
                        blob.size++;
                        blob.x += cx;
                        blob.y += cy;

                        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                            const nx = cx + dx;
                            const ny = cy + dy;
                            if (nx >= xStart && nx < xEnd && ny >= yStart && ny < yEnd) {
                                const nIdx = (ny * width + nx);
                                const nPixelIdx = nIdx * 4;
                                const nr = data[nPixelIdx];
                                const ng = data[nPixelIdx + 1];
                                const nb = data[nPixelIdx + 2];
                                const nGray = 0.299 * nr + 0.587 * ng + 0.114 * nb;
                                if (!visited[nIdx] && nGray < threshold) {
                                    visited[nIdx] = true;
                                    stack.push([nx, ny]);
                                }
                            }
                        }
                    }

                    if (blob.size > maxBlob.size) {
                        maxBlob = blob;
                    }
                }
            }
        }
        if (maxBlob.size > 10) { // Minimum blob size to be considered a mark
            return { x: maxBlob.x / maxBlob.size, y: maxBlob.y / maxBlob.size };
        }
        return null;
    };

    const tl = findMarkInCorner(0, 0, cornerSize, cornerSize);
    const tr = findMarkInCorner(width - cornerSize, 0, width, cornerSize);
    const br = findMarkInCorner(width - cornerSize, height - cornerSize, width, height);
    const bl = findMarkInCorner(0, height - cornerSize, cornerSize, height);

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
