import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';

export interface PickerOption<T> {
  value: T;
  label: string;
  description?: string;
  icon?: string;
}

interface SettingsPickerProps<T> {
  value: T;
  onChange: (value: T) => void;
  options: PickerOption<T>[];
  icon: string;
  title: string;
  displayValue?: string;
}

export function SettingsPicker<T extends string | null>({
  value,
  onChange,
  options,
  icon,
  title,
  displayValue,
}: SettingsPickerProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Get label for current value
  const currentOption = options.find(opt => opt.value === value);
  const label = displayValue ?? currentOption?.label ?? 'Auto';

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) {
        return;
      }
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

  // Reset focused index when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex(opt => opt.value === value);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, options, value]);

  // Handle keyboard navigation within dropdown
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + options.length) % options.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0) {
          onChange(options[focusedIndex].value);
          setIsOpen(false);
          buttonRef.current?.focus();
        }
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  }, [isOpen, options, focusedIndex, onChange]);

  // Focus the option when focusedIndex changes
  useEffect(() => {
    if (isOpen && focusedIndex >= 0) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  // Check if mobile (under md breakpoint)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate dropdown position (fixed positioning to escape overflow containers)
  // Use useLayoutEffect to calculate position before browser paints
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    if (isOpen && !isMobile && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = 300; // Approximate max height
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;

      // Prefer opening upward, but open downward if not enough space
      const openUpward = spaceAbove > dropdownHeight || spaceAbove > spaceBelow;

      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + 8 }
          : { top: rect.bottom + 8 }),
        minWidth: 180,
        zIndex: 9999,
      });
    } else if (!isOpen) {
      // Reset position when closed so it recalculates on next open
      setDropdownStyle({});
    }
  }, [isOpen, isMobile]);

  return (
    <>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span
          className="material-symbols-outlined text-slate-400"
          style={{ fontSize: '16px', width: '16px', height: '16px' }}
        >
          {icon}
        </span>
        <span>{label}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Desktop: Dropdown - only render when position is calculated */}
      {isOpen && !isMobile && dropdownStyle.position && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-elevated border border-slate-200 dark:border-slate-700 py-1 animate-fade-in"
          role="listbox"
        >
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {title}
            </span>
          </div>
          {options.map((option, index) => (
            <button
              key={String(option.value)}
              ref={el => { optionRefs.current[index] = el; }}
              onClick={() => handleSelect(option.value)}
              onMouseEnter={() => setFocusedIndex(index)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                option.value === value
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200'
                  : focusedIndex === index
                  ? 'bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
              role="option"
              aria-selected={option.value === value}
            >
              {option.icon && (
                <span
                  className="material-symbols-outlined text-slate-400"
                  style={{ fontSize: '16px', width: '16px', height: '16px' }}
                >
                  {option.icon}
                </span>
              )}
              <div className="flex-1">
                <div className="font-medium">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">{option.description}</div>
                )}
              </div>
              {option.value === value && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-amber-600 dark:text-amber-400">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
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
            {/* Drag handle */}
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
            </div>

            {/* Title */}
            <div className="px-4 pb-3 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold font-display">{title}</h3>
            </div>

            {/* Options grid */}
            <div className="p-4 grid grid-cols-3 gap-2">
              {options.map((option) => (
                <button
                  key={String(option.value)}
                  onClick={() => handleSelect(option.value)}
                  className={`p-3 rounded-xl text-center transition-all ${
                    option.value === value
                      ? 'bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-600'
                      : 'bg-slate-100 dark:bg-slate-700 border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {option.icon && (
                    <span
                      className={`material-symbols-outlined block mx-auto mb-1 ${
                        option.value === value ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                      }`}
                      style={{ fontSize: '24px' }}
                    >
                      {option.icon}
                    </span>
                  )}
                  <div className={`text-sm font-semibold ${
                    option.value === value ? 'text-amber-900 dark:text-amber-200' : 'text-slate-700 dark:text-slate-200'
                  }`}>
                    {option.label}
                  </div>
                  {option.description && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {option.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
