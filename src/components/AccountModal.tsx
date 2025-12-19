import { Profile } from '../lib/supabase';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  email: string;
  onSignOut: () => void;
}

export function AccountModal({ isOpen, onClose, profile, email, onSignOut }: AccountModalProps) {
  if (!isOpen) return null;

  const handleSignOut = () => {
    onSignOut();
    onClose();
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-2 border-black p-6 max-w-sm w-full relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-2xl leading-none hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          &times;
        </button>

        {/* Header */}
        <div className="mb-6 pr-8">
          <h2 className="text-lg font-bold">ACCOUNT</h2>
        </div>

        {/* Account Details */}
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500">EMAIL</label>
            <p className="text-sm font-bold truncate">{email}</p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">TOKENS REMAINING</label>
            <p className="text-sm font-bold text-neon-dark">
              {profile?.tokens_remaining?.toLocaleString() || '0'}
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">TOKENS USED</label>
            <p className="text-sm font-bold">
              {profile?.tokens_used?.toLocaleString() || '0'}
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">LAST LOGIN</label>
            <p className="text-sm">
              {formatDate(profile?.last_login)}
            </p>
          </div>
        </div>

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="w-full mt-6 py-2 border-2 border-black font-bold text-sm hover:bg-red-100 transition-colors"
        >
          SIGN OUT
        </button>
      </div>
    </div>
  );
}
