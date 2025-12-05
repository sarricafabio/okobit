import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { AppConfig, ModalConfig, Confirmations } from '../types';
import { SAFETY_SETTINGS, DB_NAME } from '../constants';
import Dexie from 'dexie';
import { validateApiKey } from '../services/geminiService';
import { exportData, importData, ExportProgress } from '../services/importExportService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (config: AppConfig) => void;
  showModal: (config: ModalConfig) => void;
}

const COLORS = ['#FABB10', '#3b82f6', '#a855f7', '#22c55e', '#f43f5e', '#ffffff'];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave, showModal }) => {
  const [localConfig, setLocalConfig] = useState(config);

  // Export/Import State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  // API Key Validation State
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setLocalConfig(config);
  }, [config, isOpen]);

  // Handle ESC in settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isProcessing]);

  const handleChange = (key: keyof AppConfig, value: any) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onSave(newConfig); // Auto-save for responsiveness
  };

  const handleConfirmationChange = (key: keyof Confirmations, value: boolean) => {
    const newConfirmations = { ...localConfig.confirmations, [key]: value };
    const newConfig = { ...localConfig, confirmations: newConfirmations };
    setLocalConfig(newConfig);
    onSave(newConfig);
  };

  const handleValidateAndSave = async () => {
    setIsValidating(true);
    setValidationError(null);
    const result = await validateApiKey(apiKeyDraft);
    setIsValidating(false);

    if (result.ok) {
      handleChange('apiKey', apiKeyDraft);
      setApiKeyDraft('');
    } else {
      setValidationError(result.errorMessage || "Validation failed");
    }
  };

  const handleRemoveKey = () => {
    handleChange('apiKey', '');
    setApiKeyDraft('');
    setValidationError(null);
  };

  const handleExport = async () => {
    setIsProcessing(true);
    setProgress({ message: 'Starting export...', percent: 0 });

    try {
      const blob = await exportData(localConfig, (p) => setProgress(p));

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `okobit-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      showModal({ type: 'alert', title: 'Export Complete', message: 'Your backup has been downloaded.' });
    } catch (e) {
      console.error("Export failed", e);
      showModal({ type: 'alert', title: 'Export Failed', message: 'Could not export data.' });
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const performImport = async () => {
      setIsProcessing(true);
      setProgress({ message: 'Reading file...', percent: 0 });

      try {
        const newConfig = await importData(file, (p) => setProgress(p));


        let finalConfig = newConfig || localConfig;
        if (!finalConfig.apiKey && localConfig.apiKey) {
          finalConfig.apiKey = localConfig.apiKey;
        }

        onSave(finalConfig);
        showModal({ type: 'alert', title: 'Success', message: 'Import successful! Reloading...', onConfirm: () => window.location.reload() });
      } catch (err) {
        console.error("Import error", err);
        showModal({ type: 'alert', title: 'Error', message: 'Failed to import data.' });
      } finally {
        setIsProcessing(false);
        setProgress(null);
        // Reset input
        e.target.value = '';
      }
    };

    // Always confirm for import
    showModal({
      type: 'confirm',
      title: 'Merge Data?',
      message: 'This will merge the backup into your current library. Existing data will be preserved.',
      confirmText: 'Merge',
      onConfirm: performImport,
      onCancel: () => { e.target.value = ''; }
    });
  };

  const handleFactoryReset = async () => {
    const performReset = async () => {
      await Dexie.delete(DB_NAME);
      window.location.reload();
    };

    showModal({
      type: 'confirm',
      title: 'Factory Reset',
      message: 'Are you sure? This will delete ALL data permanently.',
      confirmText: 'Destroy Data',
      onConfirm: performReset
    });
  };

  if (!isOpen) return null;

  const hasKey = !!localConfig.apiKey;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-bg-surface border border-border-light rounded-2xl p-6 shadow-2xl animate-slide-up transform transition-all max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-text-primary">Settings</h2>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 hover:bg-bg-element rounded-full text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
          >
            <Icon name="x" />
          </button>
        </div>

        {/* Accent Color */}
        <div className="mb-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <label className="text-xs font-bold text-accent uppercase tracking-wider mb-2 block">Interface Accent</label>
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-bg-surface ring-1 ring-border-light">
              <input
                type="color"
                value={localConfig.themeAccent}
                onChange={(e) => handleChange('themeAccent', e.target.value)}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] cursor-pointer p-0 border-0"
              />
            </div>
            <input
              type="text"
              value={localConfig.themeAccent}
              onChange={(e) => handleChange('themeAccent', e.target.value)}
              className="bg-bg-base border border-border-light rounded-lg px-3 py-2 text-sm font-mono text-accent w-28 uppercase focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex gap-3 mt-3">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => handleChange('themeAccent', c)}
                className={`w-8 h-8 rounded-full border-2 border-bg-surface ring-1 ring-border-light transition-transform hover:scale-110 ${localConfig.themeAccent === c ? 'ring-text-primary scale-110' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* API Key */}
        <div className="mb-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <label className="text-xs font-bold text-accent uppercase tracking-wider mb-2 block">Google API Key</label>

          {hasKey ? (
            <div className="flex items-center justify-between bg-bg-base border border-border-light rounded-lg px-3 py-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Icon name="check-circle" className="w-3.5 h-3.5 text-green-500" />
                </div>
                <span className="text-sm text-text-secondary font-medium">API key configured</span>
              </div>
              <button
                onClick={handleRemoveKey}
                className="text-xs text-text-secondary hover:text-danger underline decoration-transparent hover:decoration-danger transition-all"
              >
                Remove key
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder="Paste key here..."
                  className="flex-1 bg-bg-base border border-border-light rounded-lg px-3 py-3 text-sm font-mono text-white focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && handleValidateAndSave()}
                />
                <button
                  onClick={handleValidateAndSave}
                  disabled={isValidating || !apiKeyDraft.trim()}
                  className="bg-bg-element hover:bg-bg-surface border border-border-light hover:border-accent text-text-primary px-4 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isValidating ? <Icon name="sparkles" className="w-4 h-4 animate-spin" /> : "Validate"}
                </button>
              </div>
              {validationError && (
                <p className="text-xs text-danger flex items-center gap-1 animate-fade-in">
                  <Icon name="alert" className="w-3 h-3" />
                  {validationError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Configuration */}
        <div className="mb-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <label className="text-xs font-bold text-accent uppercase tracking-wider mb-2 block">Configuration</label>
          <div className="space-y-3">
            <select
              value={localConfig.safetyThreshold}
              onChange={(e) => handleChange('safetyThreshold', e.target.value)}
              className="w-full bg-bg-base border border-border-light rounded-lg px-3 py-2 text-sm text-text-secondary focus:border-accent focus:text-text-primary outline-none"
            >
              {SAFETY_SETTINGS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            <ConfirmationToggle
              label="Stats for Nerds"
              checked={localConfig.detailedVerbosity}
              onChange={(v) => handleChange('detailedVerbosity', v)}
            />
          </div>
        </div>

        {/* Confirmations */}
        <div className="mb-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <label className="text-xs font-bold text-accent uppercase tracking-wider mb-2 block">Confirmation Prompts</label>
          <div className="space-y-1 bg-bg-element/30 rounded-xl p-4 border border-border-light">
            <ConfirmationToggle label="Delete Project" checked={localConfig.confirmations?.deleteProject ?? true} onChange={(v) => handleConfirmationChange('deleteProject', v)} />
            <ConfirmationToggle label="Delete Message" checked={localConfig.confirmations?.deleteMessage ?? true} onChange={(v) => handleConfirmationChange('deleteMessage', v)} />
            <ConfirmationToggle label="Delete Image" checked={localConfig.confirmations?.deleteImage ?? true} onChange={(v) => handleConfirmationChange('deleteImage', v)} />
            <ConfirmationToggle label="Regenerate & Edit" checked={localConfig.confirmations?.regenerate ?? true} onChange={(v) => handleConfirmationChange('regenerate', v)} />
            <ConfirmationToggle label="Fork Conversation" checked={localConfig.confirmations?.fork ?? true} onChange={(v) => handleConfirmationChange('fork', v)} />
          </div>
        </div>

        {/* Shortcuts */}
        <div className="mb-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.5s' }}>
          <button
            onClick={() => showModal({ type: 'shortcuts', title: 'Keyboard Shortcuts' })}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-bg-element border border-border-light hover:border-accent group transition-all"
          >
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <Icon name="keyboard" className="text-text-secondary group-hover:text-accent" />
              <span>Keyboard Cheat Sheet</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] bg-bg-surface px-1.5 py-0.5 rounded border border-white/10 text-text-tertiary">Alt</span>
              <span className="text-[10px] bg-bg-surface px-1.5 py-0.5 rounded border border-white/10 text-text-tertiary">/</span>
            </div>
          </button>
        </div>

        {/* Data */}
        <div className="mb-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.5s' }}>
          <label className="text-xs font-bold text-accent uppercase tracking-wider mb-2 block">Data Management</label>

          {progress ? (
            <div className="bg-bg-base border border-border-light rounded-lg p-3 space-y-2 animate-fade-in">
              <div className="flex justify-between text-xs text-text-secondary font-mono">
                <span>{progress.message}</span>
                <span>{Math.round(progress.percent)}%</span>
              </div>
              <div className="h-2 bg-bg-element rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  disabled={isProcessing}
                  className="flex-1 bg-bg-element border border-dashed border-text-tertiary text-text-secondary hover:border-accent hover:text-text-primary hover:bg-bg-surface rounded-lg py-2 px-4 text-sm font-medium transition-all disabled:opacity-50"
                >
                  Export ZIP
                </button>
                <label className={`flex-1 bg-bg-element border border-dashed border-text-tertiary text-text-secondary hover:border-accent hover:text-text-primary hover:bg-bg-surface rounded-lg py-2 px-4 text-sm font-medium transition-all text-center cursor-pointer ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Import ZIP
                  <input type="file" accept=".zip,.json" onChange={handleImport} className="hidden" disabled={isProcessing} />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Reset */}
        <div className="pt-4 border-t border-border-light opacity-0 animate-slide-up" style={{ animationDelay: '0.6s' }}>
          <button
            onClick={handleFactoryReset}
            disabled={isProcessing}
            className="w-full bg-danger-bg text-danger border border-danger/20 hover:bg-danger hover:text-white rounded-lg py-2 px-4 text-sm font-bold transition-all disabled:opacity-50"
          >
            Factory Reset
          </button>
        </div>
      </div>
    </div>
  );
};

const ConfirmationToggle: React.FC<{ label: string, checked: boolean, onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div
    className="flex items-center justify-between py-2.5 cursor-pointer group select-none"
    onClick={() => onChange(!checked)}
  >
    <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors font-medium">{label}</span>
    <div
      className={`relative w-12 h-7 rounded-full transition-colors duration-200 ease-in-out ${!checked ? 'bg-bg-element border border-white/10' : 'border-transparent'}`}
      style={{ backgroundColor: checked ? 'var(--accent)' : undefined }}
    >
      <div
        className={`absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 cubic-bezier(0.4, 0.0, 0.2, 1) ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      ></div>
    </div>
  </div>
);