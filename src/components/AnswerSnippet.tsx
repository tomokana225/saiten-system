
import React, { useState, useEffect, useMemo } from 'react';
import type { Area, Template } from '../types';
import { RotateCcwIcon, SpinnerIcon, XIcon } from './icons';
import { detectAndWarpCrop, loadImage } from '../utils';

// Shared global caches to prevent resource exhaustion and redundant processing
const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>();
const alignmentPromiseCache = new Map<string, Promise<any>>();

// Helper to get or create image load promise
const getSharedImage = (src: string): Promise<HTMLImageElement> => {
    let promise = imagePromiseCache.get(src);
    if (!promise) {
        promise = (async () => {
            if (src.startsWith('data:') || src.startsWith('blob:')) {
                return loadImage(src);
            }
            const result = await window.electronAPI.invoke('get-image-details', src);
            if (!result.success || !result.details?.url) throw new Error('Failed to load image');
            return loadImage(result.details.url);
        })();
        imagePromiseCache.set(src, promise);
    }
    return promise;
};

// Helper to get or create alignment detection promise
const getSharedAlignment = (
    src: string, 
    img: HTMLImageElement, 
    template: Template, 
    settings?: { minSize: number, threshold: number, padding: number },
    searchZones?: { tl: Area; tr: Area; br: Area; bl: Area }
): Promise<any> => {
    // Include settings in the cache key to handle adjustments
    const cacheKey = `${src}_${settings?.threshold || 160}_${settings?.minSize || 10}_${JSON.stringify(searchZones || {})}`;
    let promise = alignmentPromiseCache.get(cacheKey);
    if (!promise) {
        promise = (async () => {
            if (!template.alignmentMarkIdealCorners) return null;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return null;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { findAlignmentMarks } = await import('../utils');
            return findAlignmentMarks(imageData, settings, searchZones);
        })();
        alignmentPromiseCache.set(cacheKey, promise);
    }
    return promise;
};

interface PannableImageProps {
    imageDataUrl: string;
    imageWidth: number;
    imageHeight: number;
    area: Area;
    pannable: boolean;
    onClick?: () => void;
    manualPanOffset?: { x: number; y: number };
    onPanCommit?: (newOffset: { x: number; y: number }) => void;
    children?: React.ReactNode;
    padding?: number;
    cropInfo?: { x: number, y: number, width: number, height: number };
    isEnhanced?: boolean;
}

