
import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Message, Chat } from '../types';
import { Icon } from './Icon';
import { db } from '../db';
import { HERO_PROMPTS } from '../constants';
import { getEffectiveMimeType } from '../services/geminiService';

interface ChatViewProps {
  chat: Chat;
  messages: Message[];
  onSendMessage: (text: string, files: Blob[]) => void;
  onEditMessage: (msgId: string, newText: string, keptImageIds?: string[], newFiles?: Blob[]) => void;
  loading: boolean;
  onOpenLightbox: (blob: Blob, id: string) => void;
  streamingText: string;
  streamingThoughts: string;
  streamingUsage: any;
  onRegenerate: (msgId: string) => void;
  onFork: (msgId: string) => void;
  onDeleteMessage: (msgId: string) => void;
  showStats: boolean;
  onToggleGallery?: (imageIds: string[]) => void;
  onSetPrompt: (text: string) => void;
  onSavePrompt?: (text: string) => void;
  onContinueGeneration: () => void;
  targetEditMessageId?: string | null;
  onClearEditTarget?: () => void;
  startTime: number | null;
  onRetry: (msgId: string) => void;
  onDragCancel?: () => void;
}

// Helper to determine icon based on mime type
const getFileIconName = (mime: string): any => {
  if (mime.startsWith('audio/')) return 'volume-2';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('pdf')) return 'file-text';
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript') || mime.includes('xml') || mime.includes('html')) return 'file-text';
  return 'file';
};

// Lazy Image Component using IntersectionObserver for performance
const LazyImageThumb: React.FC<{ blob: Blob | undefined, thumbnail: Blob | undefined, onClick: () => void, aspectSquare?: boolean, mimeType?: string }> = ({ blob, thumbnail, onClick, aspectSquare, mimeType }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [url, setUrl] = useState<string>('');
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    });
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isVisible) {
      // Prefer thumbnail for list view if available, unless it's not an image
      const isImage = mimeType?.startsWith('image/') ?? true;
      const srcBlob = (isImage && thumbnail) ? thumbnail : blob;
      if (srcBlob) {
        const u = URL.createObjectURL(srcBlob);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
      }
    }
  }, [isVisible, blob, thumbnail, mimeType]);

  const isImage = mimeType?.startsWith('image/') ?? true;

  return (
    <div
      ref={imgRef}
      onClick={onClick}
      className={`relative rounded-lg overflow-hidden border border-border-light cursor-zoom-in hover:border-accent transition-all hover:shadow-[0_0_20px_rgba(250,187,16,0.15)] bg-bg-element ${aspectSquare ? 'aspect-square' : 'min-h-[150px]'}`}
      title={(blob as any)?.name || mimeType}
    >
      {url ? (
        isImage ? (
          <img src={url} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700 ease-out" loading="lazy" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-bg-surface group">
            <Icon name={getFileIconName(mimeType || '')} className="w-8 h-8 text-accent" />
          </div>
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-text-tertiary">
          <Icon name={isImage ? "image" : "file"} className="w-6 h-6 opacity-20" />
        </div>
      )}
    </div>
  );
};

