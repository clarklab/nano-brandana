import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center z-50 md:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full h-full md:h-auto md:max-w-md md:rounded-2xl shadow-elevated p-6 md:p-8 relative overflow-y-auto animate-slide-up pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
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
          <h2 className="text-lg font-semibold font-display">Sign In to Continue</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Get <span className="font-bold text-slate-900 dark:text-slate-100">100,000 free tokens</span> for image generation
          </p>
        </div>

        {/* Supabase Auth UI */}
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#000000',
                  brandAccent: '#CCFF00',
                  inputText: '#000000',
                  inputBackground: '#ffffff',
                  inputBorder: '#000000',
                  inputBorderFocus: '#CCFF00',
                  inputBorderHover: '#666666',
                }
              }
            },
            style: {
              button: {
                fontFamily: 'monospace',
                fontWeight: 'bold',
                borderRadius: '0',
                border: '2px solid black',
              },
              input: {
                fontFamily: 'monospace',
                borderRadius: '0',
                border: '2px solid black',
              },
              label: {
                fontFamily: 'monospace',
                fontWeight: 'bold',
              },
              anchor: {
                fontFamily: 'monospace',
                color: '#000000',
              },
              message: {
                fontFamily: 'monospace',
              },
            },
          }}
          providers={[]}
          view="magic_link"
          showLinks={false}
          redirectTo={window.location.origin}
          localization={{
            variables: {
              magic_link: {
                email_input_label: 'Email address',
                email_input_placeholder: 'your@email.com',
                button_label: 'SEND MAGIC LINK',
                confirmation_text: 'Check your email for the magic link!',
              },
            },
          }}
        />

        {/* Footer */}
        <p className="text-xs text-center mt-6 text-slate-500 dark:text-slate-400">
          No password needed - we'll email you a secure link
        </p>
      </div>
    </div>
  );
}
