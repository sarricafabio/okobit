
import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { Chat, AppConfig, GenConfig, ModalConfig } from './types';
import { generateImageContentStream, generateChatTitle, enhancePrompt, blobToBase64, optimizeInputImage, createThumbnail, getEffectiveMimeType } from './services/geminiService';
import { deleteChatWithCleanup, deleteMessagesWithCleanup, deleteImagesIfOrphaned, cleanupOrphanedImages, forceDeleteImages } from './services/cleanupService';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { GalleryView } from './components/GalleryView';
import { Lightbox } from './components/Lightbox';
import { SettingsModal } from './components/SettingsModal';
import { GlobalModal } from './components/GlobalModal';
import { PromptHistoryModal } from './components/PromptHistoryModal';
import { Icon } from './components/Icon';
import { ASPECT_RATIOS, RESOLUTIONS } from './constants';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_CONFIG: AppConfig = {
    apiKey: '',
    themeAccent: '#FABB10',
    safetyThreshold: 'BLOCK_MEDIUM_AND_ABOVE',
    detailedVerbosity: false,
    searchGrounding: false,
    lightMode: false,
    confirmations: {
        deleteProject: true,
        deleteMessage: true,
        deleteImage: true,
        regenerate: true,
        fork: true,
        import: true,
        factoryReset: true
    }
};

const getEnvApiKey = () => {
    // Check for Node.js process.env (server-side or build-time)
    const keyFromProcess = (globalThis as any)?.process?.env?.API_KEY;
    if (typeof keyFromProcess === 'string') return keyFromProcess;

    // Check for Vite import.meta.env (client-side, properly typed via vite-env.d.ts)
    const keyFromVite = import.meta?.env?.VITE_API_KEY;
    if (typeof keyFromVite === 'string') return keyFromVite;

    return '';
};


const ENV_KEY = getEnvApiKey();

// Helper for cost estimation
const estimateImageCostUsd = (usage: any, resolution: string, imageCount: number) => {
    if (!usage) return 0;

    const inputRatePerM = 2; // $2 per 1M input tokens
    const imageRatePerM = 120; // $120 per 1M image output tokens (approximate for Pro Image)

    const promptCost = (usage.promptTokens / 1_000_000) * inputRatePerM;

    // Fallback estimate if output tokens are low (heuristic)
    let outputTokens = usage.outputTokens;
    if ((!outputTokens || outputTokens === 0) && imageCount > 0) {
        outputTokens = (resolution === '4K' ? 2000 : 1120) * imageCount;
    }

    const outputCost = (outputTokens / 1_000_000) * imageRatePerM;

    return promptCost + outputCost;
};

// Helper to determine icon based on mime type
const getFileIconName = (mime: string): any => {
    if (mime.startsWith('audio/')) return 'volume-2';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('image/')) return 'image';
    if (mime.includes('pdf')) return 'file-text';
    if (mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript') || mime.includes('xml') || mime.includes('html')) return 'file-text';
    return 'file';
};

