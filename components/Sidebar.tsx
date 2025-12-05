
import React from 'react';
import { Icon } from './Icon';
import { Chat } from '../types';
import { BananaLogo } from './BananaLogo';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onPinChat: (id: string) => void;
  onEditTitle: (id: string, currentTitle: string) => void;
  currentView: 'chat' | 'gallery';
  onViewChange: (view: 'chat' | 'gallery') => void;
  onOpenSettings: () => void;
  generatingChatId: string | null;
  stats?: { totalTokens: number; totalCost: number };
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen, onToggle, chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, onPinChat, onEditTitle, currentView, onViewChange, onOpenSettings, generatingChatId, stats
}) => {
  // Sort chats: pinned first, then by date
  const sortedChats = [...chats].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <>
      <div 
        className={`fixed inset-y-0 left-0 z-40 w-[280px] bg-bg-surface border-r border-border-light flex flex-col transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Header */}
        <div className="h-24 flex items-center justify-center border-b border-border-light relative overflow-hidden">
          <div className="w-full h-full flex items-center justify-center p-1">
             <BananaLogo className="h-full w-full text-accent" />
          </div>
          
          <button onClick={onToggle} className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-bg-element text-text-secondary transition-colors md:hidden bg-bg-surface/50 backdrop-blur-sm z-10">
            <Icon name="chevron-left" />
          </button>
          <button onClick={onToggle} className="absolute right-4 top-1/2 -translate-y-1/2 hidden md:block p-1.5 rounded-md hover:bg-bg-element text-text-secondary transition-colors bg-bg-surface/50 backdrop-blur-sm z-10">
            <Icon name="menu" />
          </button>
        </div>

        {/* New Chat */}
        <div className="p-4">
          <button 
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 bg-bg-element border border-dashed border-text-tertiary text-text-secondary hover:border-accent hover:text-text-primary hover:bg-bg-surface rounded-xl py-3 text-sm font-medium transition-all active:scale-95 group"
          >
            <Icon name="plus" className="transition-transform group-hover:rotate-90" />
            New Project
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
          {sortedChats.map((chat, index) => (
            <div 
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              style={{ animationDelay: `${index * 0.05}s` }}
              className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 border border-transparent opacity-0 animate-slide-in-right ${activeChatId === chat.id ? 'bg-bg-element text-text-primary border-border-light shadow-sm' : 'text-text-secondary hover:bg-bg-surface hover:translate-x-1 hover:text-text-primary'}`}
            >
              {chat.pinned && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent rounded-r-full"></div>}
              
              <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="truncate text-sm">{chat.title || "Untitled Project"}</span>
                  {generatingChatId === chat.id && (
                      <Icon name="sparkles" className="w-3 h-3 text-accent animate-spin flex-shrink-0" />
                  )}
              </div>
              
              {/* Actions */}
              <div className="absolute right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-bg-element/80 backdrop-blur-sm rounded-md shadow-sm">
                <button 
                  onClick={(e) => { e.stopPropagation(); onPinChat(chat.id); }}
                  className={`p-1 hover:text-accent ${chat.pinned ? 'text-accent' : ''}`}
                >
                  <Icon name="pin" className="w-3.5 h-3.5" />
                </button>
                 <button 
                  onClick={(e) => { 
                      e.stopPropagation(); 
                      onEditTitle(chat.id, chat.title);
                  }}
                  className="p-1 hover:text-white"
                >
                  <Icon name="edit" className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                  className="p-1 hover:text-danger"
                >
                  <Icon name="trash" className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Project Stats Summary */}
        {stats && (stats.totalTokens > 0 || stats.totalCost > 0) && (
            <div className="px-4 py-2 bg-bg-surface border-t border-border-light text-[10px] font-mono text-text-tertiary flex justify-between items-center select-none animate-fade-in">
                <span>Σ Tokens: {stats.totalTokens.toLocaleString()}</span>
                {stats.totalCost > 0 && <span>≈ ${stats.totalCost.toFixed(5)}</span>}
            </div>
        )}

        {/* Footer */}
        <div className="p-3 border-t border-border-light bg-bg-surface grid grid-cols-[1fr_1fr_auto] gap-2">
          <button 
            onClick={() => onViewChange('chat')}
            className={`flex items-center justify-center py-2 rounded-lg text-sm font-medium transition-all active:scale-95 ${currentView === 'chat' ? 'bg-bg-element text-text-primary shadow-inner' : 'text-text-secondary hover:bg-bg-element'}`}
          >
            Chat
          </button>
          <button 
            onClick={() => onViewChange('gallery')}
            className={`flex items-center justify-center py-2 rounded-lg text-sm font-medium transition-all active:scale-95 ${currentView === 'gallery' ? 'bg-bg-element text-text-primary shadow-inner' : 'text-text-secondary hover:bg-bg-element'}`}
          >
            Gallery
          </button>
          <button 
            onClick={onOpenSettings}
            className="flex items-center justify-center p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-element transition-all active:scale-95 active:rotate-45"
          >
            <Icon name="settings" />
          </button>
        </div>
      </div>
      
      {/* Overlay for mobile */}
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden animate-fade-in" onClick={onToggle}></div>
      )}
    </>
  );
};
