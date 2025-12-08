
import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Icon } from './Icon';
import JSZip from "jszip";

interface GalleryViewProps {
    onOpenLightbox: (blob: Blob, index: number, context: { blob: Blob, id: string }[]) => void;
    onBulkDelete: (ids: string[]) => void;
    onBulkUnbookmark: (ids: string[]) => void;
}

const ITEMS_PER_PAGE = 20;

const LazyGalleryItem: React.FC<{ blob: Blob | undefined, thumbnail: Blob | undefined, onClick: () => void, selectable: boolean, selected: boolean, index: number }> = ({ blob, thumbnail, onClick, selectable, selected, index }) => {
    const [url, setUrl] = useState('');
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setIsVisible(true);
                observer.disconnect();
            }
        });
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (isVisible) {
            const srcBlob = thumbnail || blob;
            if (srcBlob) {
                const u = URL.createObjectURL(srcBlob);
                setUrl(u);
                return () => URL.revokeObjectURL(u);
            }
        }
    }, [isVisible, blob, thumbnail]);

    return (
        <div
            ref={ref}
            onClick={onClick}
            className={`group relative aspect-square bg-black rounded-xl overflow-hidden cursor-pointer transition-all duration-300 opacity-0 animate-pop-in
        ${selectable && selected ? 'ring-4 ring-accent scale-95' : 'hover:-translate-y-1 hover:shadow-2xl'}
        ${selectable && !selected ? 'opacity-80 hover:opacity-100 ring-2 ring-transparent hover:ring-white/20' : ''}
        ${!selectable ? 'border border-border-light hover:border-accent' : ''}
      `}
            style={{ animationDelay: `${(index % 20) * 0.05}s` }}
        >
            {url ? (
                <img src={url} alt="Gallery Item" className={`w-full h-full object-cover transition-transform duration-500 ${!selectable && 'group-hover:scale-110'}`} loading="lazy" />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-bg-element">
                    <Icon name="image" className="opacity-20" />
                </div>
            )}

            {selectable && (
                <div className={`absolute top-2 right-2 p-1 rounded-full transition-transform duration-200 ${selected ? 'bg-accent text-black scale-110' : 'bg-black/50 text-white backdrop-blur-sm scale-100'}`}>
                    <Icon name={selected ? "check" : "circle"} className="w-4 h-4" />
                </div>
            )}

            {!selectable && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                </div>
            )}
        </div>
    );
};

