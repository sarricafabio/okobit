
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { AppConfig, GenConfig } from "../types";

export const MIME_MAP: Record<string, string> = {
    // Images
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'heic': 'image/heic',
    'heif': 'image/heif',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',

    // Documents
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'md': 'text/markdown',
    'markdown': 'text/markdown',
    'html': 'text/html',
    'htm': 'text/html',
    'rtf': 'application/rtf',

    // Code & Config
    'js': 'text/javascript',
    'jsx': 'text/javascript',
    'mjs': 'text/javascript',
    'ts': 'text/x-typescript',
    'tsx': 'text/x-typescript',
    'py': 'text/x-python',
    'rb': 'text/x-ruby',
    'java': 'text/x-java-source',
    'c': 'text/x-c',
    'cpp': 'text/x-c++',
    'h': 'text/x-c',
    'hpp': 'text/x-c++',
    'cs': 'text/plain',
    'go': 'text/x-go',
    'rs': 'text/x-rust',
    'swift': 'text/x-swift',
    'php': 'text/x-php',
    'sh': 'application/x-sh',
    'bash': 'application/x-sh',
    'zsh': 'application/x-sh',
    'bat': 'application/x-bat',
    'ps1': 'text/plain',
    'css': 'text/css',
    'scss': 'text/x-scss',
    'less': 'text/x-less',
    'json': 'application/json',
    'xml': 'text/xml',
    'yaml': 'text/yaml',
    'yml': 'text/yaml',
    'sql': 'application/sql',
    'graphql': 'application/graphql',

    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',

    // Video
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv'
};

export function getEffectiveMimeType(file: Blob | File): string {
    let type = file.type;

    // Check for extension if it's a File object
    let ext = '';
    if ('name' in file && typeof (file as File).name === 'string') {
        const name = (file as File).name.toLowerCase();
        const parts = name.split('.');
        if (parts.length > 1) {
            ext = parts.pop() || '';
        }
    }

    // FIX: Common browser misidentifications
    // TypeScript often detected as video/mp2t (MPEG Transport Stream)
    if (ext === 'ts' && (type === 'video/mp2t' || !type)) {
        return 'text/x-typescript';
    }
    // JavaScript sometimes defaults to text/plain, prefer specific type
    if (ext === 'js' && type === 'text/plain') {
        return 'text/javascript';
    }

    // 1. Trust existing valid mime type if it looks standard and not generic
    if (type && type !== 'application/octet-stream') {
        return type;
    }

    // 2. Try to infer from extension
    if (ext && MIME_MAP[ext]) {
        return MIME_MAP[ext];
    }

    // 3. Fallback to existing type (even if empty) - caller should validate
    return type || '';
}

// Helper to convert Blob to Base64
export async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error("Failed to convert blob to base64."));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Helper to Base64 to Blob
export function base64ToBlob(base64: string, mimeType: string = 'image/png'): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// Client-side thumbnail generation
export async function createThumbnail(blob: Blob, mimeType?: string, width: number = 300): Promise<Blob> {
    const type = mimeType || blob.type;
    // Only optimize images
    if (!type.startsWith('image/')) {
        return blob;
    }

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = width / img.width;
            // Don't upscale
            if (scale >= 1) {
                URL.revokeObjectURL(url);
                resolve(blob);
                return;
            }
            canvas.width = width;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((b) => {
                    URL.revokeObjectURL(url);
                    resolve(b || blob);
                }, 'image/jpeg', 0.6);
            } else {
                URL.revokeObjectURL(url);
                resolve(blob);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(blob);
        }
        img.src = url;
    });
}

// Optimization: Resize large input images before sending
export async function optimizeInputImage(blob: Blob, mimeType?: string, maxWidth: number = 1536): Promise<Blob> {
    const type = mimeType || blob.type;
    // Return original if not an image
    if (!type.startsWith('image/')) {
        return blob;
    }

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            // If already small enough, return original
            if (img.width <= maxWidth && img.height <= maxWidth) {
                URL.revokeObjectURL(url);
                resolve(blob);
                return;
            }

            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = height * (maxWidth / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxWidth) {
                    width = width * (maxWidth / height);
                    height = maxWidth;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((b) => {
                    URL.revokeObjectURL(url);
                    resolve(b || blob);
                }, type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
            } else {
                URL.revokeObjectURL(url);
                resolve(blob);
            }
        };
        img.onerror = () => resolve(blob);
        img.src = url;
    });
}

export async function validateApiKey(apiKey: string): Promise<{ ok: boolean; errorMessage?: string }> {
    if (!apiKey) return { ok: false, errorMessage: "API key is empty" };
    const ai = new GoogleGenAI({ apiKey });
    try {
        await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: { parts: [{ text: 'ping' }] },
        });
        return { ok: true };
    } catch (e: any) {
        console.error("API Key Validation Failed", e);
        let msg = "Invalid API Key or connection error.";
        if (e.message?.includes('400')) msg = "Invalid API Key.";
        if (e.message?.includes('403')) msg = "Permission denied or quota exceeded.";
        if (e.message?.includes('404')) msg = "Model not found or API key invalid.";
        return { ok: false, errorMessage: msg };
    }
}

