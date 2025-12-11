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
    children?: React.ReactNode;
    padding?: number;
    cropInfo?: { x: number, y: number, width: number, height: number };
    isEnhanced?: boolean;
}

// Inner component that safely contains all the hooks for panning and zooming
const PannableImage: React.FC<PannableImageProps> = ({
    imageDataUrl, imageWidth, imageHeight, area, pannable, onClick, manualPanOffset, onPanCommit, children, padding = 0, cropInfo, isEnhanced
}) => {
    const [scale, setScale] = useState(1);
    const [panOffset, setPanOffset] = useState(manualPanOffset || { x: 0, y: 0 });
    const [isGrabbing, setIsGrabbing] = useState(false);
    
    // Reset local state if manual offset changes (e.g. from props)
    useEffect(() => {
        if (manualPanOffset) setPanOffset(manualPanOffset);
    }, [manualPanOffset]);

    const handleWheel = (e: React.WheelEvent) => {
        if (!pannable) return;
        e.stopPropagation();
        // Allow default scroll if not zooming? No, usually we want to block scroll when hovering pannable area
        // e.preventDefault(); // React synthetic events might not support preventDefault on passive listeners easily
        
        const delta = -e.deltaY * 0.001;
        setScale(prev => Math.min(Math.max(0.5, prev + delta), 3));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!pannable || e.button !== 0) return;
        e.preventDefault();
        setIsGrabbing(true);
    };

    // Global mouse events for dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isGrabbing) return;
            setPanOffset(prev => ({
                x: prev.x + e.movementX,
                y: prev.y + e.movementY
            }));
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

    // Calculate overlay position relative to the padded image
    // cropInfo contains the actual dimensions of the cropped image (including padding)
    // area contains the logical dimensions of the answer box
    // We need to position children (overlay) to match the 'area' within 'cropInfo'
    
    const overlayStyle: React.CSSProperties = useMemo(() => {
        if (!cropInfo) return { position: 'absolute', inset: 0 };
        
        // Offset of the logical area within the cropped image
        const offsetX = area.x - cropInfo.x;
        const offsetY = area.y - cropInfo.y;
        
        return {
            position: 'absolute',
            left: `${(offsetX / cropInfo.width) * 100}%`,
            top: `${(offsetY / cropInfo.height) * 100}%`,
            width: `${(area.width / cropInfo.width) * 100}%`,
            height: `${(area.height / cropInfo.height) * 100}%`,
            pointerEvents: 'none' // Allow clicks to pass through to image/container
        };
    }, [area, cropInfo]);

    return (
        <div 
            className={`w-full h-full relative overflow-hidden select-none ${pannable ? 'cursor-grab' : ''} ${isGrabbing ? 'cursor-grabbing' : ''}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onClick={onClick}
        >
            <div 
                style={{ 
                    width: '100%', 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
                    transformOrigin: 'center',
                    transition: isGrabbing ? 'none' : 'transform 0.1s ease-out'
                }}
            >
                <img 
                    src={imageDataUrl} 
                    alt="Answer" 
                    draggable={false}
                    className="max-w-full max-h-full object-contain pointer-events-none transition-[filter] duration-300"
                    style={{
                        filter: isEnhanced ? 'grayscale(100%) contrast(200%) brightness(90%)' : 'none'
                    }}
                />
                <div style={overlayStyle}>
                    {children}
                </div>
            </div>
            {pannable && (scale !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
                <button 
                    onClick={(e) => { e.stopPropagation(); setScale(1); setPanOffset({ x: 0, y: 0 }); if(onPanCommit) onPanCommit({x:0, y:0}); }}
                    className="absolute bottom-1 right-1 p-1 bg-white/80 rounded-full shadow-sm hover:bg-white text-slate-600"
                    title="リセット"
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
    template?: Template; // Optional template for overlay alignment if needed
    pannable?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
    manualPanOffset?: { x: number; y: number };
    onPanCommit?: (offset: { x: number; y: number }) => void;
    padding?: number;
    isEnhanced?: boolean;
}

export const AnswerSnippet: React.FC<AnswerSnippetProps> = ({ 
    imageSrc, area, pannable = false, onClick, children, manualPanOffset, onPanCommit, padding = 0, isEnhanced = false
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
            try {
                const result = await window.electronAPI.invoke('get-image-details', imageSrc);
                if (!result.success || !result.details?.url) {
                    throw new Error('Failed to load image');
                }

                const img = new Image();
                img.src = result.details.url;
                await img.decode();

                if (!isMounted) return;

                const canvas = document.createElement('canvas');
                
                // Calculate crop coordinates with padding
                const startX = Math.max(0, Math.floor(area.x - padding));
                const startY = Math.max(0, Math.floor(area.y - padding));
                const endX = Math.min(img.naturalWidth, Math.ceil(area.x + area.width + padding));
                const endY = Math.min(img.naturalHeight, Math.ceil(area.y + area.height + padding));
                
                const w = endX - startX;
                const h = endY - startY;

                if (w <= 0 || h <= 0) {
                    throw new Error('Invalid crop dimensions');
                }

                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas context failed');

                ctx.drawImage(img, startX, startY, w, h, 0, 0, w, h);
                
                setCroppedImage({
                    url: canvas.toDataURL(),
                    width: w,
                    height: h,
                    cropX: startX,
                    cropY: startY
                });
            } catch (e) {
                console.error("Cropping failed:", e);
                if (isMounted) setError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        crop();

        return () => { isMounted = false; };
    }, [imageSrc, area.x, area.y, area.width, area.height, padding]);

    if (!imageSrc) {
        return <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400 text-xs">No Image</div>;
    }

    if (loading) {
        return <div className="w-full h-full flex items-center justify-center bg-slate-50"><SpinnerIcon className="w-5 h-5 text-sky-500" /></div>;
    }

    if (error || !croppedImage) {
        return <div className="w-full h-full flex items-center justify-center bg-slate-100 text-red-400 text-xs"><XIcon className="w-4 h-4"/> Error</div>;
    }

    return (
        <PannableImage
            imageDataUrl={croppedImage.url}
            imageWidth={croppedImage.width}
            imageHeight={croppedImage.height}
            area={area}
            pannable={pannable}
            onClick={onClick}
            manualPanOffset={manualPanOffset}
            onPanCommit={onPanCommit}
            padding={padding}
            cropInfo={{ x: croppedImage.cropX, y: croppedImage.cropY, width: croppedImage.width, height: croppedImage.height }}
            isEnhanced={isEnhanced}
        >
            {children}
        </PannableImage>
    );
};