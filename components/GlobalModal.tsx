import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { BananaLogo } from './BananaLogo';
import { ModalConfig } from '../types';
import { validateApiKey } from '../services/geminiService';

interface GlobalModalProps {
  config: ModalConfig | null;
  onClose: () => void;
}

export const GlobalModal: React.FC<GlobalModalProps> = ({ config, onClose }) => {
  const [inputValue, setInputValue] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setInputValue(config.inputValue || '');
      setIsVisible(true);
      setValidationError(null);
    } else {
      setIsVisible(false);
    }
  }, [config]);

  const handleConfirm = async () => {
    if (config?.type === 'welcome' && inputValue.trim()) {
      setIsValidating(true);
      setValidationError(null);
      const result = await validateApiKey(inputValue.trim());
      setIsValidating(false);

      if (!result.ok) {
        setValidationError(result.errorMessage || "Invalid API Key");
        return; // Stop here, keep modal open
      }
    }

    if (config?.onConfirm) {
      config.onConfirm(config.type === 'prompt' || config.type === 'welcome' ? inputValue : undefined);
    }
    onClose();
  };

  const handleCancel = () => {
    if (config?.onCancel) config.onCancel();
    onClose();
  };

  // Handle ESC and Enter keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && config && config.type !== 'confirm') {
        // Use handleCancel logic to ensure onCancel callback is fired
        if (config.onCancel) config.onCancel();
        onClose();
      }
      if (e.key === 'Enter' && config) {
        // Prevent default if it's a textarea or similar (though we only have input)
        // For prompt type, input handles it, but for confirm/alert we need global listener
        if (config.type !== 'prompt' && config.type !== 'welcome') {
          e.preventDefault();
          handleConfirm();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config, onClose, inputValue]);

  if (!config) return null;

  const isWelcome = config.type === 'welcome';
  const isShortcuts = config.type === 'shortcuts';

  return (
    <div className={`fixed inset-0 z-[3000] flex items-center justify-center p-4 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={(!isWelcome && config.type !== 'confirm') && !isValidating ? handleCancel : undefined}
      ></div>

      {/* Modal Content */}
      <div className={`
        relative w-full ${isWelcome ? 'max-w-lg' : isShortcuts ? 'max-w-2xl' : 'max-w-sm'} 
        bg-bg-surface border border-border-light rounded-2xl shadow-2xl 
        transform transition-all duration-300 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        overflow-hidden flex flex-col
      `}>

        {/* Header Decoration for Welcome */}
        {isWelcome && (
          <div className="h-48 bg-gradient-to-br from-accent/20 to-purple-500/20 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50"></div>
            <BananaLogo className="w-96 h-96 text-accent animate-bounce-soft relative z-10" />
          </div>
        )}

        <div className="p-6">
          {!isWelcome && (
            <div className="flex justify-between items-start mb-4">
              <div
                className={`p-3 rounded-full ${config.type === 'alert'
                  ? (config.title === 'Success'
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-danger-bg text-danger')
                  : 'bg-bg-element text-accent'
                  }`}
              >
                {config.type === 'alert'
                  ? (config.title === 'Success'
                    ? <Icon name="check-circle" />      // green tick
                    : <Icon name="alert" />)            // red alert (unchanged)
                  : config.type === 'shortcuts'
                    ? <Icon name="keyboard" />
                    : <Icon name="message" />}
              </div>
              {config.type !== 'alert' && config.type !== 'welcome' && (
                <button onClick={handleCancel} className="text-text-secondary hover:text-text-primary">
                  <Icon name="x" />
                </button>
              )}
            </div>
          )}

          <h3 className={`text-xl font-bold text-text-primary mb-2 ${isWelcome ? 'text-center' : ''}`}>
            {config.title || (isWelcome ? "Welcome to Okobit" : "Notification")}
          </h3>

          {config.message && (
            <p className={`text-text-secondary text-sm leading-relaxed mb-6 ${isWelcome ? 'text-center' : ''}`}>
              {config.message}
            </p>
          )}

          {isShortcuts && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-6">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Navigation</h4>
                <ShortcutRow keys={['Alt', 'S']} desc="Toggle Sidebar" />
                <ShortcutRow keys={['Alt', '↓']} desc="Next Project" />
                <ShortcutRow keys={['Alt', '↑']} desc="Prev Project" />
                <ShortcutRow keys={['Alt', 'P']} desc="Open Settings" />
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Actions</h4>
                <ShortcutRow keys={['Alt', 'N']} desc="New Project" />
                <ShortcutRow keys={['Ctrl', 'Enter']} desc="Send Message" />
                <ShortcutRow keys={['Alt', 'C']} desc="Halt Generation" />
                <ShortcutRow keys={['Alt', 'E']} desc="Edit Last Prompt" />
                <ShortcutRow keys={['Alt', '/']} desc="Show Shortcuts" />
              </div>
              <div className="col-span-1 md:col-span-2 space-y-3 pt-2 border-t border-border-light">
                <h4 className="text-xs font-bold text-text-tertiary uppercase tracking-wider">Lightbox & Gallery</h4>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Keycap label="←" />
                    <Keycap label="→" />
                  </div>
                  <span className="text-sm text-text-secondary">Navigate Images</span>
                </div>
              </div>
            </div>
          )}

          {(config.type === 'prompt' || isWelcome) && (
            <div className="mb-6">
              <div className="relative">
                {isWelcome && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"><Icon name="key" /></div>}
                <input
                  type={isWelcome ? "password" : "text"}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={config.placeholder}
                  className={`w-full bg-bg-base border border-border-light rounded-xl py-3 text-text-primary focus:border-accent outline-none transition-all ${isWelcome ? 'pl-10 pr-4' : 'px-4'}`}
                  autoFocus
                  disabled={isValidating}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                />
              </div>
              {validationError && (
                <p className="text-xs text-danger mt-2 flex items-center gap-1 animate-fade-in justify-center">
                  <Icon name="alert" className="w-3 h-3" />
                  {validationError}
                </p>
              )}
              {isWelcome && !validationError && <p className="text-[10px] text-text-tertiary mt-2 text-center">Your API key is stored locally in your browser.</p>}
            </div>
          )}

          {!isShortcuts && (
            <div className={`flex gap-3 ${isWelcome ? 'justify-center' : 'justify-end'}`}>
              {(config.type === 'confirm' || config.type === 'prompt') && (
                <button
                  onClick={handleCancel}
                  disabled={isValidating}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:bg-bg-element hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  {config.cancelText || "Cancel"}
                </button>
              )}
              <button
                onClick={handleConfirm}
                disabled={isValidating}
                className="px-6 py-2 rounded-lg text-sm font-bold bg-accent text-black hover:brightness-110 transition-transform active:scale-95 shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isValidating && isWelcome && <Icon name="sparkles" className="w-3.5 h-3.5 animate-spin" />}
                {isValidating ? "Validating..." : (config.confirmText || "OK")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ShortcutRow: React.FC<{ keys: string[], desc: string }> = ({ keys, desc }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-1.5">
      {keys.map(k => <Keycap key={k} label={k} />)}
    </div>
    <span className="text-sm text-text-secondary">{desc}</span>
  </div>
);

const Keycap: React.FC<{ label: string }> = ({ label }) => (
  <div className="min-w-[24px] px-1.5 h-6 flex items-center justify-center bg-bg-element border border-b-2 border-border-light rounded text-[10px] font-mono text-text-primary shadow-sm">
    {label}
  </div>
);