export async function generateChatTitle(apiKey: string, firstPrompt: string): Promise<string> {
    if (!apiKey) throw new Error("API Key is missing");
    const ai = new GoogleGenAI({ apiKey });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents: `Generate a short, punchy 3-5 word title for this prompt: "${firstPrompt}". Return ONLY the title text.`,
        });
        return response.text?.trim().replace(/^["']|["']$/g, '') || "New Project";
    } catch (e) {
        console.error("Title gen error", e);
        return "New Project";
    }
}

export async function enhancePrompt(apiKey: string, currentPrompt: string): Promise<string> {
    if (!apiKey) throw new Error("API Key is missing");
    const ai = new GoogleGenAI({ apiKey });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            config: {
                systemInstruction: "You are a prompt engineer. Enhance the user's prompt for an image generation model to be more descriptive, artistic, and detailed. Return ONLY the enhanced prompt."
            },
            contents: currentPrompt
        });
        return response.text?.trim() || currentPrompt;
    } catch (e) {
        console.error("Magic prompt error", e);
        return currentPrompt;
    }
}

interface GenerationParams {
    apiKey: string;
    contents: any[];
    config: GenConfig;
    safetySetting: string;
    signal?: AbortSignal;
    searchGrounding?: boolean;
    onProgress?: (text: string, thoughts: string, usage?: any) => void;
}

export interface GenerationResult {
    text: string;
    thoughts: string;
    images: Blob[];
    thumbnails: Blob[];
    usage?: {
        promptTokens: number;
        outputTokens: number;
        thoughtsTokens?: number;
        totalTokens: number;
    };
    modelVersion?: string;
    finishReason?: string;
    safetyBlocked?: boolean;
}

export async function generateImageContentStream({ apiKey, contents, config, safetySetting, signal, searchGrounding, onProgress }: GenerationParams): Promise<GenerationResult> {
    if (!apiKey) throw new Error("API Key is missing");
    const ai = new GoogleGenAI({ apiKey });

    // Use gemini-3-pro-image-preview per spec
    const modelName = 'gemini-3-pro-image-preview';

    // Map config
    const imgConfig: any = {};
    if (config.aspectRatio !== 'auto') imgConfig.aspectRatio = config.aspectRatio;
    if (config.resolution) imgConfig.imageSize = config.resolution;

    const requestConfig: any = {
        imageConfig: imgConfig,
        safetySettings: [
            // Map simplified safety setting to API expected format if needed, 
            // but @google/genai usually takes safetySettings array of objects.
            // Using simple block logic or assume library handles defaults if not customized heavily.
        ]
    };

    if (searchGrounding) {
        requestConfig.tools = [{ googleSearch: {} }];
    }

    try {
        const streamResult = await ai.models.generateContentStream({
            model: modelName,
            contents: contents,
            config: requestConfig
        });

        let fullText = "";
        let fullThoughts = "";
        let finalImages: Blob[] = [];
        let usage: any = undefined;
        let modelVersion = "";
        let finishReason = "";
        let safetyBlocked = false;

        for await (const chunk of streamResult) {
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }

            // Capture Metadata
            if (chunk.usageMetadata) {
                usage = {
                    promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                    outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                    thoughtsTokens: chunk.usageMetadata.thoughtsTokenCount ?? undefined,
                    totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
                };
            }

            if ((chunk as any).modelVersion) modelVersion = (chunk as any).modelVersion;

            const candidate = chunk.candidates?.[0];
            if (candidate) {
                if (candidate.finishReason) finishReason = candidate.finishReason;
                if (candidate.safetyRatings?.some(r => r.blocked)) safetyBlocked = true;

                if (candidate.content?.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.text) {
                            // Heuristic: If we are using a thinking model (not this one usually), 
                            // thoughts might be separated. For now, treat all text as text 
                            // unless we identify a specific thought part which isn't standard in V1 API yet
                            // but is in V1beta thinking models.
                            // For image models, text is usually the caption or refusal.
                            fullText += part.text;
                        }
                        if (part.inlineData) {
                            const blob = base64ToBlob(part.inlineData.data, part.inlineData.mimeType || 'image/png');
                            finalImages.push(blob);
                        }
                    }
                }
            }

            if (onProgress) {
                onProgress(fullText, fullThoughts, usage);
            }
        }

        // Generate thumbnails for final images in parallel
        const thumbnails = await Promise.all(finalImages.map(img => createThumbnail(img)));

        return {
            text: fullText,
            thoughts: fullThoughts,
            images: finalImages,
            thumbnails,
            usage,
            modelVersion,
            finishReason,
            safetyBlocked
        };

    } catch (error) {
        console.error("Generation Error", error);
        throw error;
    }
}
