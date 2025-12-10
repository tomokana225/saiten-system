import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Area, Template } from '../types';
import { RotateCcwIcon, SpinnerIcon, XIcon } from './icons';

// Props for the inner component that contains hooks
interface PannableImageProps {
    imageDataUrl: string;
    imageWidth: number;
    imageHeight: number;
    area: Area;
    pannable: boolean;
    onClick?: () => void;
    manualPanOffset?: { x: number; y: number };
    onPanCommit?: (newOffset: { x: number; y: number }) => void;
}

// Inner component that safely contains all the hooks for panning and zooming
const PannableImage: React.FC<PannableImageProps> = ({
    imageDataUrl, imageWidth, imageHeight, area, pannable, onClick, manualPanOffset, onPanCommit
}) => {
    // All hooks are safely called at the top level of this component
    const [scale, setScale] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isTransformed, setIsTransformed] = useState(false);
    const [isGrabbing, setIsGrabbing] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLDivElement>(null);
    const panState = useRef({ isPanning: false, startX: 0, startY: 0, startPan: { x: 0, y: 0 }, didPan: false });
    const initialScale = useRef(1);
    const initialPanOffset = useRef({ x: 0, y: 0 });
    
    useEffect(() => {
        const calculateAndSetInitialState = () => {
            if (!containerRef.current || !area || imageWidth === 0) return;
            const containerW = containerRef.current.offsetWidth;
            const containerH = containerRef.current.offsetHeight;
            if (containerW === 0 || containerH === 0) return;
            
            const fitScale = Math.min(containerW / area.width, containerH / area.height);
            initialScale.current = fitScale;
            setScale(fitScale);

            const initialPan = { 
                x: -(area.x + area.width / 2 - imageWidth / 2), 
                y: -(area.y + area.height / 2 - imageHeight / 2)
            };

            initialPanOffset.current = initialPan;
            
            const finalPan = {
                x: initialPan.x + (manualPanOffset?.x || 0),
                y: initialPan.y + (manualPanOffset?.y || 0)
            };
            
            setPanOffset(finalPan);
        };
        
        calculateAndSetInitialState();
        const resizeObserver = new ResizeObserver(calculateAndSetInitialState);
        if (containerRef.current) resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [imageWidth, imageHeight, area, manualPanOffset]);
    
    useEffect(() => {
        const panDiffX = Math.abs(panOffset.x - initialPanOffset.current.x);
        const panDiffY = Math.abs(panOffset.y - initialPanOffset.current.y);
        const scaleDiff = Math.abs(scale - initialScale.current);
        setIsTransformed(panDiffX > 1 || panDiffY > 1 || scaleDiff > 0.01);
    }, [scale, panOffset]);

    const handleWheel = useCallback((e: WheelEvent) => {
        if (!pannable || !containerRef.current) return;
        e.preventDefault();
        e.stopPropagation();

        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const newScale = e.deltaY < 0 
            ? Math.min(scale * 1.2, 10) // Max zoom 10x
            : Math.max(scale / 1.2, 0.1); // Min zoom 0.1x
        
        const worldMouseX = (mouseX - containerRef.current.offsetWidth / 2) / scale - panOffset.x;
        const worldMouseY = (mouseY - containerRef.current.offsetHeight / 2) / scale - panOffset.y;
        
        const newPanX = (mouseX - containerRef.current.offsetWidth / 2) / newScale - worldMouseX;
        const newPanY = (mouseY - containerRef.current.offsetHeight / 2) / newScale - worldMouseY;

        setScale(newScale);
        setPanOffset({ x: newPanX, y: newPanY });
    }, [scale, panOffset, pannable]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !pannable) return;
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [pannable, handleWheel]);

    const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
        if (!panState.current.isPanning || !imageRef.current) return;
        e.preventDefault();
        panState.current.didPan = true;
        
        const dx = (e.clientX - panState.current.startX);
        const dy = (e.clientY - panState.current.startY);

        const newPan = {
            x: panState.current.startPan.x + dx / scale,
            y: panState.current.startPan.y + dy / scale,
        };
        
        imageRef.current.style.transition = 'none';
        imageRef.current.style.transform = `scale(${scale}) translate(${newPan.x}px, ${newPan.y}px)`;
    }, [scale]);
    
    const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
        if (!panState.current.isPanning) return;
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);

        const dx = (e.clientX - panState.current.startX);
        const dy = (e.clientY - panState.current.startY);

        const finalPan = {
            x: panState.current.startPan.x + dx / scale,
            y: panState.current.startPan.y + dy / scale
        };
        
        setPanOffset(finalPan);
        if (onPanCommit) {
            const finalOffset = { x: finalPan.x - initialPanOffset.current.x, y: finalPan.y - initialPanOffset.current.y };
            onPanCommit(finalOffset);
        }
        
        panState.current.isPanning = false;
        setIsGrabbing(false);
    }, [scale, onPanCommit, handleGlobalMouseMove]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!pannable || e.button !== 0) return;
        e.preventDefault();
        panState.current = { isPanning: true, startX: e.clientX, startY: e.clientY, startPan: { ...panOffset }, didPan: false };
        setIsGrabbing(true);
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
    };
    
    const handleMouseUp = (e: React.MouseEvent) => {
        if (onClick && !panState.current.didPan) onClick();
        panState.current.didPan = false;
    };

    const handleReset = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (imageRef.current) imageRef.current.style.transition = 'transform 0.2s ease-out';
        setScale(initialScale.current);
        setPanOffset(initialPanOffset.current);
        if (onPanCommit) onPanCommit({ x: 0, y: 0 });
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-slate-200 dark:bg-slate-700 rounded-md overflow-hidden relative"
            style={{ cursor: pannable ? (isGrabbing ? 'grabbing' : 'grab') : (onClick ? 'pointer' : 'default') }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
        >
            {isTransformed && pannable && (
                <button onClick={handleReset} className="absolute top-2 right-2 p-1.5 bg-slate-800/60 text-white rounded-full hover:bg-slate-900/80 transition-opacity z-10" title="表示をリセット">
                    <RotateCcwIcon className="w-4 h-4" />
                </button>
            )}
            <div
                ref={imageRef}
                style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    width: `${imageWidth}px`,
                    height: `${imageHeight}px`,
                    marginLeft: `-${imageWidth / 2}px`,
                    marginTop: `-${imageHeight / 2}px`,
                    transform: `scale(${scale}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                    willChange: 'transform',
                    transition: panState.current.isPanning ? 'none' : 'transform 0.1s ease-out',
                }}
            >
                <img
                    src={imageDataUrl}
                    alt="Answer Snippet"
                    draggable="false"
                    style={{
                        width: '100%',
                        height: '100%',
                        maxWidth: 'none',
                        maxHeight: 'none',
                        imageRendering: 'crisp-edges',
                    }}
                />
            </div>
        </div>
    );
}

// Props for the main component
interface AnswerSnippetProps {
    imageSrc: string | null;
    imageWidth?: number; // Optional prop, will be determined internally if not provided
    imageHeight?: number; // Optional prop
    area?: Area;
    template?: Template;
    pannable?: boolean;
    onClick?: () => void;
    manualPanOffset?: { x: number; y: number };
    onPanCommit?: (newOffset: { x: number; y: number }) => void;
}

// Main component, handles loading and error states before rendering the inner component
export const AnswerSnippet: React.FC<AnswerSnippetProps> = (props) => {
    const { imageSrc, imageWidth: propImageWidth, imageHeight: propImageHeight, area, template } = props;
    const [imageData, setImageData] = useState<{ url: string, width: number, height: number } | null>(null);
    const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');

    useEffect(() => {
        let isMounted = true;
        setStatus('loading');
        setImageData(null);

        const loadImageData = async () => {
            if (!imageSrc) {
                if (isMounted) setStatus('error');
                return;
            }

            try {
                // Use a single, robust IPC handler for all image loading.
                // It's more reliable, especially in development environments.
                const result = await window.electronAPI.invoke('get-image-details', imageSrc);
                if (isMounted) {
                    if (result.success && result.details) {
                        setImageData({
                            url: result.details.url,
                            // Use dimensions from props if provided (for template), otherwise use detected dimensions.
                            width: propImageWidth ?? result.details.width,
                            height: propImageHeight ?? result.details.height
                        });
                        setStatus('success');
                    } else {
                        throw new Error(result.error || `IPC call 'get-image-details' failed for ${imageSrc}`);
                    }
                }
            } catch (error) {
                console.error("Failed to load image in AnswerSnippet:", error);
                if (isMounted) setStatus('error');
            }
        };

        loadImageData();
        
        return () => { isMounted = false; };
    }, [imageSrc, propImageWidth, propImageHeight]);
    
    const scaledArea = useMemo(() => {
        if (!area || !imageData) return area;
        
        // If there's no template to compare against, or if the image is the template itself, no scaling is needed.
        if (!template || (imageData.width === template.width && imageData.height === template.height)) {
            return area;
        }
    
        const scaleX = imageData.width / template.width;
        const scaleY = imageData.height / template.height;
    
        return {
            ...area,
            x: area.x * scaleX,
            y: area.y * scaleY,
            width: area.width * scaleX,
            height: area.height * scaleY,
        };
    }, [area, imageData, template]);

    if (!imageSrc) {
         // Handle explicitly null/empty image source (e.g. empty slot)
         return <div className="w-full h-full bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center text-xs text-slate-300 border-2 border-dashed border-slate-300">画像なし</div>;
    }

    if (!area) {
        // Handle missing area definition but present image. 
        // We can try to show the image even without specific area cropping, but zoomed out.
        // Or show a specific warning.
        return (
            <div className="w-full h-full bg-red-50 dark:bg-red-900/20 rounded-md flex flex-col items-center justify-center text-xs text-red-500 p-2 text-center border border-red-200">
                <XIcon className="w-6 h-6 mb-1 opacity-50"/>
                <span>領域未設定</span>
            </div>
        );
    }

    if (status === 'loading') {
        return <div className="w-full h-full bg-slate-200 dark:bg-slate-700 rounded-md flex items-center justify-center"><SpinnerIcon className="w-6 h-6 text-slate-500" /></div>;
    }
    
    if (status === 'error' || !imageData) {
        return <div className="w-full h-full bg-slate-200 dark:bg-slate-700 rounded-md flex items-center justify-center text-xs text-red-500 p-2 text-center">読込エラー</div>;
    }

    return (
        <PannableImage 
            {...props}
            imageDataUrl={imageData.url}
            imageWidth={imageData.width}
            imageHeight={imageData.height}
            area={scaledArea!}
            pannable={props.pannable ?? false}
        />
    );
};