export const GalleryView: React.FC<GalleryViewProps> = ({ onOpenLightbox, onBulkDelete, onBulkUnbookmark }) => {
    const [limit, setLimit] = useState(ITEMS_PER_PAGE);
    const [isMultiSelect, setIsMultiSelect] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Count total images using sparse index (fast)
    // 'above(0)' works because timestamps are positive integers
    const totalCount = useLiveQuery(() => db.images.where('galleryTimestamp').above(0).count()) || 0;

    // Load limited images using sparse index (fast)
    // This avoids scanning non-gallery images entirely
    const images = useLiveQuery(() =>
        db.images.orderBy('galleryTimestamp').reverse().limit(limit).toArray(),
        [limit]
    );

    const MAX_LIMIT = 50; // Hard limit for gallery storage per spec is 50 anyway
    const usagePercent = Math.min((totalCount / MAX_LIMIT) * 100, 100);

    let barColor = 'bg-green-500';
    if (usagePercent > 70) barColor = 'bg-yellow-500';
    if (usagePercent > 90) barColor = 'bg-red-500';

    if (!images) return <div className="p-10 text-center text-text-secondary">Loading gallery...</div>;

    const context = images.map(i => ({ blob: i.blob, id: i.id }));

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === images.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(images.map(i => i.id)));
    };

    const handleBulkDownload = async () => {
        if (selectedIds.size === 0) return;
        const zip = new JSZip();
        const selectedImages = images.filter(img => selectedIds.has(img.id));
        selectedImages.forEach((img, idx) => zip.file(`image_${idx + 1}.png`, img.blob));
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `okobit-gallery-${Date.now()}.zip`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleBulkAction = (action: 'delete' | 'unbookmark') => {
        if (selectedIds.size === 0) return;
        if (action === 'delete') onBulkDelete(Array.from(selectedIds));
        if (action === 'unbookmark') onBulkUnbookmark(Array.from(selectedIds));
        setIsMultiSelect(false);
        setSelectedIds(new Set());
    };

    return (
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-24 md:pt-16 sm:px-8 sm:pb-8 relative">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-text-primary animate-fade-in">Global Gallery</h2>
                        <div className="flex items-center gap-3 mt-2 text-sm text-text-secondary animate-fade-in" style={{ animationDelay: '0.1s' }}>
                            <span>Storage: {totalCount} / {MAX_LIMIT}</span>
                            <div className="w-32 h-2 bg-bg-element rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${usagePercent}%` }}></div>
                            </div>
                        </div>
                    </div>

                    {images.length > 0 && (
                        <button
                            onClick={() => { setIsMultiSelect(!isMultiSelect); setSelectedIds(new Set()); }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all active:scale-95 border animate-fade-in ${isMultiSelect ? 'bg-accent text-black border-accent' : 'bg-transparent text-text-secondary border-border-light hover:text-text-primary'}`}
                            style={{ animationDelay: '0.2s' }}
                        >
                            <Icon name="layers" className="w-4 h-4" />
                            <span className="text-sm font-medium">{isMultiSelect ? 'Done' : 'Select'}</span>
                        </button>
                    )}
                </div>

                {images.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-text-secondary animate-fade-in">
                        <Icon name="image" className="w-16 h-16 mb-4 opacity-20" />
                        <p>Your gallery is empty.</p>
                        <p className="text-xs mt-2 text-text-tertiary">Bookmark generated images in chat to save them here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20">
                        {images.map((img, idx) => (
                            <LazyGalleryItem
                                key={img.id}
                                blob={img.blob}
                                thumbnail={img.thumbnail}
                                onClick={() => {
                                    if (isMultiSelect) toggleSelection(img.id);
                                    else onOpenLightbox(img.blob, idx, context);
                                }}
                                selectable={isMultiSelect}
                                selected={selectedIds.has(img.id)}
                                index={idx}
                            />
                        ))}
                    </div>
                )}

                {totalCount > limit && (
                    <div className="flex justify-center pb-8">
                        <button
                            onClick={() => setLimit(l => l + ITEMS_PER_PAGE)}
                            className="bg-bg-element hover:bg-bg-surface text-text-primary px-6 py-2 rounded-full border border-border-light transition-all active:scale-95 text-sm font-medium"
                        >
                            Load More
                        </button>
                    </div>
                )}
            </div>

            {isMultiSelect && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-bg-surface/90 backdrop-blur-xl border border-border-light rounded-full shadow-2xl px-6 py-3 flex items-center gap-6 animate-slide-up">
                    <button onClick={handleSelectAll} className="flex items-center gap-2 text-text-primary hover:text-accent transition-colors active:scale-95">
                        <Icon name={selectedIds.size === images.length ? "check-circle" : "circle"} />
                        <span className="text-sm font-medium whitespace-nowrap">{selectedIds.size === images.length ? 'Deselect All' : 'Select All'}</span>
                    </button>
                    <div className="h-6 w-px bg-border-light"></div>
                    {selectedIds.size > 0 ? (
                        <>
                            <button onClick={handleBulkDownload} className="flex items-center gap-2 text-text-primary hover:text-accent transition-colors active:scale-95" title="Download ZIP">
                                <Icon name="download" />
                                <span className="text-sm font-medium hidden sm:inline">ZIP</span>
                            </button>
                            <button onClick={() => handleBulkAction('unbookmark')} className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors active:scale-95" title="Remove from Gallery">
                                <Icon name="bookmark" className="w-4 h-4 fill-none stroke-current" />
                                <span className="text-sm font-medium">Remove</span>
                            </button>
                            <button onClick={() => handleBulkAction('delete')} className="flex items-center gap-2 text-danger hover:text-red-400 transition-colors active:scale-95" title="Delete Permanently">
                                <Icon name="trash" />
                                <span className="text-sm font-medium">Delete</span>
                            </button>
                        </>
                    ) : (
                        <span className="text-text-secondary text-sm italic">Select items</span>
                    )}
                </div>
            )}
        </div>
    );
};