const PannableImage: React.FC<PannableImageProps> = ({
    imageDataUrl, area, pannable, onClick, manualPanOffset, onPanCommit, children, cropInfo, isEnhanced
}) => {
    const [scale, setScale] = useState(1);
    const [panOffset, setPanOffset] = useState(manualPanOffset || { x: 0, y: 0 });
    const [isGrabbing, setIsGrabbing] = useState(false);
    
    useEffect(() => {
        if (manualPanOffset) setPanOffset(manualPanOffset);
    }, [manualPanOffset]);

    const handleWheel = (e: React.WheelEvent) => {
        if (!pannable) return;
        e.stopPropagation();
        const delta = -e.deltaY * 0.001;
        setScale(prev => Math.min(Math.max(0.5, prev + delta), 3));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!pannable || e.button !== 0) return;
        e.preventDefault();
        setIsGrabbing(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isGrabbing) return;
            setPanOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
        };
        const handleMouseUp = () => {
            if (isGrabbing) {
                setIsGrabbing(false);
                if (onPanCommit) onPanCommit(panOffset);
            }
        };
        if (isGrabbing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isGrabbing, onPanCommit, panOffset]);

    const overlayStyle: React.CSSProperties = useMemo(() => {
        if (!cropInfo) return { position: 'absolute', inset: 0 };
        const offsetX = area.x - cropInfo.x;
        const offsetY = area.y - cropInfo.y;
        return {
            position: 'absolute',
            left: `${(offsetX / cropInfo.width) * 100}%`,
            top: `${(offsetY / cropInfo.height) * 100}%`,
            width: `${(area.width / cropInfo.width) * 100}%`,
            height: `${(area.height / cropInfo.height) * 100}%`,
            pointerEvents: 'none',
            zIndex: 10
        };
    }, [area, cropInfo]);

    const imageContainerStyle: React.CSSProperties = useMemo(() => {
        if (!cropInfo) return { width: '100%', height: '100%', position: 'relative' };
        return {
            position: 'relative',
            aspectRatio: `${cropInfo.width} / ${cropInfo.height}`,
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        };
    }, [cropInfo]);

    return (
        <div 
            className={`w-full h-full relative overflow-hidden select-none flex items-center justify-center ${pannable ? 'cursor-grab' : ''} ${isGrabbing ? 'cursor-grabbing' : ''}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onClick={onClick}
        >
            <div 
                style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
                    transformOrigin: 'center', transition: isGrabbing ? 'none' : 'transform 0.1s ease-out',
                    width: '100%', height: '100%'
                }}
            >
                <div style={imageContainerStyle}>
                    <img 
                        src={imageDataUrl} alt="Answer" draggable={false}
                        className="w-full h-full object-contain pointer-events-none transition-[filter] duration-300"
                        style={{ filter: isEnhanced ? 'grayscale(100%) contrast(200%) brightness(90%)' : 'none' }}
                    />
                    <div style={overlayStyle}>{children}</div>
                </div>
            </div>
            {pannable && (scale !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
                <button 
                    onClick={(e) => { e.stopPropagation(); setScale(1); setPanOffset({ x: 0, y: 0 }); if(onPanCommit) onPanCommit({x:0, y:0}); }}
                    className="absolute bottom-1 right-1 p-1 bg-white/80 rounded-full shadow-sm hover:bg-white text-slate-600" title="リセット"
                >
                    <RotateCcwIcon className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};

interface AnswerSnippetProps {
    imageSrc: string | null;
    imageWidth?: number;
    imageHeight?: number;
    area: Area;
    template?: Template;
    pannable?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
    manualPanOffset?: { x: number; y: number };
    onPanCommit?: (offset: { x: number; y: number }) => void;
    padding?: number;
    isEnhanced?: boolean;
    useAlignment?: boolean;
    alignmentSettings?: { minSize: number, threshold: number, padding: number };
    searchZones?: { tl: Area; tr: Area; br: Area; bl: Area };
    manualCorners?: {
        tl: { x: number, y: number },
        tr: { x: number, y: number },
        br: { x: number, y: number },
        bl: { x: number, y: number },
    };
}

export const AnswerSnippet: React.FC<AnswerSnippetProps> = ({ 
    imageSrc, area, template, pannable = false, onClick, children, manualPanOffset, onPanCommit, padding = 0, isEnhanced = false, useAlignment = false,
    alignmentSettings, searchZones, manualCorners
}) => {
    const [croppedImage, setCroppedImage] = useState<{ url: string, width: number, height: number, cropX: number, cropY: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!imageSrc) {
            setCroppedImage(null);
            return;
        }

        let isMounted = true;
        setLoading(true);
        setError(false);

        const crop = async () => {
            console.log("Cropping triggered", { imageSrc, manualCorners, useAlignment });
            try {
                // Use shared promise cache to avoid redundant loads and heavy processing
                const img = await getSharedImage(imageSrc);
                if (!isMounted) return;
                console.log("Image loaded", img);

                // --- Automatic Alignment Logic ---
                // If manualCorners are provided, we should ALWAYS run alignment logic, even if useAlignment is false.
                // This is because manualCorners implies the user wants to force a specific alignment.
                const shouldAlign = (useAlignment && template && template.alignmentMarkIdealCorners) || (manualCorners && template && template.alignmentMarkIdealCorners);

                if (shouldAlign) {
                    console.log("Alignment logic running", { manualCorners, useAlignment });
                    // Use manualCorners if available, otherwise try to find them automatically IF useAlignment is true.
                    // If useAlignment is false but we are here because of manualCorners, we use manualCorners.
                    const srcCorners = manualCorners || (useAlignment ? await getSharedAlignment(imageSrc, img, template!, alignmentSettings, searchZones) : null);
                    
                    if (srcCorners) {
                        console.log("srcCorners found:", srcCorners);
                        const alignedDataUrl = await detectAndWarpCrop(
                            img, template!.alignmentMarkIdealCorners!, 
                            { x: area.x - padding, y: area.y - padding, width: area.width + padding*2, height: area.height + padding*2 },
                            srcCorners,
                            alignmentSettings,
                            searchZones
                        );
                        console.log("alignedDataUrl:", alignedDataUrl);
                        if (alignedDataUrl.url && isMounted) {
                            setCroppedImage({
                                url: alignedDataUrl.url, width: area.width + padding*2, height: area.height + padding*2,
                                cropX: area.x - padding, cropY: area.y - padding
                            });
                            setLoading(false);
                            return;
                        } else {
                            console.warn("Auto-alignment failed (warp failed), falling back to simple crop");
                        }
                    } else {
                         console.warn("Auto-alignment skipped (no corners found), falling back to simple crop");
                    }
                } else {
                    console.log("Alignment logic NOT running", { useAlignment, template: !!template, corners: !!template?.alignmentMarkIdealCorners, manualCorners: !!manualCorners });
                }

                // --- Standard Simple Crop (Fallback) ---
                const canvas = document.createElement('canvas');
                const startX = Math.max(0, Math.floor(area.x - padding));
                const startY = Math.max(0, Math.floor(area.y - padding));
                const endX = Math.min(img.naturalWidth, Math.ceil(area.x + area.width + padding));
                const endY = Math.min(img.naturalHeight, Math.ceil(area.y + area.height + padding));
                const w = endX - startX; const h = endY - startY;

                if (w <= 0 || h <= 0) throw new Error('Invalid crop dimensions');

                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) throw new Error('Canvas context failed');
                ctx.drawImage(img, startX, startY, w, h, 0, 0, w, h);
                
                if (isMounted) {
                    setCroppedImage({ url: canvas.toDataURL(), width: w, height: h, cropX: startX, cropY: startY });
                }
            } catch (e) {
                console.error("Cropping failed:", e);
                if (isMounted) setError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        crop();
        return () => { isMounted = false; };
    }, [imageSrc, area.x, area.y, area.width, area.height, padding, useAlignment, template, manualCorners, alignmentSettings, searchZones]);

    if (!imageSrc) return <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 text-xs">No Image</div>;
    if (loading) return <div className="w-full h-full flex items-center justify-center bg-slate-50"><SpinnerIcon className="w-5 h-5 text-sky-500" /></div>;
    if (error || !croppedImage) return <div className="w-full h-full flex items-center justify-center bg-slate-100 text-red-400 text-xs"><XIcon className="w-4 h-4"/> Error</div>;

    return (
        <PannableImage
            imageDataUrl={croppedImage.url} imageWidth={croppedImage.width} imageHeight={croppedImage.height}
            area={area} pannable={pannable} onClick={onClick} manualPanOffset={manualPanOffset} onPanCommit={onPanCommit}
            padding={padding} cropInfo={{ x: croppedImage.cropX, y: croppedImage.cropY, width: croppedImage.width, height: croppedImage.height }}
            isEnhanced={isEnhanced}
        >
            {children}
        </PannableImage>
    );
};