export default function App() {
    // --- State ---
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<'chat' | 'gallery'>('chat');

    // Replaced isLoading boolean with generatingChatId string to track WHICH chat is working
    const [generatingChatId, setGeneratingChatId] = useState<string | null>(null);
    const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);

    const [isMagicLoading, setIsMagicLoading] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [streamingThoughts, setStreamingThoughts] = useState('');
    const [streamingUsage, setStreamingUsage] = useState<any>(null);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [lightboxData, setLightboxData] = useState<{ blob: Blob, idx: number, context: { blob: Blob, id: string }[] } | null>(null);
    const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const [promptText, setPromptText] = useState('');
    const [attachedFiles, setAttachedFiles] = useState<Blob[]>([]);
    const [showAdv, setShowAdv] = useState(false);

    // For Alt+E shortcut
    const [targetEditMessageId, setTargetEditMessageId] = useState<string | null>(null);

    // Guard against parallel generation
    const isGeneratingRef = useRef(false);
    // Ref to track generatingChatId synchronously to avoid stale state in conflict checks
    const generatingChatIdRef = useRef<string | null>(null);

    // Guard against double submission (debounce)
    const isSubmittingRef = useRef(false);
    const safetyTimeoutRef = useRef<number | null>(null);

    const isCreatingRef = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dragCounter = useRef(0);
    const abortRef = useRef<AbortController | null>(null);

    const [config, setConfig] = useState<AppConfig>(() => {
        try {
            const saved = localStorage.getItem('okobit_config');
            let initialConfig = saved ? JSON.parse(saved) : DEFAULT_CONFIG;

            // Merge missing keys if config structure updated
            initialConfig = {
                ...DEFAULT_CONFIG,
                ...initialConfig,
                confirmations: { ...DEFAULT_CONFIG.confirmations, ...(initialConfig.confirmations || {}) }
            };

            if (ENV_KEY && !initialConfig.apiKey) {
                initialConfig.apiKey = ENV_KEY;
            }
            return initialConfig;
        } catch (e) {
            return DEFAULT_CONFIG;
        }
    });

    const [genConfig, setGenConfig] = useState<GenConfig>({
        aspectRatio: 'auto',
        resolution: '1K'
    });

    const chats = useLiveQuery(() => db.chats.orderBy('updatedAt').reverse().toArray());

    const activeChatMessages = useLiveQuery(
        () => activeChatId ? db.messages.where('chatId').equals(activeChatId).sortBy('timestamp') : Promise.resolve([]),
        [activeChatId]
    ) || [];

    const currentChat = (chats && activeChatId) ? chats.find(c => c.id === activeChatId) : null;

    // Derived state for loading
    const isGenerating = !!generatingChatId;
    const isGeneratingCurrent = generatingChatId === activeChatId;

    // Calculate project stats
    const activeChatStats = React.useMemo(() => {
        let totalTokens = 0;
        let totalCost = 0;
        activeChatMessages.forEach(msg => {
            if (msg.meta?.tokens?.total) totalTokens += msg.meta.tokens.total;
            if (msg.meta?.costUsd) totalCost += msg.meta.costUsd;
        });
        return { totalTokens, totalCost };
    }, [activeChatMessages]);

    // --- Effects ---

    // Automatic Cleanup on Mount
    useEffect(() => {
        cleanupOrphanedImages().catch(console.error);
    }, []);

    // Apply Theme
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--accent', config.themeAccent);
        const r = parseInt(config.themeAccent.slice(1, 3), 16);
        const g = parseInt(config.themeAccent.slice(3, 5), 16);
        const b = parseInt(config.themeAccent.slice(5, 7), 16);
        root.style.setProperty('--accent-dim', `rgba(${r}, ${g}, ${b}, 0.1)`);

        if (config.lightMode) {
            root.classList.add('light');
        } else {
            root.classList.remove('light');
        }


        localStorage.setItem('okobit_config', JSON.stringify(config));
    }, [config]);

    // Dynamic Text Contrast (runs only when settings are close to save performance as requested)
    useEffect(() => {
        if (!settingsOpen) {
            const hex = config.themeAccent.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            // YIQ equation
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            document.documentElement.style.setProperty('--text-on-accent', yiq >= 128 ? '#000000' : '#ffffff');
        }
    }, [config.themeAccent, settingsOpen]);


    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [promptText]);

    // First Time Onboarding
    const showWelcomeFlow = () => {
        setModalConfig({
            type: 'welcome',
            title: 'Welcome to Okobit',
            message: 'Hi! I am Okobit. Insert your Google API key to continue.',
            placeholder: 'AIzaSy...',
            confirmText: 'Start Creating',
            onConfirm: (key) => {
                if (key && key.trim()) {
                    setConfig(prev => ({ ...prev, apiKey: key.trim() }));
                } else {
                    handleWelcomeDismiss();
                }
            },
            onCancel: () => {
                handleWelcomeDismiss();
            }
        });
    };

    const handleWelcomeDismiss = () => {
        setTimeout(() => {
            setModalConfig({
                type: 'confirm',
                title: 'Skip Setup?',
                message: 'The app will not work properly without an API key. Are you sure you want to proceed?',
                confirmText: 'I understand',
                cancelText: 'Go Back',
                onConfirm: () => setModalConfig(null),
                onCancel: () => setTimeout(showWelcomeFlow, 0)
            });
        }, 10);
    };

    useEffect(() => {
        if (!config.apiKey && !ENV_KEY) {
            setTimeout(() => {
                showWelcomeFlow();
            }, 500);
        }
    }, []);

    // Init Data
    useEffect(() => {
        if (!chats) return;

        const initData = async () => {
            if (chats.length > 0 && !activeChatId) {
                setActiveChatId(chats[0].id);
                return;
            }
            if (chats.length === 0 && !isCreatingRef.current) {
                await createNewChat(true);
            }
        };
        initData();
    }, [chats, activeChatId]);


    // --- Handlers ---
    const showModal = (config: ModalConfig) => setModalConfig(config);

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (lightboxData) return;
        if (currentView === 'gallery') return;

        dragCounter.current += 1;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setIsDragging(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        if (lightboxData) return;
        if (currentView === 'gallery') return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const filesToAdd = Array.from(e.dataTransfer.files);
            if (filesToAdd.length > 0) {
                setAttachedFiles(prev => [...prev, ...filesToAdd]);
            }
            e.dataTransfer.clearData();
        }
    };

    // Called by child components to reset drag state when they handle the drop
    const handleDragCancel = () => {
        setIsDragging(false);
        dragCounter.current = 0;
    };

    const createNewChat = async (force = false) => {
        if (isCreatingRef.current) return;

        if (!force && activeChatId) {
            const count = await db.messages.where('chatId').equals(activeChatId).count();
            if (count === 0) {
                setCurrentView('chat');
                if (window.innerWidth <= 768) setIsSidebarOpen(false);
                return;
            }
        }

        isCreatingRef.current = true;

        try {
            if (!force && chats) {
                const allChats = await db.chats.toArray();
                for (const c of allChats) {
                    const msgCount = await db.messages.where('chatId').equals(c.id).count();
                    if (msgCount === 0) {
                        setActiveChatId(c.id);
                        setCurrentView('chat');
                        if (window.innerWidth <= 768) setIsSidebarOpen(false);
                        isCreatingRef.current = false;
                        return;
                    }
                }
            }

            const id = uuidv4();
            await db.chats.add({
                id,
                title: 'New Project',
                pinned: false,
                orderIndex: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            setActiveChatId(id);
            setCurrentView('chat');
            if (window.innerWidth <= 768) setIsSidebarOpen(false);
        } catch (e) {
            console.error("Failed to create chat", e);
        } finally {
            setTimeout(() => {
                isCreatingRef.current = false;
            }, 500);
        }
    };

    const handleDeleteChat = async (id: string) => {
        const performDelete = async () => {
            let nextChatId = activeChatId;
            if (activeChatId === id && chats) {
                const remaining = chats.filter(c => c.id !== id);
                nextChatId = remaining.length > 0 ? remaining[0].id : null;
            }

            try {
                // Replaced direct transaction with cleanup service
                await deleteChatWithCleanup(id);
            } catch (e) {
                console.error("Delete failed", e);
                return;
            }

            if (nextChatId) {
                setActiveChatId(nextChatId);
            } else {
                setActiveChatId(null);
                await createNewChat(true);
            }
        };

        if (config.confirmations.deleteProject) {
            showModal({
                type: 'confirm',
                title: 'Delete Project?',
                message: 'This action cannot be undone. Any images not saved to gallery will be deleted.',
                confirmText: 'Delete',
                onConfirm: performDelete
            });
        } else {
            performDelete();
        }
    };

    const handleAbortGeneration = () => {
        if (abortRef.current) {
            abortRef.current.abort();
        }
        setGeneratingChatId(null);
        generatingChatIdRef.current = null;
        setGenerationStartTime(null);
        isGeneratingRef.current = false;
        setStreamingText('');
        setStreamingThoughts('');
        setStreamingUsage(null);
    };

    // Helper to check for active generation in another chat and prompt user
    const handleCheckConflict = (onProceed: () => void, onCancel?: () => void) => {
        // Logic: If isGenerating is TRUE, or we have a ChatId that is currently generating
        // Use Ref for generatingChatId to ensure we have the absolute latest value immediately
        const currentGenId = generatingChatIdRef.current;

        if (isGeneratingRef.current || currentGenId) {
            // If in another chat
            if (currentGenId && currentGenId !== activeChatId) {
                const chatTitle = chats?.find(c => c.id === currentGenId)?.title || "another chat";
                showModal({
                    type: 'confirm',
                    title: 'Halt current generation?',
                    message: `Generation is in progress in "${chatTitle}". Only one image can be generated at a time. Starting a new generation will halt the current one.`,
                    confirmText: 'Halt & Start New',
                    cancelText: 'Cancel',
                    onConfirm: () => {
                        handleAbortGeneration();
                        setTimeout(() => onProceed(), 100); // Give time for cleanup
                    },
                    onCancel: () => {
                        if (onCancel) onCancel();
                    }
                });
                return;
            } else {
                // In same chat - just restart (abort previous)
                handleAbortGeneration();
                setTimeout(() => onProceed(), 100);
                return;
            }
        }

        // No conflict
        onProceed();
    };

    const processGeneration = async (chatId: string, text: string, files: Blob[]) => {
        // Double check guard (handleCheckConflict should have cleared it)
        if (isGeneratingRef.current) {
            console.warn("Generation collision, forcing abort.");
            handleAbortGeneration();
            await new Promise(r => setTimeout(r, 100));
        }

        isGeneratingRef.current = true;
        generatingChatIdRef.current = chatId;
        setGeneratingChatId(chatId);
        setGenerationStartTime(Date.now());
        setStreamingText('');
        setStreamingThoughts('');
        setStreamingUsage(null);
        const startTime = Date.now();

        if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = window.setTimeout(() => {
            if (isGeneratingRef.current) {
                console.error("Generation timed out safety release.");
                handleAbortGeneration();
            }
        }, 120000);

        const localAbortController = new AbortController();
        abortRef.current = localAbortController;

        try {
            const conversationParts: any[] = [];

            const allMessagesInChat = await db.messages.where('chatId').equals(chatId).sortBy('timestamp');

            // Optimization: Only send images for the last 8 messages (turns) to avoid Payload Too Large errors.
            // We always send the full text history for context.
            const IMAGE_HISTORY_LIMIT = 8;
            const imageInclusionStartIndex = Math.max(0, allMessagesInChat.length - IMAGE_HISTORY_LIMIT);

            for (let i = 0; i < allMessagesInChat.length; i++) {
                const msg = allMessagesInChat[i];

                if (msg.text) {
                    conversationParts.push({ text: msg.text });
                }

                // Only include images if this message is within the recent history window
                if (i >= imageInclusionStartIndex && msg.imageIds && msg.imageIds.length > 0) {
                    const imgBlobs = await db.images.where('id').anyOf(msg.imageIds).toArray();
                    for (const imgBlob of imgBlobs) {
                        if (imgBlob) {
                            const b64 = await blobToBase64(imgBlob.blob);
                            conversationParts.push({
                                inlineData: {
                                    data: b64,
                                    mimeType: imgBlob.mimeType
                                }
                            });
                        }
                    }
                }
            }

            if (allMessagesInChat.length === 1 && allMessagesInChat[0].role === 'user') {
                generateChatTitle(config.apiKey, text).then(title => {
                    db.chats.update(chatId, { title });
                }).catch(console.error);
            }

            const { text: responseText, thoughts: responseThoughts, images, thumbnails, usage, modelVersion, finishReason, safetyBlocked } = await generateImageContentStream({
                apiKey: config.apiKey,
                contents: conversationParts,
                config: genConfig,
                safetySetting: config.safetyThreshold,
                signal: abortRef.current.signal,
                searchGrounding: config.searchGrounding,
                onProgress: (txt, th, usg) => {
                    setStreamingText(txt);
                    setStreamingThoughts(th);
                    if (usg) setStreamingUsage(usg);
                }
            });

            if (localAbortController.signal.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            // Save generated images and thumbnails
            const genImageIds: string[] = [];
            for (let i = 0; i < images.length; i++) {
                const id = uuidv4();
                await db.images.add({
                    id,
                    blob: images[i],
                    thumbnail: thumbnails[i],
                    mimeType: images[i].type,
                    createdAt: Date.now(),
                    isGalleryVisible: false
                });
                genImageIds.push(id);
            }

            const durationSeconds = (Date.now() - startTime) / 1000;
            const duration = `${durationSeconds.toFixed(1)}s`;

            const costUsd = estimateImageCostUsd(usage, genConfig.resolution, images.length);

            await db.messages.add({
                id: uuidv4(),
                chatId: chatId,
                role: 'model',
                text: responseText,
                thoughts: responseThoughts,
                imageIds: genImageIds,
                timestamp: Date.now(),
                meta: {
                    model: 'Gemini 3 Pro',
                    modelVersion,
                    duration,
                    tokens: usage ? {
                        prompt: usage.promptTokens,
                        output: usage.outputTokens,
                        thoughts: usage.thoughtsTokens,
                        total: usage.totalTokens
                    } : undefined,
                    costUsd,
                    finishReason,
                    safetyBlocked
                }
            });

            await db.chats.update(chatId, { updatedAt: Date.now() });

        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log("Generation aborted");
            } else {
                console.error(error);
                let errorMsg = "Error generating content.";
                if (error.message.includes('safety')) errorMsg = "Generation blocked by safety filters.";
                if (error.message.includes('quota')) errorMsg = "API quota exceeded.";
                if (error.message.includes('key')) errorMsg = "Invalid API Key.";

                await db.messages.add({
                    id: uuidv4(),
                    chatId: chatId,
                    role: 'model',
                    text: errorMsg,
                    timestamp: Date.now(),
                    error: true
                });
            }
        } finally {
            if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);

            // Fix: Add delay to prevent UI race condition where "Continue" button appears 
            // before the new message is rendered by useLiveQuery.
            // This ensures the stream is visually "active" until the result is truly visible.
            setTimeout(() => {
                // Only clear if we haven't started a NEW generation in the meantime (though isGeneratingRef guards this, double check)
                if (generatingChatIdRef.current === chatId) {
                    setGeneratingChatId(null);
                    generatingChatIdRef.current = null;
                    setGenerationStartTime(null);
                    setStreamingText('');
                    setStreamingThoughts('');
                    setStreamingUsage(null);
                    abortRef.current = null;
                    isGeneratingRef.current = false;
                }
            }, 1000);
        }
    };

    const handleSendMessage = async (text: string = promptText, files: Blob[] = attachedFiles) => {
        // Lock against rapid double-submit (e.g. Enter key bouncing)
        if (isSubmittingRef.current) return;
        if ((!text.trim() && files.length === 0) || !activeChatId) return;
        if (!config.apiKey) {
            setSettingsOpen(true);
            showModal({ type: 'alert', title: 'Setup Required', message: "Please enter your Gemini API Key in Settings to continue." });
            return;
        }

        // Set lock
        isSubmittingRef.current = true;

        handleCheckConflict(
            async () => {
                try {
                    // Auto-close settings
                    setShowAdv(false);

                    if (text.trim()) {
                        try {
                            await db.prompts.add({
                                text: text.trim(),
                                type: 'recent',
                                timestamp: Date.now()
                            });

                            const count = await db.prompts.where('type').equals('recent').count();
                            if (count > 20) {
                                const oldest = await db.prompts.where('type').equals('recent').sortBy('timestamp');
                                const toDelete = oldest.slice(0, count - 20);
                                const ids = toDelete
                                    .map(p => p.id)
                                    .filter((id): id is number => typeof id === 'number');
                                await db.prompts.bulkDelete(ids);
                            }
                        } catch (e) {
                            console.error("Failed to save history", e);
                        }
                    }

                    const userMsgId = uuidv4();

                    // Process and Validate Files
                    const imageIds: string[] = [];
                    if (files.length > 0) {
                        for (const file of files) {
                            const effectiveType = getEffectiveMimeType(file);

                            if (!effectiveType || effectiveType === 'application/octet-stream') {
                                const name = 'name' in file ? (file as File).name : 'File';
                                showModal({ type: 'alert', title: 'Unsupported File', message: `Could not determine valid type for "${name}". Please ensure it has a valid extension.` });
                                isSubmittingRef.current = false;
                                return;
                            }

                            // Pass effectiveType to image processing to ensure files with inferred types (e.g. missing browser type)
                            // are still handled correctly if they are actually images.
                            const optimized = await optimizeInputImage(file, effectiveType);
                            const thumb = await createThumbnail(file, effectiveType, 300);

                            // If optimization created a new blob (resized), it has the correct type (png/jpeg).
                            // If it returned the original, we must use our effective inferred type.
                            const finalBlob = optimized;
                            const finalMime = (finalBlob !== file && finalBlob.type) ? finalBlob.type : effectiveType;

                            const imgId = uuidv4();
                            await db.images.add({
                                id: imgId,
                                blob: finalBlob,
                                thumbnail: thumb,
                                mimeType: finalMime,
                                createdAt: Date.now(),
                                isGalleryVisible: false
                            });
                            imageIds.push(imgId);
                        }
                    }

                    await db.messages.add({
                        id: userMsgId,
                        chatId: activeChatId,
                        role: 'user',
                        text: text,
                        imageIds: imageIds,
                        timestamp: Date.now()
                    });

                    setPromptText('');
                    setAttachedFiles([]);

                    // Debounce release of submission lock to prevent accidental double-generation
                    setTimeout(() => {
                        isSubmittingRef.current = false;
                    }, 500);

                    await processGeneration(activeChatId, text, files);
                } catch (err) {
                    console.error("Error in message processing", err);
                    isSubmittingRef.current = false;
                }
            },
            () => {
                // Unlock on cancel
                isSubmittingRef.current = false;
            }
        );
    };

    const handleMagicPrompt = async () => {
        if (!promptText || !config.apiKey) return;
        setIsMagicLoading(true);

        try {
            const magic = await Promise.race([
                enhancePrompt(config.apiKey, promptText),
                new Promise<string>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 8000)
                )
            ]);
            setPromptText(magic);
        } catch (e: any) {
            if (e.message === 'Timeout') {
                showModal({ type: 'alert', message: "Magic prompt timed out. Please try again." });
            } else {
                showModal({ type: 'alert', message: "Magic prompt failed. Check connection." });
            }
        } finally {
            setIsMagicLoading(false);
        }
    };

    const handleEditMessage = async (msgId: string, newText: string, keptImageIds: string[] = [], newFiles: Blob[] = []) => {
        const targetMsg = await db.messages.get(msgId);
        if (!targetMsg || !activeChatId) return;

        handleCheckConflict(async () => {
            setShowAdv(false); // Close settings on edit regen too

            const subsequentCount = await db.messages
                .where('chatId').equals(activeChatId)
                .and(m => m.timestamp > targetMsg.timestamp)
                .count();

            const performRegenerate = async () => {
                const laterMessages = await db.messages.where('chatId').equals(activeChatId).and(m => m.timestamp > targetMsg.timestamp).toArray();

                // Clean up later messages and their images
                await deleteMessagesWithCleanup(laterMessages.map(m => m.id));

                let finalImageIds = [...keptImageIds];

                if (newFiles.length > 0) {
                    for (const file of newFiles) {
                        const effectiveType = getEffectiveMimeType(file);

                        if (!effectiveType || effectiveType === 'application/octet-stream') {
                            const name = 'name' in file ? (file as File).name : 'File';
                            showModal({ type: 'alert', title: 'Unsupported File', message: `Could not determine valid type for "${name}". Please ensure it has a valid extension.` });
                            return; // Abort edit
                        }

                        const optimized = await optimizeInputImage(file, effectiveType);
                        const thumb = await createThumbnail(file, effectiveType, 300);

                        const finalBlob = optimized;
                        const finalMime = (finalBlob !== file && finalBlob.type) ? finalBlob.type : effectiveType;

                        const imgId = uuidv4();
                        await db.images.add({
                            id: imgId,
                            blob: finalBlob,
                            thumbnail: thumb,
                            mimeType: finalMime,
                            createdAt: Date.now(),
                            isGalleryVisible: false
                        });
                        finalImageIds.push(imgId);
                    }
                }

                if (targetMsg.imageIds) {
                    const removedIds = targetMsg.imageIds.filter(id => !keptImageIds.includes(id));
                    if (removedIds.length > 0) {
                        // Smart cleanup for removed images from the edited message
                        await deleteImagesIfOrphaned(removedIds);
                    }
                }

                await db.messages.update(msgId, { text: newText, imageIds: finalImageIds });
                processGeneration(activeChatId, newText, []);
            };

            if (config.confirmations.regenerate) {
                const message = subsequentCount > 0
                    ? 'This will modify the message and regenerate a new response. Subsequent messages will be removed.'
                    : 'This will modify the message and regenerate a new response.';

                showModal({
                    type: 'confirm',
                    title: 'Regenerate Response?',
                    message: message,
                    confirmText: 'Regenerate',
                    onConfirm: performRegenerate
                });
            } else {
                performRegenerate();
            }
        });
    };

    const handleRegenerate = async (msgId: string) => {
        const targetMsg = await db.messages.get(msgId);
        if (!targetMsg || !activeChatId) return;

        if (targetMsg.role === 'model') {
            handleCheckConflict(async () => {
                const performRegenerate = async () => {
                    const prevUserMsg = await db.messages.where('chatId').equals(activeChatId)
                        .and(m => m.timestamp < targetMsg.timestamp && m.role === 'user')
                        .reverse().first();

                    if (!prevUserMsg) return;

                    const laterMessages = await db.messages.where('chatId').equals(activeChatId).and(m => m.timestamp >= targetMsg.timestamp).toArray();

                    // Use cleanup service
                    await deleteMessagesWithCleanup(laterMessages.map(m => m.id));

                    processGeneration(activeChatId, prevUserMsg.text, []);
                };

                if (config.confirmations.regenerate) {
                    showModal({
                        type: 'confirm',
                        title: 'Regenerate Response?',
                        message: 'This will delete this response and all following messages, then regenerate using the previous prompt.',
                        confirmText: 'Regenerate',
                        onConfirm: performRegenerate
                    });
                } else {
                    performRegenerate();
                }
            });
        }
    };

    const handleRetry = async (msgId: string) => {
        const targetMsg = await db.messages.get(msgId);
        if (!targetMsg || !activeChatId) return;

        handleCheckConflict(async () => {
            const prevUserMsg = await db.messages.where('chatId').equals(activeChatId)
                .and(m => m.timestamp < targetMsg.timestamp && m.role === 'user')
                .reverse().first();

            if (!prevUserMsg) return;
            // Clean up the failed message
            await deleteMessagesWithCleanup([msgId]);
            processGeneration(activeChatId, prevUserMsg.text, []);
        });
    }

    const handleFork = async (msgId: string) => {
        const targetMsg = await db.messages.get(msgId);
        if (!targetMsg || !activeChatId) return;

        const performFork = async () => {
            try {
                const msgsToCopy = await db.messages.where('chatId').equals(activeChatId)
                    .and(m => m.timestamp <= targetMsg.timestamp).sortBy('timestamp');

                const newChatId = uuidv4();
                const timestamp = Date.now();

                await db.chats.add({
                    id: newChatId,
                    title: `${currentChat?.title || 'Fork'} (Copy)`,
                    pinned: false,
                    orderIndex: 0,
                    createdAt: timestamp,
                    updatedAt: timestamp
                });

                const newMessages = msgsToCopy.map(m => ({
                    ...m,
                    id: uuidv4(),
                    chatId: newChatId
                }));

                await db.messages.bulkAdd(newMessages);

                setActiveChatId(newChatId);

                if (targetMsg.role === 'user') {
                    setTimeout(() => {
                        handleCheckConflict(() => processGeneration(newChatId, targetMsg.text, []));
                    }, 100);
                }

            } catch (e) {
                console.error("Fork failed", e);
                showModal({ type: 'alert', title: 'Error', message: 'Failed to fork conversation.' });
            }
        };

        if (config.confirmations.fork) {
            showModal({
                type: 'confirm',
                title: 'Fork Conversation?',
                message: 'Create a new chat starting from this point? The current chat will remain unchanged.',
                confirmText: 'Fork Chat',
                onConfirm: performFork
            });
        } else {
            performFork();
        }
    };

    const handleContinueGeneration = async () => {
        if (!activeChatId || !activeChatMessages.length) return;
        const lastMsg = activeChatMessages[activeChatMessages.length - 1];
        if (lastMsg.role === 'user') {
            handleCheckConflict(() => {
                processGeneration(activeChatId, lastMsg.text, []);
            });
        }
    };

    const handleEditTitle = (id: string, currentTitle: string) => {
        showModal({
            type: 'prompt',
            title: 'Rename Project',
            inputValue: currentTitle,
            onConfirm: (val) => { if (val) db.chats.update(id, { title: val }); }
        });
    };

    const handleDeleteMessage = async (msgId: string) => {
        const performDelete = async () => {
            // Use cleanup service
            await deleteMessagesWithCleanup([msgId]);
        };

        if (config.confirmations.deleteMessage) {
            showModal({
                type: 'confirm',
                title: 'Delete Message?',
                message: 'This will remove the message from the conversation.',
                confirmText: 'Delete',
                onConfirm: performDelete
            });
        } else {
            performDelete();
        }
    };

    const handleDeleteImage = (imageId: string) => {
        const performDelete = async () => {
            try {
                // Replaced logic with new forceDeleteImages service function
                await forceDeleteImages([imageId]);
                setLightboxData(null);
            } catch (e) {
                console.error("Failed to delete image", e);
                showModal({ type: 'alert', title: 'Error', message: 'Failed to delete image.' });
            }
        };

        if (config.confirmations.deleteImage) {
            showModal({
                type: 'confirm',
                title: 'Delete Image?',
                message: 'This will permanently remove the image from the gallery and history.',
                confirmText: 'Delete',
                onConfirm: performDelete
            });
        } else {
            performDelete();
        }
    };

    const handleBulkDeleteImages = (imageIds: string[]) => {
        const performDelete = async () => {
            try {
                // Replaced logic with new forceDeleteImages service function
                await forceDeleteImages(imageIds);
            } catch (e) {
                console.error("Failed to bulk delete", e);
                showModal({ type: 'alert', title: 'Error', message: 'Failed to delete images.' });
            }
        };

        if (config.confirmations.deleteImage) {
            showModal({
                type: 'confirm',
                title: 'Delete Images?',
                message: `This will permanently remove ${imageIds.length} images.`,
                confirmText: 'Delete All',
                onConfirm: performDelete
            });
        } else {
            performDelete();
        }
    };

    const handleBulkUnbookmark = async (imageIds: string[]) => {
        await db.transaction('rw', db.images, async () => {
            for (const id of imageIds) {
                await db.images.update(id, {
                    isGalleryVisible: false,
                    galleryTimestamp: undefined // Remove from sparse index
                });
            }
        });
    };

    const handleToggleGallery = async (imageIds: string[]) => {
        const currentCount = await db.images.filter(i => i.isGalleryVisible).count();
        const images = await db.images.bulkGet(imageIds);
        const validImages = images.filter(i => !!i) as import('./types').ImageBlob[];

        const anyUnsaved = validImages.some(i => !i.isGalleryVisible);

        if (anyUnsaved) {
            const availableSlots = 50 - currentCount;
            const toSave = validImages.filter(i => !i.isGalleryVisible);

            if (toSave.length > availableSlots) {
                showModal({
                    type: 'alert',
                    title: 'Gallery Full',
                    message: `Cannot save ${toSave.length} images. Only ${availableSlots} slots remaining in gallery (Max 50).`
                });
                return;
            }

            await db.transaction('rw', db.images, async () => {
                for (const img of toSave) {
                    await db.images.update(img.id, {
                        isGalleryVisible: true,
                        galleryTimestamp: img.createdAt // Add to sparse index
                    });
                }
            });
        } else {
            await db.transaction('rw', db.images, async () => {
                for (const img of validImages) {
                    await db.images.update(img.id, {
                        isGalleryVisible: false,
                        galleryTimestamp: undefined // Remove from sparse index
                    });
                }
            });
        }
    };

    const handleSavePrompt = async (text: string) => {
        try {
            const exists = await db.prompts.where('type').equals('saved').filter(p => p.text === text.trim()).first();
            if (!exists) {
                await db.prompts.add({
                    text: text.trim(),
                    type: 'saved',
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            console.error("Failed to save prompt", e);
        }
    };

    const handleChatImageClick = async (blob: Blob, clickedId: string) => {
        const allImageIds = activeChatMessages.flatMap(msg => msg.imageIds || []);
        const images = await db.images.bulkGet(allImageIds);
        const context = images
            .filter((img): img is import('./types').ImageBlob => !!img)
            .map(img => ({ blob: img.blob, id: img.id }));

        const idx = context.findIndex(c => c.id === clickedId);
        if (idx !== -1) {
            setLightboxData({ blob, idx, context });
        } else {
            setLightboxData({ blob, idx: 0, context: [{ blob, id: clickedId }] });
        }
    };

    // Global Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); setIsSidebarOpen(prev => !prev); }
            if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); createNewChat(); }
            if (e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setSettingsOpen(true); }
            if (e.altKey && e.key === '/') { e.preventDefault(); setModalConfig({ type: 'shortcuts', title: 'Keyboard Shortcuts' }); }
            if (e.altKey && e.key.toLowerCase() === 'c') { e.preventDefault(); handleAbortGeneration(); }
            if (e.altKey && e.key.toLowerCase() === 'e') {
                e.preventDefault();
                if (currentView === 'chat' && activeChatId) {
                    const lastUserMsg = [...activeChatMessages].reverse().find(m => m.role === 'user');
                    if (lastUserMsg) setTargetEditMessageId(lastUserMsg.id);
                }
            }
            const isNext = e.altKey && e.key === 'ArrowDown';
            const isPrev = e.altKey && e.key === 'ArrowUp';
            if ((isNext || isPrev) && chats && chats.length > 1 && activeChatId) {
                e.preventDefault();
                const currentIndex = chats.findIndex(c => c.id === activeChatId);
                if (currentIndex !== -1) {
                    let nextIndex;
                    if (isNext) nextIndex = (currentIndex + 1) % chats.length;
                    else nextIndex = (currentIndex - 1 + chats.length) % chats.length;
                    setActiveChatId(chats[nextIndex].id);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [chats, activeChatId, activeChatMessages, currentView, generatingChatId]);

    return (
        <div
            className="fixed inset-0 h-[100dvh] w-full flex bg-bg-base text-text-primary overflow-hidden font-sans selection:bg-accent selection:text-black"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <Sidebar
                isOpen={isSidebarOpen}
                onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
                chats={chats || []}
                activeChatId={activeChatId}
                onSelectChat={(id) => { setActiveChatId(id); setCurrentView('chat'); if (window.innerWidth <= 768) setIsSidebarOpen(false); }}
                onNewChat={() => createNewChat()}
                onDeleteChat={handleDeleteChat}
                onPinChat={(id) => { const c = chats?.find(c => c.id === id); if (c) db.chats.update(id, { pinned: !c.pinned }); }}
                onEditTitle={handleEditTitle}
                currentView={currentView}
                onViewChange={setCurrentView}
                onOpenSettings={() => setSettingsOpen(true)}
                generatingChatId={generatingChatId}
                stats={config.detailedVerbosity ? activeChatStats : undefined}
            />

            <main className={`flex-1 flex flex-col relative transition-all duration-300 ${isSidebarOpen && window.innerWidth > 768 ? 'ml-[280px]' : 'ml-0'}`}>
                {!isSidebarOpen && (
                    <button onClick={() => setIsSidebarOpen(true)} className="absolute top-4 left-4 z-20 p-2 bg-bg-element border border-border-light rounded-lg text-text-secondary hover:text-text-primary md:hidden active:scale-95 transition-transform">
                        <Icon name="menu" />
                    </button>
                )}
                <button onClick={() => setIsSidebarOpen(true)} className={`absolute top-4 left-4 z-20 p-2 bg-bg-element border border-border-light rounded-lg text-text-secondary hover:text-text-primary hidden md:block transition-all ${isSidebarOpen ? 'opacity-0 pointer-events-none scale-50' : 'opacity-100 scale-100'}`}>
                    <Icon name="menu" />
                </button>

                <div className="flex-1 flex flex-col h-full animate-fade-in relative" key={currentView}>
                    {currentView === 'chat' ? (
                        <>
                            <div className="absolute top-0 left-0 right-0 h-16 bg-bg-base/80 backdrop-blur-md border-b border-border-light z-10 flex items-center justify-center pointer-events-none">
                                <div className="text-center pointer-events-auto">
                                    <div className="font-semibold text-text-primary animate-slide-up flex items-center gap-2 justify-center">
                                        {currentChat?.title || "Okobit"}
                                        {generatingChatId === currentChat?.id && (
                                            <Icon name="sparkles" className="w-4 h-4 text-accent animate-spin" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {chats ? (
                                <ChatView
                                    chat={currentChat || { id: 'temp', title: 'Loading...', pinned: false, orderIndex: 0, createdAt: 0, updatedAt: 0 }}
                                    messages={activeChatMessages}
                                    onSendMessage={handleSendMessage}
                                    onEditMessage={handleEditMessage}
                                    loading={generatingChatId === currentChat?.id}
                                    onOpenLightbox={handleChatImageClick}
                                    streamingText={generatingChatId === currentChat?.id ? streamingText : ''}
                                    streamingThoughts={generatingChatId === currentChat?.id ? streamingThoughts : ''}
                                    streamingUsage={generatingChatId === currentChat?.id ? streamingUsage : null}
                                    onRegenerate={handleRegenerate}
                                    onFork={handleFork}
                                    onDeleteMessage={handleDeleteMessage}
                                    showStats={config.detailedVerbosity}
                                    onToggleGallery={handleToggleGallery}
                                    onSetPrompt={(text) => {
                                        setPromptText(text);
                                        if (textareaRef.current) textareaRef.current.focus();
                                    }}
                                    onSavePrompt={handleSavePrompt}
                                    onContinueGeneration={handleContinueGeneration}
                                    targetEditMessageId={targetEditMessageId}
                                    onClearEditTarget={() => setTargetEditMessageId(null)}
                                    startTime={generationStartTime}
                                    onRetry={handleRetry}
                                    onDragCancel={handleDragCancel}
                                />
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-text-secondary">
                                    <div className="animate-spin-slow">🍌</div>
                                </div>
                            )}

                            {currentChat && (
                                <div className="absolute bottom-6 left-0 right-0 px-4 z-20 flex justify-center pointer-events-none">
                                    <div className="w-full max-w-3xl bg-[var(--bg-prompt)] backdrop-blur-xl border border-[var(--border-light)] rounded-2xl shadow-2xl p-3 pointer-events-auto transition-all focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 animate-slide-up">
                                        {attachedFiles.length > 0 && (
                                            <div className="flex gap-2 overflow-x-auto pb-2 mb-2 animate-fade-in scrollbar-thin scrollbar-thumb-bg-element scrollbar-track-transparent">
                                                {attachedFiles.map((f, i) => {
                                                    const isImage = f.type.startsWith('image/');
                                                    const fileName = (f as File).name || 'Unknown File';

                                                    if (isImage) {
                                                        return (
                                                            <div key={i} className="relative w-14 h-14 flex-shrink-0 rounded-md overflow-hidden border border-border-light group animate-pop-in" style={{ animationDelay: `${i * 0.05}s` }}>
                                                                <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" />
                                                                <button onClick={() => setAttachedFiles(files => files.filter((_, idx) => idx !== i))} className="absolute inset-0 bg-black/50 text-white w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Icon name="x" className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div key={i} className="relative flex items-center gap-2 h-14 min-w-[140px] max-w-[200px] px-3 bg-bg-surface rounded-md border border-border-light group animate-pop-in flex-shrink-0" style={{ animationDelay: `${i * 0.05}s` }}>
                                                            <div className="w-8 h-8 flex items-center justify-center bg-bg-element rounded text-accent flex-shrink-0">
                                                                <Icon name={getFileIconName(f.type)} className="w-5 h-5" />
                                                            </div>
                                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                <span className="text-xs font-medium text-text-primary truncate block" title={fileName}>{fileName}</span>
                                                                <span className="text-[10px] text-text-tertiary uppercase">{f.type.split('/')[1] || 'FILE'}</span>
                                                            </div>
                                                            <button onClick={() => setAttachedFiles(files => files.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 p-1 text-text-secondary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Icon name="x" className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <div className="relative">
                                            {isMagicLoading && (
                                                <div className="absolute inset-0 z-10 flex items-center justify-start pointer-events-none">
                                                    <div className="flex items-center animate-fade-in">
                                                        <Icon name="sparkles" className="w-4 h-4 text-accent mr-2 animate-spin" />
                                                        <span className="text-sm font-bold text-accent select-none">
                                                            Sprinkling Magic...
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                            <textarea
                                                ref={textareaRef}
                                                value={promptText}
                                                onChange={(e) => setPromptText(e.target.value)}
                                                onPaste={(e) => {
                                                    const items = e.clipboardData.items;
                                                    const filesToAdd: Blob[] = [];
                                                    for (let i = 0; i < items.length; i++) {
                                                        const file = items[i].getAsFile();
                                                        if (file) filesToAdd.push(file);
                                                    }
                                                    if (filesToAdd.length > 0) setAttachedFiles(prev => [...prev, ...filesToAdd]);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        // stop Enter from bypassing the conflict modal
                                                        setTimeout(() => handleSendMessage(), 0);
                                                    }
                                                }}
                                                placeholder={isGenerating ? (isGeneratingCurrent ? "Generating..." : "Type to start new generation...") : "Describe your vision..."}
                                                disabled={isMagicLoading}
                                                className={`w-full bg-transparent border-none outline-none text-[0.95rem] resize-none max-h-[150px] min-h-[24px] disabled:opacity-50 transition-colors transition-[height] duration-200 ease-out ${isMagicLoading ? 'text-transparent placeholder:text-transparent caret-transparent' : 'text-text-primary'}`}
                                                rows={1}
                                                style={{ minHeight: '24px' }}
                                            />
                                        </div>

                                        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showAdv ? 'max-h-[200px] opacity-100 mt-3 pt-3 border-t border-border-light' : 'max-h-0 opacity-0 border-none'}`}>
                                            <div className="flex flex-wrap gap-4">
                                                <div className="flex-1 min-w-[120px]">
                                                    <label className="text-xs text-text-secondary block mb-1">Aspect Ratio</label>
                                                    <select value={genConfig.aspectRatio} onChange={e => setGenConfig({ ...genConfig, aspectRatio: e.target.value })} className="w-full bg-bg-base border border-border-light rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent">
                                                        {ASPECT_RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                    </select>
                                                </div>
                                                <div className="flex-1 min-w-[120px]">
                                                    <label className="text-xs text-text-secondary block mb-1">Resolution</label>
                                                    <select value={genConfig.resolution} onChange={e => setGenConfig({ ...genConfig, resolution: e.target.value })} className="w-full bg-bg-base border border-border-light rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent">
                                                        {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-light)]">
                                            <div className="flex items-center gap-1">
                                                <label className="p-2 rounded-lg hover:bg-bg-element text-text-secondary hover:text-text-primary cursor-pointer transition-all hover:scale-110 active:scale-95" title="Attach File">
                                                    <input type="file" multiple className="hidden" disabled={isMagicLoading} onChange={(e) => { if (e.target.files) setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]) }} />
                                                    <Icon name="paperclip" />
                                                </label>
                                                <button onClick={handleMagicPrompt} disabled={isMagicLoading || !promptText} className={`p-2 rounded-lg hover:bg-bg-element transition-all active:scale-95 hover:scale-110 ${isMagicLoading ? 'text-accent' : 'text-text-secondary hover:text-accent'}`} title="Magic Prompt">
                                                    <Icon name="star-four" />
                                                </button>
                                                <button onClick={() => setShowAdv(!showAdv)} className={`p-2 rounded-lg hover:bg-bg-element transition-all active:scale-95 hover:scale-110 ${showAdv ? 'text-accent' : 'text-text-secondary'}`} title="Settings">
                                                    <Icon name="sliders" className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => setHistoryOpen(true)} className={`p-2 rounded-lg hover:bg-bg-element transition-all active:scale-95 hover:scale-110 text-text-secondary hover:text-accent`} title="Prompt History">
                                                    <Icon name="clock" className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => setConfig(prev => ({ ...prev, searchGrounding: !prev.searchGrounding }))} className={`p-2 rounded-lg hover:bg-bg-element transition-all active:scale-95 hover:scale-110 ${config.searchGrounding ? 'text-accent' : 'text-text-secondary hover:text-accent'}`} title={`Search Grounding: ${config.searchGrounding ? 'ON' : 'OFF'}`}>
                                                    <Icon name="globe" className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {isGeneratingCurrent ? (
                                                <button onClick={handleAbortGeneration} className="flex items-center gap-2 bg-red-500 text-white hover:bg-red-600 font-semibold text-sm px-4 py-2 rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                                                    <Icon name="stop" className="w-4 h-4" /> Stop
                                                </button>
                                            ) : (
                                                <button onClick={() => handleSendMessage()} disabled={isMagicLoading || (!promptText.trim() && attachedFiles.length === 0)} className="flex items-center gap-2 bg-text-primary text-bg-base hover:bg-accent hover:text-[var(--text-on-accent)] disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm px-4 py-2 rounded-lg transition-all active:scale-95">
                                                    Generate <Icon name="send" className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <GalleryView
                            onOpenLightbox={(blob, idx, context) => setLightboxData({ blob, idx, context })}
                            onBulkDelete={handleBulkDeleteImages}
                            onBulkUnbookmark={handleBulkUnbookmark}
                        />
                    )}
                </div>
            </main>

            {isDragging && !lightboxData && (
                <div className="fixed inset-0 z-[5000] bg-black/50 backdrop-blur-md flex items-center justify-center p-8 animate-fade-in pointer-events-none">
                    <div className="w-full h-full border-4 border-dashed border-accent rounded-3xl flex flex-col items-center justify-center gap-4 bg-bg-base/30">
                        <div className="p-6 bg-accent/20 rounded-full animate-bounce-soft">
                            <Icon name="upload" className="w-16 h-16 text-accent" />
                        </div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">Drop files here</h2>
                        <p className="text-text-secondary">Add context to your generation</p>
                    </div>
                </div>
            )}

            <GlobalModal config={modalConfig} onClose={() => setModalConfig(null)} />
            <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} config={config} onSave={setConfig} showModal={showModal} />
            <PromptHistoryModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} onSelectPrompt={(text) => { setPromptText(text); if (textareaRef.current) textareaRef.current.focus(); }} />

            {lightboxData && (
                <Lightbox
                    isOpen={!!lightboxData}
                    onClose={() => setLightboxData(null)}
                    imageBlob={lightboxData.blob}
                    imageId={lightboxData.context[lightboxData.idx]?.id}
                    onNext={() => { const nextIdx = (lightboxData.idx + 1) % lightboxData.context.length; setLightboxData({ ...lightboxData, idx: nextIdx, blob: lightboxData.context[nextIdx].blob }); }}
                    onPrev={() => { const prevIdx = (lightboxData.idx - 1 + lightboxData.context.length) % lightboxData.context.length; setLightboxData({ ...lightboxData, idx: prevIdx, blob: lightboxData.context[prevIdx].blob }); }}
                    onDelete={handleDeleteImage}
                />
            )}
        </div>
    );
}
