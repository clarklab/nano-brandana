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
          className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" className="text-slate-500" fill="currentColor">
            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
          </svg>
        </button>

        {/* Header with logo */}
        <div className="mb-6 pr-8">
          <div className="flex items-center gap-3 mb-3">
            <img src="/peel.svg" alt="Peel" className="size-8 dark:invert" />
            <h2 className="text-xl font-semibold font-display">Create Peel account to continue</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Get <span className="font-bold text-amber-600 dark:text-amber-400">25,000 free tokens</span> for image generation
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
                  brand: '#EEB90A',
                  brandAccent: '#d4a50a',
                  brandButtonText: '#1e293b',
                  inputText: '#334155',
                  inputBackground: '#f8fafc',
                  inputBorder: '#e2e8f0',
                  inputBorderFocus: '#EEB90A',
                  inputBorderHover: '#cbd5e1',
                  inputPlaceholder: '#94a3b8',
                },
                radii: {
                  borderRadiusButton: '0.75rem',
                  buttonBorderRadius: '0.75rem',
                  inputBorderRadius: '0.75rem',
                },
                fonts: {
                  bodyFontFamily: 'Inter, system-ui, sans-serif',
                  buttonFontFamily: 'Inter, system-ui, sans-serif',
                  inputFontFamily: 'Inter, system-ui, sans-serif',
                  labelFontFamily: 'Inter, system-ui, sans-serif',
                },
                fontSizes: {
                  baseButtonSize: '0.875rem',
                  baseInputSize: '0.875rem',
                  baseLabelSize: '0.875rem',
                },
                space: {
                  inputPadding: '0.75rem 1rem',
                  buttonPadding: '0.75rem 1rem',
                },
              },
              dark: {
                colors: {
                  brand: '#EEB90A',
                  brandAccent: '#d4a50a',
                  brandButtonText: '#1e293b',
                  inputText: '#e2e8f0',
                  inputBackground: '#1e293b',
                  inputBorder: '#334155',
                  inputBorderFocus: '#EEB90A',
                  inputBorderHover: '#475569',
                  inputPlaceholder: '#64748b',
                  inputLabelText: '#cbd5e1',
                },
              },
            },
            style: {
              button: {
                fontWeight: '600',
                boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
                transition: 'all 0.2s ease',
              },
              input: {
                boxShadow: 'none',
                transition: 'all 0.2s ease',
              },
              label: {
                fontWeight: '500',
                marginBottom: '0.5rem',
              },
              anchor: {
                color: '#EEB90A',
                fontWeight: '500',
              },
              message: {
                borderRadius: '0.75rem',
                padding: '0.75rem 1rem',
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
                button_label: 'Send magic link',
                confirmation_text: 'Check your email for the magic link!',
              },
            },
          }}
        />

        {/* Footer */}
        <p className="text-xs text-center mt-6 text-slate-500 dark:text-slate-400">
          No password needed — we'll email you a secure link
        </p>
      </div>
    </div>
  );
}
