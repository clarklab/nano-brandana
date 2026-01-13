import { useState, useRef, useEffect, useLayoutEffect } from 'react';

export type AspectRatio = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | 'custom' | null;

export interface CustomSize {
  width: number;
  height: number;
}

interface RatioOption {
  value: AspectRatio;
  label: string;
  description: string;
  icon: string;
}

const RATIO_OPTIONS: RatioOption[] = [
  { value: null, label: 'Auto', description: 'AI decides', icon: 'auto_awesome' },
  { value: '1:1', label: 'Square', description: '1:1', icon: 'crop_square' },
  { value: '4:5', label: 'Portrait', description: '4:5', icon: 'crop_portrait' },
  { value: '9:16', label: 'Story', description: '9:16', icon: 'smartphone' },
  { value: '16:9', label: 'Wide', description: '16:9', icon: 'crop_landscape' },
  { value: '3:2', label: 'Photo', description: '3:2', icon: 'photo_camera' },
];

const MIN_DIMENSION = 256;

interface RatioPickerProps {
  value: AspectRatio;
  onChange: (value: AspectRatio) => void;
  customSize: CustomSize | null;
  onCustomSizeChange: (size: CustomSize | null) => void;
}

export function RatioPicker({ value, onChange, customSize, onCustomSizeChange }: RatioPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [widthInput, setWidthInput] = useState(customSize?.width?.toString() ?? '');
  const [heightInput, setHeightInput] = useState(customSize?.height?.toString() ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const widthInputRef = useRef<HTMLInputElement>(null);

  // Check if mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate dropdown position
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (isOpen && !isMobile && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 400;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceAbove > dropdownHeight || spaceAbove > spaceBelow;

      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + 8 }
          : { top: rect.bottom + 8 }),
        minWidth: 220,
        zIndex: 9999,
      });
    } else if (!isOpen) {
      setDropdownStyle({});
    }
  }, [isOpen, isMobile]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node) || dropdownRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus width input when custom is selected
  useEffect(() => {
    if (isOpen && value === 'custom' && widthInputRef.current) {
      setTimeout(() => widthInputRef.current?.focus(), 100);
    }
  }, [isOpen, value]);

  // Sync inputs with customSize prop
  useEffect(() => {
    if (customSize) {
      setWidthInput(customSize.width.toString());
      setHeightInput(customSize.height.toString());
    }
  }, [customSize]);

  const handleSelectRatio = (ratioValue: AspectRatio) => {
    onChange(ratioValue);
    if (ratioValue !== 'custom') {
      onCustomSizeChange(null);
      setIsOpen(false);
    }
  };

  const validateAndApplyCustomSize = () => {
    const w = parseInt(widthInput, 10);
    const h = parseInt(heightInput, 10);

    if (isNaN(w) || isNaN(h)) {
      setValidationError('Enter valid numbers');
      return false;
    }
    if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
      setValidationError(`Min ${MIN_DIMENSION}×${MIN_DIMENSION}`);
      return false;
    }

    setValidationError(null);
    onCustomSizeChange({ width: w, height: h });
    return true;
  };

  const handleApplyCustomSize = () => {
    if (validateAndApplyCustomSize()) {
      setIsOpen(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApplyCustomSize();
    }
  };

  // Display value
  const getDisplayValue = () => {
    if (value === 'custom' && customSize) {
      return `${customSize.width}×${customSize.height}`;
    }
    if (value === 'custom') {
      return 'Custom';
    }
    const option = RATIO_OPTIONS.find(o => o.value === value);
    return option?.label ?? 'Auto';
  };

  const renderOptions = () => (
    <>
      {RATIO_OPTIONS.map((option) => (
        <button
          key={String(option.value)}
          onClick={() => handleSelectRatio(option.value)}
          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
            option.value === value && value !== 'custom'
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
          }`}
        >
          <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '16px', width: '16px', height: '16px' }}>
            {option.icon}
          </span>
          <div className="flex-1">
            <div className="font-medium">{option.label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{option.description}</div>
          </div>
          {option.value === value && value !== 'custom' && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-amber-600 dark:text-amber-400">
              <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      ))}

      {/* Divider */}
      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />

      {/* Custom option */}
      <button
        onClick={() => handleSelectRatio('custom')}
        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
          value === 'custom'
            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200'
            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
        }`}
      >
        <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '16px', width: '16px', height: '16px' }}>
          edit_square
        </span>
        <div className="flex-1">
          <div className="font-medium">Custom Size</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Exact dimensions</div>
        </div>
        {value === 'custom' && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-amber-600 dark:text-amber-400">
            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Custom size inputs (shown when custom is selected) */}
      {value === 'custom' && (
        <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <input
              ref={widthInputRef}
              type="number"
              value={widthInput}
              onChange={(e) => { setWidthInput(e.target.value); setValidationError(null); }}
              onKeyDown={handleInputKeyDown}
              placeholder="Width"
              min={MIN_DIMENSION}
              className="w-20 px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="text-slate-400">×</span>
            <input
              type="number"
              value={heightInput}
              onChange={(e) => { setHeightInput(e.target.value); setValidationError(null); }}
              onKeyDown={handleInputKeyDown}
              placeholder="Height"
              min={MIN_DIMENSION}
              className="w-20 px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={handleApplyCustomSize}
              className="px-3 py-1.5 text-sm font-medium bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-lg transition-colors"
            >
              Apply
            </button>
          </div>
          {validationError && (
            <p className="text-xs text-red-500 mt-1">{validationError}</p>
          )}
          <p className="text-xs text-slate-400 mt-1">Min {MIN_DIMENSION}×{MIN_DIMENSION}px</p>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="material-symbols-outlined text-slate-400" style={{ fontSize: '16px', width: '16px', height: '16px' }}>
          crop
        </span>
        <span>{getDisplayValue()}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Desktop: Dropdown */}
      {isOpen && !isMobile && dropdownStyle.position && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-elevated border border-slate-200 dark:border-slate-700 py-1 animate-fade-in"
          role="listbox"
        >
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Aspect Ratio
            </span>
          </div>
          {renderOptions()}
        </div>
      )}

      {/* Mobile: Bottom Sheet */}
      {isOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            ref={dropdownRef}
            className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-800 rounded-t-2xl shadow-elevated animate-slide-up pb-[env(safe-area-inset-bottom)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </div>
            <div className="px-4 pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold font-display">Aspect Ratio</h3>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {renderOptions()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
