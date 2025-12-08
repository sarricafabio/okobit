
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Icon } from './Icon';
import { Prompt } from '../types';

interface PromptHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectPrompt: (text: string) => void;
}

export const PromptHistoryModal: React.FC<PromptHistoryModalProps> = ({ isOpen, onClose, onSelectPrompt }) => {
    const [activeTab, setActiveTab] = useState<'recent' | 'saved'>('recent');
    const [isMultiSelect, setIsMultiSelect] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // Fetch prompts based on tab
    const prompts = useLiveQuery(
        () => db.prompts
            .where('type')
            .equals(activeTab)
            .reverse()
            .sortBy('timestamp'),
        [activeTab]
    ) || [];

    // Fetch saved prompts texts for visual feedback
    const savedPrompts = useLiveQuery(
        () => db.prompts.where('type').equals('saved').toArray()
    ) || [];
    const savedTexts = new Set(savedPrompts.map(p => p.text));
    const isSaved = (text: string) => savedTexts.has(text);

    if (!isOpen) return null;

    const toggleSelection = (id: number) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === prompts.length) {
            setSelectedIds(new Set());
        } else {
            const ids = prompts
                .map(p => p.id)
                .filter((id): id is number => typeof id === 'number');
            setSelectedIds(new Set(ids));
        }
    };

    const handleToggleSaved = async (prompt: Prompt) => {
        try {
            const existing = await db.prompts.where({ type: 'saved', text: prompt.text }).first();
            if (existing) {
                await db.prompts.delete(existing.id as number);
            } else {
                await db.prompts.add({
                    text: prompt.text,
                    type: 'saved',
                    timestamp: Date.now()
                });
            }
        } catch (e) {
            console.error("Failed to toggle saved prompt", e);
        }
    };

    const handleDelete = async (id: number) => {
        await db.prompts.delete(id);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        await db.prompts.bulkDelete(Array.from(selectedIds));
        setSelectedIds(new Set());
        setIsMultiSelect(false);
    };

    const handleClearRecent = async () => {
        const recentPrompts = await db.prompts.where('type').equals('recent').toArray();
        const ids = recentPrompts
            .map(p => p.id)
            .filter((id): id is number => typeof id === 'number');
        await db.prompts.bulkDelete(ids);
    };

    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative w-full max-w-lg bg-bg-surface border border-border-light rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-slide-up">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border-light bg-bg-surface">
                    <h3 className="font-bold text-text-primary flex items-center gap-2">
                        <Icon name="clock" className="text-accent" />
                        Prompt History
                    </h3>
                    <button onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary">
                        <Icon name="x" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border-light">
                    <button
                        onClick={() => { setActiveTab('recent'); setIsMultiSelect(false); setSelectedIds(new Set()); }}
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'recent' ? 'border-accent text-text-primary bg-bg-element/50' : 'border-transparent text-text-secondary hover:bg-bg-element hover:text-text-primary'}`}
                    >
                        Recent
                    </button>
                    <button
                        onClick={() => { setActiveTab('saved'); setIsMultiSelect(false); setSelectedIds(new Set()); }}
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'saved' ? 'border-accent text-text-primary bg-bg-element/50' : 'border-transparent text-text-secondary hover:bg-bg-element hover:text-text-primary'}`}
                    >
                        Saved Prompts
                    </button>
                </div>

                {/* Toolbar */}
                {prompts.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-2 bg-bg-element/30 border-b border-border-light">
                        <button
                            onClick={() => setIsMultiSelect(!isMultiSelect)}
                            className={`text-xs font-medium px-2 py-1 rounded transition-colors flex items-center gap-1 ${isMultiSelect ? 'bg-accent text-black' : 'text-text-secondary hover:text-text-primary bg-bg-element'}`}
                        >
                            <Icon name="check-circle" className="w-3 h-3" />
                            Multi-Select
                        </button>
                        {!isMultiSelect && activeTab === 'recent' && (
                            <button
                                onClick={handleClearRecent}
                                className="text-xs font-medium px-2 py-1 rounded text-text-secondary hover:text-danger hover:bg-danger-bg transition-colors"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[300px]">
                    {prompts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
                            <Icon name={activeTab === 'recent' ? 'history' : 'bookmark'} className="w-12 h-12 mb-2 opacity-20" />
                            <p className="text-sm">No {activeTab} prompts found.</p>
                        </div>
                    ) : (
                        prompts.map(prompt => (
                            <div
                                key={prompt.id}
                                className={`group relative flex items-center p-3 rounded-xl border transition-all ${isMultiSelect && selectedIds.has(prompt.id!) ? 'bg-accent/10 border-accent' : 'bg-bg-element/30 border-transparent hover:bg-bg-element hover:border-border-light'}`}
                            >
                                {/* Multi-Select Checkbox */}
                                {isMultiSelect && (
                                    <button
                                        onClick={() => toggleSelection(prompt.id!)}
                                        className="mr-3 text-text-secondary hover:text-accent"
                                    >
                                        <Icon name={selectedIds.has(prompt.id!) ? "check-circle" : "circle"} className={selectedIds.has(prompt.id!) ? "text-accent" : ""} />
                                    </button>
                                )}

                                {/* Prompt Text */}
                                <div
                                    className="flex-1 cursor-pointer min-w-0 pr-2"
                                    onClick={() => {
                                        if (isMultiSelect) toggleSelection(prompt.id!);
                                        else {
                                            onSelectPrompt(prompt.text);
                                            onClose();
                                        }
                                    }}
                                >
                                    <p className="text-sm text-text-primary truncate">{prompt.text}</p>
                                    <p className="text-[10px] text-text-tertiary mt-0.5">
                                        {new Date(prompt.timestamp).toLocaleDateString()} • {new Date(prompt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>

                                {/* Item Actions */}
                                {!isMultiSelect && (
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {activeTab === 'recent' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleToggleSaved(prompt); }}
                                                className={`p-1.5 rounded-md transition-colors hover:bg-bg-surface ${isSaved(prompt.text) ? 'text-accent' : 'text-text-secondary hover:text-accent'}`}
                                                title={isSaved(prompt.text) ? "Remove from Saved" : "Bookmark to Saved"}
                                            >
                                                <Icon name="bookmark" className={`w-4 h-4 ${isSaved(prompt.text) ? 'fill-current' : ''}`} />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(prompt.id!); }}
                                            className="p-1.5 rounded-md text-text-secondary hover:text-danger hover:bg-danger-bg"
                                            title="Delete"
                                        >
                                            <Icon name="trash" className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Multi-Select Footer */}
                {isMultiSelect && (
                    <div className="p-3 bg-bg-surface border-t border-border-light flex items-center justify-between animate-slide-up">
                        <button onClick={handleSelectAll} className="text-xs font-medium text-text-secondary hover:text-text-primary px-2">
                            {selectedIds.size === prompts.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setIsMultiSelect(false); setSelectedIds(new Set()); }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-bg-element"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                disabled={selectedIds.size === 0}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-danger text-white disabled:opacity-50 hover:brightness-110"
                            >
                                Delete ({selectedIds.size})
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
