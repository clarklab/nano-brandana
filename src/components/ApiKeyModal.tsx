import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const { hasOwnApiKey, updateGeminiApiKey } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!apiKey.trim()) return;

    // Basic validation - Google API keys typically start with "AIza"
    if (!apiKey.startsWith('AIza') || apiKey.length < 30) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return;
    }

    setIsSaving(true);
    const success = await updateGeminiApiKey(apiKey.trim());
    setIsSaving(false);

    if (success) {
      setSaveStatus('saved');
      setApiKey('');
      setTimeout(() => {
        setSaveStatus('idle');
        onClose();
      }, 1000);
    } else {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    const success = await updateGeminiApiKey(null);
    setIsSaving(false);

    if (success) {
      setSaveStatus('saved');
      setTimeout(() => {
        setSaveStatus('idle');
        onClose();
      }, 1000);
    } else {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-elevated p-6 relative animate-slide-up">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" className="text-slate-500" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>

        {/* Header */}
        <div className="mb-6 pr-8">
          <h2 className="text-lg font-semibold font-display">API Key Settings</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Use your own Google Gemini API key for unlimited generations
          </p>
        </div>

        {/* Current status */}
        <div className={`rounded-xl p-4 mb-4 ${
          hasOwnApiKey
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
            : 'bg-slate-50 dark:bg-slate-700/50'
        }`}>
          <div className="flex items-center gap-3">
            {hasOwnApiKey ? (
              <>
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-600 dark:text-emerald-400">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Your key is active</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">No token charges when using "Your Key" option</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-600 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-500 dark:text-slate-400">
                    <path fillRule="evenodd" d="M8 7a5 5 0 1 1 3.61 4.804l-1.903 1.903A1 1 0 0 1 9 14H8v1a1 1 0 0 1-1 1H6v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 .293-.707L8.196 8.39A5.002 5.002 0 0 1 8 7Zm5-3a.75.75 0 0 0 0 1.5A1.5 1.5 0 0 1 14.5 7 .75.75 0 0 0 16 7a3 3 0 0 0-3-3Z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No key configured</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Using platform tokens for all generations</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Add/Update key form */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {hasOwnApiKey ? 'Update API Key' : 'Add Your API Key'}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full px-4 py-3 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-neon/50 focus:border-neon"
          />

          {saveStatus === 'error' && (
            <p className="text-xs text-red-500">Invalid API key format. Keys start with "AIza" and are 39+ characters.</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving || !apiKey.trim()}
              className="btn-primary flex-1 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </span>
              ) : saveStatus === 'saved' ? (
                'Saved!'
              ) : (
                'Save Key'
              )}
            </button>

            {hasOwnApiKey && (
              <button
                onClick={handleRemove}
                disabled={isSaving}
                className="btn-secondary py-2.5 px-4 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Help link */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-neon hover:underline flex items-center gap-1"
          >
            Get a free API key from Google AI Studio
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
            </svg>
          </a>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Your key is stored securely and only used server-side. When using your own key, generations don't consume platform tokens.
          </p>
        </div>
      </div>
    </div>
  );
}
