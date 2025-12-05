import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Icon } from './Icon';

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageBlob: Blob | null;
  imageId?: string;
  onNext: () => void;
  onPrev: () => void;
  onDelete: (id: string) => void;
}

export const Lightbox: React.FC<LightboxProps> = ({ isOpen, onClose, imageBlob, imageId, onNext, onPrev, onDelete }) => {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [imgUrl, setImgUrl] = useState<string>('');
  const imgRef = useRef<HTMLImageElement>(null);

  // Check gallery status
  const imageData = useLiveQuery(
      () => imageId ? db.images.get(imageId) : Promise.resolve(null),
      [imageId]
  );
  const isBookmarked = imageData?.isGalleryVisible;

  React.useEffect(() => {
    if (imageBlob) {
      const url = URL.createObjectURL(imageBlob);
      setImgUrl(url);
      setScale(1); // Reset zoom
      setOrigin({ x: 50, y: 50 });
      return () => URL.revokeObjectURL(url);
    }
  }, [imageBlob]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight') onNext();
        if (e.key === 'ArrowLeft') onPrev();
        if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onNext, onPrev, onClose]);

  if (!isOpen || !imageBlob) return null;

  const handleDownload = async () => {
    if (!imageBlob) return;
    const url = URL.createObjectURL(imageBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `okobit-gen-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleBookmark = async () => {
      if (!imageId || !imageData) return;
      if (isBookmarked) {
          await db.images.update(imageId, { 
              isGalleryVisible: false,
              galleryTimestamp: undefined // Remove from sparse index
          });
      } else {
          // Check limit
          const count = await db.images.where('galleryTimestamp').above(0).count();
          if (count >= 50) {
              alert("Gallery is full (50 images).");
              return;
          }
          await db.images.update(imageId, { 
              isGalleryVisible: true,
              galleryTimestamp: imageData.createdAt // Add to sparse index
          });
      }
  };

  const handleWheel = (e: React.WheelEvent) => {
      e.stopPropagation();
      const delta = -e.deltaY * 0.002;
      const newScale = Math.min(Math.max(1, scale + delta), 5);
      setScale(newScale);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    
    // Calculate mouse position as percentage of image container
    const { clientX, clientY, currentTarget } = e;
    const { width, height, left, top } = currentTarget.getBoundingClientRect();
    
    // Smooth automatic panning: 
    // If the mouse is at 0% (left), we want origin to be 0% (left).
    // If we zoom into 0% 0%, we see the top left corner.
    const x = ((clientX - left) / width) * 100;
    const y = ((clientY - top) / height) * 100;

    setOrigin({ x, y });
  };

  return (
    <div 
        className="fixed inset-0 z-[2000] flex flex-col items-center justify-center animate-fade-in select-none"
        onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/95 backdrop-blur-md"></div>
      
      {/* Top Controls */}
      <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }} 
          className="absolute top-6 right-6 z-[2005] p-3 rounded-full bg-white/10 hover:bg-accent hover:text-black transition-all border border-white/10 text-white backdrop-blur-md active:scale-95"
      >
        <Icon name="x" className="w-6 h-6" />
      </button>

      {/* Navigation */}
      <button 
        onClick={(e) => { e.stopPropagation(); onPrev(); }} 
        className="absolute left-6 top-1/2 -translate-y-1/2 z-[2005] p-3 rounded-full bg-white/10 hover:bg-accent hover:text-black transition-all border border-white/10 text-white backdrop-blur-md active:scale-95"
      >
        <Icon name="chevron-left" className="w-6 h-6" />
      </button>

      <button 
        onClick={(e) => { e.stopPropagation(); onNext(); }} 
        className="absolute right-6 top-1/2 -translate-y-1/2 z-[2005] p-3 rounded-full bg-white/10 hover:bg-accent hover:text-black transition-all border border-white/10 text-white backdrop-blur-md active:scale-95"
      >
        <Icon name="chevron-right" className="w-6 h-6" />
      </button>

      {/* Image Container */}
      <div 
        className="relative z-[2001] w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        // Removed e.stopPropagation() to allow clicking outside to close
      >
        <img 
          key={imageId || 'unknown'}
          ref={imgRef}
          src={imgUrl} 
          alt="Generated Content" 
          style={{ 
              transform: `scale(${scale})`,
              transformOrigin: `${origin.x}% ${origin.y}%`,
          }}
          className={`max-w-[95vw] max-h-[90vh] object-contain rounded-md shadow-2xl transition-transform duration-100 ease-linear animate-fade-in ${scale > 1 ? 'cursor-crosshair' : 'cursor-zoom-in'}`}
          onClick={(e) => { e.stopPropagation(); setScale(scale > 1 ? 1 : 2.5); }}
        />
      </div>

      {/* Action Bar */}
      <div 
        className="absolute bottom-10 z-[2010] flex flex-col items-center gap-4 animate-slide-up w-full pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Zoom Slider */}
        <div className="bg-black/60 backdrop-blur-xl px-6 py-2 rounded-full border border-white/10 pointer-events-auto flex items-center gap-3 w-64">
           <Icon name="zoom-out" className="w-4 h-4 text-text-secondary" />
           <input 
             type="range" 
             min="1" 
             max="5" 
             step="0.1" 
             value={scale} 
             onChange={(e) => setScale(parseFloat(e.target.value))}
             className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
           />
           <Icon name="zoom-in" className="w-4 h-4 text-text-secondary" />
        </div>

        <div className="flex gap-4 bg-black/60 backdrop-blur-xl px-6 py-3 rounded-full border border-white/10 pointer-events-auto">
            {imageId && (
                <button 
                    onClick={handleToggleBookmark} 
                    className={`p-2 transition-all active:scale-95 ${isBookmarked ? 'text-accent' : 'text-white hover:text-accent'}`} 
                    title={isBookmarked ? "Remove from Gallery" : "Save to Gallery"}
                >
                    <Icon name="bookmark" className={isBookmarked ? "fill-current" : ""} />
                </button>
            )}
            <div className="w-px bg-white/10 h-6 my-auto"></div>
            <button onClick={() => setScale(scale > 1 ? 1 : 2.5)} className={`p-2 transition-all active:scale-95 ${scale > 1 ? 'text-accent' : 'text-white hover:text-accent'}`} title="Toggle Zoom">
                <Icon name={scale > 1 ? 'zoom-out' : 'zoom-in'} />
            </button>
            <button onClick={handleDownload} className="p-2 hover:text-accent text-white transition-all active:scale-95" title="Download">
                <Icon name="download" />
            </button>
            {imageId && (
            <button onClick={() => onDelete(imageId)} className="p-2 hover:text-danger text-white transition-all active:scale-95" title="Delete Permanently">
                <Icon name="trash" />
            </button>
            )}
        </div>
      </div>
    </div>
  );
};