export const ChatView: React.FC<ChatViewProps> = ({ chat, messages, onSendMessage, onEditMessage, loading, onOpenLightbox, streamingText, streamingThoughts, streamingUsage, onRegenerate, onFork, onDeleteMessage, showStats, onToggleGallery, onSetPrompt, onSavePrompt, onContinueGeneration, targetEditMessageId, onClearEditTarget, startTime, onRetry, onDragCancel }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activePrompts, setActivePrompts] = useState<string[]>([]);

  useEffect(() => {
    const shuffled = [...HERO_PROMPTS].sort(() => 0.5 - Math.random());
    setActivePrompts(shuffled.slice(0, 3));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading, streamingText, streamingThoughts]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="animate-pop-in">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4 text-text-primary tracking-tight">
            Okobit
          </h1>
        </div>
        <p className="text-text-secondary text-lg mb-8 opacity-0 animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>A (slightly) less cumbersome way to use Nano Banana Pro.</p>
        <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
          {activePrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => onSetPrompt(p)}
              style={{ animationDelay: `${0.3 + (i * 0.1)}s`, animationFillMode: 'forwards' }}
              className="px-4 py-2 bg-bg-surface border border-border-light rounded-full text-sm text-text-secondary hover:text-text-primary hover:border-accent hover:-translate-y-1 transition-all shadow-sm opacity-0 animate-pop-in active:scale-95"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const showContinue = !loading && messages.length > 0 && messages[messages.length - 1].role === 'user';

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-24 pb-48 scroll-smooth" ref={scrollRef}>
      <div className="max-w-4xl mx-auto space-y-8">
        {messages.map((msg, idx) => (
          <MessageItem
            key={msg.id}
            msg={msg}
            isLast={idx === messages.length - 1}
            onEdit={onEditMessage}
            onImageClick={onOpenLightbox}
            onRegenerate={onRegenerate}
            onFork={onFork}
            onDelete={onDeleteMessage}
            showStats={showStats}
            onToggleGallery={onToggleGallery}
            onSavePrompt={onSavePrompt}
            targetEditMessageId={targetEditMessageId}
            onClearEditTarget={onClearEditTarget}
            onRetry={onRetry}
            onDragCancel={onDragCancel}
          />
        ))}

        {loading && (
          <div className="flex flex-col gap-2 animate-fade-in pl-4 pb-4">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <div className="relative w-6 h-6 flex items-center justify-center">
                  <div className="absolute inset-0 border-2 border-accent/30 rounded-full animate-ping"></div>
                  <div className="absolute inset-0 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-[30%] bg-accent/50 rounded-full animate-pulse"></div>
                </div>
              </div>
              <div className="flex flex-col gap-1 w-full max-w-[85%]">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-accent animate-pulse">Thinking...</span>
                  <LiveTimer startTime={startTime || Date.now()} />
                </div>

                {/* Live Stats */}
                {showStats && streamingUsage && (
                  <div className="text-[10px] font-mono text-text-tertiary flex gap-2">
                    <span>P: {streamingUsage.promptTokens}</span>
                    <span>O: {streamingUsage.outputTokens}</span>
                  </div>
                )}

                {streamingThoughts && (
                  <div className="mt-2 text-xs text-text-secondary font-mono bg-bg-element/30 p-2 rounded-md border-l-2 border-accent/50 whitespace-pre-wrap animate-fade-in">
                    {streamingThoughts}
                  </div>
                )}
              </div>
            </div>

            {streamingText && (
              <div className="mt-2 max-w-[85%] bg-transparent text-text-primary p-0 leading-relaxed whitespace-pre-wrap animate-slide-up pl-9">
                {streamingText}
              </div>
            )}
          </div>
        )}

        {showContinue && (
          <div className="flex flex-col items-start animate-fade-in pl-0 md:pl-2">
            <button
              onClick={onContinueGeneration}
              className="group flex items-center gap-3 px-5 py-3.5 bg-bg-surface border border-border-light rounded-2xl rounded-tl-sm text-text-secondary hover:text-text-primary hover:border-accent hover:shadow-[0_0_20px_rgba(250,187,16,0.1)] transition-all active:scale-95"
            >
              <span className="text-sm font-medium">Continue generating</span>
              <div className="w-6 h-6 rounded-full bg-bg-element flex items-center justify-center group-hover:bg-accent group-hover:text-black transition-colors">
                <Icon name="arrow-right" className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const LiveTimer: React.FC<{ startTime: number }> = ({ startTime }) => {
  const [elapsed, setElapsed] = useState("0.0s");
  useEffect(() => {
    setElapsed(((Date.now() - startTime) / 1000).toFixed(1) + "s");
    const interval = setInterval(() => {
      setElapsed(((Date.now() - startTime) / 1000).toFixed(1) + "s");
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);
  return <span className="text-xs text-text-tertiary font-mono">{elapsed}</span>;
}

const MessageItem: React.FC<{
  msg: Message,
  isLast: boolean,
  onEdit: (id: string, txt: string, keptIds?: string[], newFiles?: Blob[]) => void,
  onImageClick: (b: Blob, id: string) => void,
  onRegenerate: (id: string) => void,
  onFork: (id: string) => void,
  onDelete: (id: string) => void,
  showStats: boolean,
  onToggleGallery?: (imageIds: string[]) => void;
  onSavePrompt?: (text: string) => void;
  targetEditMessageId?: string | null;
  onClearEditTarget?: () => void;
  onRetry: (msgId: string) => void;
  onDragCancel?: () => void;
}> = ({ msg, isLast, onEdit, onImageClick, onRegenerate, onFork, onDelete, showStats, onToggleGallery, onSavePrompt, targetEditMessageId, onClearEditTarget, onRetry, onDragCancel }) => {
  const images = useLiveQuery(
    () => msg.imageIds && msg.imageIds.length > 0
      ? db.images.where('id').anyOf(msg.imageIds).toArray()
      : Promise.resolve([]),
    [msg.imageIds]
  ) || [];

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text);
  const [editImages, setEditImages] = useState<{ id?: string, blob: Blob, mimeType: string }[]>([]);

  const savedPrompt = useLiveQuery(
    () => db.prompts.where('type').equals('saved').filter(p => p.text === msg.text).first(),
    [msg.text]
  );
  const isPromptSaved = !!savedPrompt;

  useEffect(() => {
    if (isEditing) {
      setEditImages(images.map(img => ({ id: img.id, blob: img.blob, mimeType: img.mimeType })));
      setEditText(msg.text);
    }
  }, [isEditing]);

  useEffect(() => {
    if (targetEditMessageId === msg.id && !isEditing) {
      setIsEditing(true);
      if (onClearEditTarget) onClearEditTarget();
    }
  }, [targetEditMessageId, msg.id, isEditing, onClearEditTarget]);

  const handleSaveEdit = () => {
    const keptIds = editImages.map(i => i.id).filter((id): id is string => !!id);
    const newFiles = editImages.filter(i => !i.id).map(i => i.blob);

    const hasImageChanges = keptIds.length !== (msg.imageIds?.length || 0) || newFiles.length > 0;

    if (editText.trim() !== msg.text || hasImageChanges) {
      onEdit(msg.id, editText, keptIds, newFiles);
    }
    setIsEditing(false);
  };

  const handleAction = async () => {
    try {
      if (images.length > 0) {
        const blob = images[0].blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `okobit-gen-${msg.id.slice(0, 8)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (msg.text) {
        await navigator.clipboard.writeText(msg.text);
      }
    } catch (err) {
      console.error("Action failed", err);
    }
  };

  const handleBookmarkPrompt = async () => {
    if (!msg.text) return;
    const existing = await db.prompts.where('type').equals('saved').filter(p => p.text === msg.text).first();
    if (existing) {
      await db.prompts.delete(existing.id as number);
    } else {
      if (onSavePrompt) onSavePrompt(msg.text);
    }
  };

  const isUser = msg.role === 'user';
  const isSaved = images.length > 0 && images.every(i => i.isGalleryVisible);

  return (
    <div className={`flex flex-col w-full group ${isUser ? 'items-end' : 'items-start'} animate-slide-up`}>
      <div className={`relative max-w-[90%] md:max-w-[85%] rounded-2xl p-4 md:p-5 text-[0.95rem] leading-relaxed transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
         ${isUser ? 'bg-bg-surface border border-border-light text-text-primary shadow-sm rounded-br-sm' : 'bg-transparent pl-0 text-text-primary'}
         ${msg.error ? 'border-danger/50 bg-danger-bg/10 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : ''}
         ${isEditing ? 'scale-[1.02] shadow-xl ring-1 ring-accent z-10' : 'scale-100'}
      `}>

        {msg.error && (
          <div className="flex items-center gap-2 text-danger font-bold mb-2 pb-2 border-b border-danger/20">
            <Icon name="alert" className="w-4 h-4" />
            <span>Generation Failed</span>
          </div>
        )}

        {isEditing ? (
          <div
            className="w-full animate-fade-in min-w-[300px]"
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onDragCancel) onDragCancel(); // Reset parent drag state
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const newFiles = Array.from(e.dataTransfer.files).map(f => ({ blob: f, mimeType: getEffectiveMimeType(f) }));
                setEditImages(prev => [...prev, ...newFiles]);
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              className="w-full bg-bg-base border border-border-light rounded-lg p-3 text-text-primary outline-none min-h-[100px] text-[0.95rem] resize-none focus:border-accent transition-colors font-sans"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.stopPropagation(); setIsEditing(false); }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {editImages.map((img, idx) => {
                const isImage = img.mimeType.startsWith('image/');
                const fileName = (img.blob as File).name || (img.id ? 'Attached File' : 'New File');

                if (isImage) {
                  return (
                    <div key={idx} className="relative w-16 h-16 rounded-md overflow-hidden border border-border-light group/edit-img">
                      <img src={URL.createObjectURL(img.blob)} className="w-full h-full object-cover" />
                      <button onClick={() => setEditImages(prev => prev.filter((_, i) => i !== idx))} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/edit-img:opacity-100 transition-opacity text-white">
                        <Icon name="x" className="w-5 h-5" />
                      </button>
                    </div>
                  )
                }

                return (
                  <div key={idx} className="relative flex items-center gap-2 h-16 min-w-[160px] px-3 bg-bg-surface rounded-md border border-border-light group/edit-img">
                    <div className="w-8 h-8 flex items-center justify-center bg-bg-element rounded text-accent flex-shrink-0">
                      <Icon name={getFileIconName(img.mimeType)} className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <span className="text-xs font-medium text-text-primary truncate block" title={fileName}>{fileName}</span>
                      <span className="text-[10px] text-text-tertiary uppercase">{img.mimeType.split('/')[1] || 'FILE'}</span>
                    </div>
                    <button onClick={() => setEditImages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 p-1 text-text-secondary hover:text-danger opacity-100 md:opacity-0 md:group-hover/edit-img:opacity-100 transition-opacity">
                      <Icon name="x" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              <label className="w-16 h-16 rounded-md border border-dashed border-border-light flex items-center justify-center cursor-pointer hover:border-accent hover:text-accent text-text-secondary transition-colors flex-shrink-0">
                <input type="file" multiple className="hidden" onChange={(e) => {
                  if (e.target.files) {
                    const newFiles = Array.from(e.target.files).map(f => ({ blob: f, mimeType: getEffectiveMimeType(f) }));
                    setEditImages(prev => [...prev, ...newFiles]);
                  }
                }} />
                <Icon name="plus" className="w-5 h-5" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setIsEditing(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-element text-text-secondary hover:text-white hover:bg-white/10 transition-all active:scale-95" title="Cancel">
                <Icon name="x" className="w-4 h-4" />
              </button>
              <button onClick={handleSaveEdit} className="w-8 h-8 flex items-center justify-center rounded-full bg-accent text-black font-semibold hover:scale-110 transition-all shadow-[0_0_15px_rgba(250,187,16,0.4)] active:scale-95" title="Save & Regenerate">
                <Icon name="arrow-up" className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={`whitespace-pre-wrap ${isUser ? 'text-[15px]' : ''}`}>{msg.text}</div>

            {msg.thoughts && !isUser && (
              <div className="mt-2 text-xs text-text-secondary font-mono bg-bg-element/30 p-2 rounded-md border-l-2 border-accent/20 whitespace-pre-wrap">
                {msg.thoughts}
              </div>
            )}

            {images.length > 0 && (
              <div className={`mt-4 grid gap-2 ${isUser ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 max-w-[400px]' : (images.length === 1 ? 'grid-cols-1 max-w-[300px]' : 'grid-cols-2 max-w-[500px]')}`}>
                {images.map((img, i) => (
                  <LazyImageThumb
                    key={i}
                    blob={img.blob}
                    thumbnail={img.thumbnail}
                    mimeType={img.mimeType}
                    onClick={() => onImageClick(img.blob, img.id)}
                    aspectSquare={isUser}
                  />
                ))}
              </div>
            )}

            {msg.error && (
              <div className="mt-4">
                <button onClick={() => onRetry(msg.id)} className="flex items-center gap-2 bg-danger/20 hover:bg-danger text-danger hover:text-white border border-danger/50 px-4 py-2 rounded-lg transition-all active:scale-95 text-sm font-medium">
                  <Icon name="refresh" className="w-4 h-4" /> Try Again
                </button>
              </div>
            )}

            {msg.meta && !isUser && showStats && (
              <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-2 text-[10px] font-mono text-text-tertiary select-none animate-fade-in">
                <div className="flex items-center gap-1.5 bg-bg-element/50 px-2 py-1 rounded hover:bg-bg-element transition-colors" title="Model Name">
                  <Icon name="brain" className="w-3 h-3 text-accent" />
                  <span>{msg.meta.model}</span>
                  {msg.meta.modelVersion && <span className="opacity-60">· {msg.meta.modelVersion}</span>}
                </div>
                <div className="flex items-center gap-1.5 bg-bg-element/50 px-2 py-1 rounded hover:bg-bg-element transition-colors" title="Generation Duration">
                  <Icon name="clock" className="w-3 h-3 text-accent" />
                  <span>{msg.meta.duration}</span>
                </div>
                {msg.meta.tokens && (
                  <div className="flex items-center gap-1.5 bg-bg-element/50 px-2 py-1 rounded hover:bg-bg-element transition-colors" title="Token Usage">
                    <Icon name="terminal" className="w-3 h-3 text-accent" />
                    <span>
                      P {msg.meta.tokens.prompt} · O {msg.meta.tokens.output}
                      {msg.meta.tokens.thoughts ? ` · T ${msg.meta.tokens.thoughts}` : ''}
                      · Σ {msg.meta.tokens.total}
                    </span>
                  </div>
                )}
                {typeof msg.meta.costUsd === 'number' && msg.meta.costUsd > 0 && (
                  <div className="flex items-center gap-1.5 bg-bg-element/50 px-2 py-1 rounded hover:bg-bg-element transition-colors" title="Estimated Cost">
                    <Icon name="layers" className="w-3 h-3 text-accent" />
                    <span>≈ ${msg.meta.costUsd.toFixed(5)}</span>
                  </div>
                )}
                {msg.meta.finishReason && (
                  <div className="flex items-center gap-1.5 bg-bg-element/50 px-2 py-1 rounded hover:bg-bg-element transition-colors" title="Finish Reason">
                    <Icon name="check-circle" className="w-3 h-3 text-accent" />
                    <span>{msg.meta.finishReason}</span>
                  </div>
                )}
                {msg.meta.safetyBlocked && (
                  <div className="flex items-center gap-1.5 bg-danger-bg px-2 py-1 rounded text-danger" title="Safety Filter Triggered">
                    <Icon name="alert" className="w-3 h-3" />
                    <span>Safety Limited</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {!isEditing && (
        <div className={`mt-1 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity ${isUser ? 'pr-2 justify-end' : 'pl-2 justify-start'}`}>
          <button onClick={() => isUser ? setIsEditing(true) : onRegenerate(msg.id)} className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-element transition-all hover:scale-110 active:scale-95" title={isUser ? "Edit" : "Regenerate"}>
            <Icon name={isUser ? "edit" : "refresh"} className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onFork(msg.id)} className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-element transition-all hover:scale-110 active:scale-95" title="Fork Conversation">
            <Icon name="branch" className="w-3.5 h-3.5" />
          </button>
          {!isUser && images.length > 0 && onToggleGallery && (
            <button onClick={() => onToggleGallery(msg.imageIds || [])} className={`p-1.5 rounded transition-all hover:scale-110 active:scale-95 ${isSaved ? 'text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-element'}`} title={isSaved ? "Unbookmark from Gallery" : "Save to Gallery"}>
              <Icon name="bookmark" className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          )}
          {isUser && onSavePrompt && (
            <button onClick={handleBookmarkPrompt} className={`p-1.5 rounded transition-all hover:scale-110 active:scale-95 ${isPromptSaved ? 'text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-element'}`} title="Save Prompt">
              <Icon name="bookmark" className={`w-3.5 h-3.5 ${isPromptSaved ? 'fill-current' : ''}`} />
            </button>
          )}
          {(!isUser || (isUser && images.length === 0)) && (
            <button onClick={handleAction} className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-element transition-all hover:scale-110 active:scale-95" title={images.length > 0 ? "Download Image" : "Copy Text"}>
              <Icon name={images.length > 0 ? "download" : "copy"} className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => onDelete(msg.id)} className="p-1.5 rounded text-text-secondary hover:text-danger hover:bg-danger-bg transition-all hover:scale-110 active:scale-95" title="Delete Message">
            <Icon name="trash" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
