

export interface Chat {
  id: string;
  title: string;
  pinned: boolean;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'model';
  text: string;
  imageIds?: string[]; // IDs referencing ImageBlob in DB
  timestamp: number;
  thoughts?: string; // Chain of thought or reasoning
  meta?: {
    model: string;
    modelVersion?: string;
    duration: string;
    tokens?: {
      prompt: number;
      output: number;
      thoughts?: number;
      total: number;
    };
    costUsd?: number;
    finishReason?: string;
    safetyBlocked?: boolean;
  };
  error?: boolean;
}

export interface ImageBlob {
  id: string;
  blob: Blob;
  thumbnail?: Blob; // Optimized low-res version
  mimeType: string;
  createdAt: number;
  isGalleryVisible: boolean;
  galleryTimestamp?: number; // Sparse index field: only set if isGalleryVisible is true
}

export interface Prompt {
  id?: number;
  text: string;
  type: 'recent' | 'saved';
  timestamp: number;
}

export interface Confirmations {
  deleteProject: boolean;
  deleteMessage: boolean;
  deleteImage: boolean;
  regenerate: boolean;
  fork: boolean;
  import: boolean;
  factoryReset: boolean;
}

export interface AppConfig {
  apiKey: string;
  themeAccent: string;
  safetyThreshold: string;
  detailedVerbosity: boolean;
  searchGrounding: boolean;
  lightMode: boolean;
  confirmations: Confirmations;
}

export interface GenConfig {
  aspectRatio: string;
  resolution: string;
}

export type ModalType = 'alert' | 'confirm' | 'prompt' | 'welcome' | 'shortcuts';

export interface ModalConfig {
  type: ModalType;
  title?: string;
  message?: string;
  inputValue?: string; // For prompt
  placeholder?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}