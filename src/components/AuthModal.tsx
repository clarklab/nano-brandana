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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-600 p-6 max-w-md w-full relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-2xl leading-none hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        {/* Header */}
        <div className="mb-4 pr-8">
          <h2 className="text-lg font-bold">SIGN IN TO CONTINUE</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Get <span className="font-bold text-black dark:text-gray-100">100,000 free tokens</span> for image generation
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
        <p className="text-xs text-center mt-4 text-gray-500 dark:text-gray-400">
          No password needed - we'll email you a secure link
        </p>
      </div>
    </div>
  );
}
