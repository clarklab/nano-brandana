import { useState, useMemo, useCallback } from 'react';

interface IconPickerProps {
  selectedIcon: string | null;
  onSelectIcon: (icon: string | null) => void;
}

// Curated list of Material Icons suitable for image editing presets
// Each entry has the icon name and searchable keywords
const AVAILABLE_ICONS: { name: string; keywords: string[] }[] = [
  // Image manipulation
  { name: 'image', keywords: ['image', 'photo', 'picture'] },
  { name: 'photo', keywords: ['photo', 'image', 'picture'] },
  { name: 'hide_image', keywords: ['hide', 'remove', 'background', 'transparent'] },
  { name: 'broken_image', keywords: ['broken', 'error', 'missing'] },
  { name: 'crop', keywords: ['crop', 'trim', 'cut'] },
  { name: 'crop_free', keywords: ['crop', 'free', 'aspect'] },
  { name: 'rotate_left', keywords: ['rotate', 'left', 'turn'] },
  { name: 'rotate_right', keywords: ['rotate', 'right', 'turn'] },
  { name: 'flip', keywords: ['flip', 'mirror', 'horizontal'] },
  { name: 'flip_camera_android', keywords: ['flip', 'camera', 'mirror'] },

  // Zoom and size
  { name: 'zoom_in', keywords: ['zoom', 'in', 'enlarge', 'upscale', 'bigger'] },
  { name: 'zoom_out', keywords: ['zoom', 'out', 'shrink', 'smaller'] },
  { name: 'fullscreen', keywords: ['fullscreen', 'expand', 'maximize'] },
  { name: 'photo_size_select_large', keywords: ['size', 'large', 'upscale', 'resize'] },
  { name: 'photo_size_select_small', keywords: ['size', 'small', 'downscale', 'resize'] },
  { name: 'aspect_ratio', keywords: ['aspect', 'ratio', 'size', 'dimensions'] },

  // Colors and effects
  { name: 'palette', keywords: ['palette', 'color', 'brand', 'paint'] },
  { name: 'colorize', keywords: ['color', 'colorize', 'tint', 'hue'] },
  { name: 'format_color_fill', keywords: ['fill', 'color', 'bucket', 'paint'] },
  { name: 'invert_colors', keywords: ['invert', 'colors', 'negative'] },
  { name: 'filter_b_and_w', keywords: ['black', 'white', 'grayscale', 'desaturate', 'monochrome'] },
  { name: 'gradient', keywords: ['gradient', 'fade', 'blend'] },
  { name: 'contrast', keywords: ['contrast', 'levels', 'adjust'] },
  { name: 'brightness_6', keywords: ['brightness', 'light', 'exposure'] },
  { name: 'wb_sunny', keywords: ['sunny', 'warm', 'temperature', 'white balance'] },
  { name: 'tonality', keywords: ['tone', 'tonality', 'adjust'] },

  // Filters and effects
  { name: 'auto_awesome', keywords: ['magic', 'auto', 'enhance', 'transform', 'style'] },
  { name: 'auto_fix_high', keywords: ['fix', 'auto', 'enhance', 'repair'] },
  { name: 'blur_on', keywords: ['blur', 'soft', 'smooth'] },
  { name: 'blur_off', keywords: ['sharp', 'sharpen', 'clear'] },
  { name: 'filter', keywords: ['filter', 'effect', 'style'] },
  { name: 'filter_vintage', keywords: ['vintage', 'retro', 'old', 'film'] },
  { name: 'filter_drama', keywords: ['drama', 'clouds', 'sky'] },
  { name: 'hdr_strong', keywords: ['hdr', 'dynamic', 'range'] },
  { name: 'hdr_enhanced_select', keywords: ['hdr', 'enhanced', 'quality'] },
  { name: 'vignette', keywords: ['vignette', 'border', 'fade'] },
  { name: 'grain', keywords: ['grain', 'noise', 'texture', 'film'] },

  // Copy and duplicate
  { name: 'content_copy', keywords: ['copy', 'duplicate', 'clone'] },
  { name: 'file_copy', keywords: ['copy', 'file', 'duplicate'] },
  { name: 'filter_none', keywords: ['layers', 'duplicate', 'copy', 'stack'] },
  { name: 'library_add', keywords: ['add', 'library', 'more', 'duplicate'] },
  { name: 'dynamic_feed', keywords: ['multiple', 'variations', 'feed'] },

  // Text and overlays
  { name: 'text_fields', keywords: ['text', 'caption', 'title', 'words'] },
  { name: 'title', keywords: ['title', 'heading', 'text'] },
  { name: 'format_quote', keywords: ['quote', 'text', 'caption'] },
  { name: 'label', keywords: ['label', 'tag', 'name'] },
  { name: 'bookmark', keywords: ['bookmark', 'save', 'mark'] },

  // Drawing and editing
  { name: 'edit', keywords: ['edit', 'pencil', 'modify'] },
  { name: 'brush', keywords: ['brush', 'paint', 'draw'] },
  { name: 'draw', keywords: ['draw', 'sketch', 'pen'] },
  { name: 'gesture', keywords: ['gesture', 'hand', 'draw'] },
  { name: 'healing', keywords: ['heal', 'repair', 'fix', 'retouch'] },
  { name: 'auto_fix_normal', keywords: ['fix', 'auto', 'adjust'] },

  // Shapes and elements
  { name: 'category', keywords: ['category', 'shapes', 'elements'] },
  { name: 'interests', keywords: ['shapes', 'geometry', 'elements'] },
  { name: 'star', keywords: ['star', 'favorite', 'rate'] },
  { name: 'favorite', keywords: ['heart', 'love', 'favorite'] },
  { name: 'circle', keywords: ['circle', 'shape', 'round'] },
  { name: 'square', keywords: ['square', 'shape', 'box'] },

  // Camera and photos
  { name: 'camera', keywords: ['camera', 'photo', 'shoot'] },
  { name: 'camera_alt', keywords: ['camera', 'photo', 'picture'] },
  { name: 'photo_camera', keywords: ['camera', 'photo', 'shoot'] },
  { name: 'photo_library', keywords: ['library', 'gallery', 'photos'] },
  { name: 'collections', keywords: ['collections', 'gallery', 'photos'] },
  { name: 'portrait', keywords: ['portrait', 'face', 'person'] },
  { name: 'face_retouching_natural', keywords: ['face', 'retouch', 'beauty', 'portrait'] },

  // Layers and composition
  { name: 'layers', keywords: ['layers', 'stack', 'compose'] },
  { name: 'layers_clear', keywords: ['layers', 'clear', 'remove'] },
  { name: 'view_in_ar', keywords: ['3d', 'ar', 'perspective'] },
  { name: 'flip_to_back', keywords: ['back', 'layer', 'behind'] },
  { name: 'flip_to_front', keywords: ['front', 'layer', 'forward'] },

  // Actions
  { name: 'delete', keywords: ['delete', 'remove', 'trash'] },
  { name: 'remove_circle', keywords: ['remove', 'delete', 'minus'] },
  { name: 'add_circle', keywords: ['add', 'plus', 'new'] },
  { name: 'refresh', keywords: ['refresh', 'reload', 'reset'] },
  { name: 'undo', keywords: ['undo', 'back', 'revert'] },
  { name: 'redo', keywords: ['redo', 'forward', 'repeat'] },
  { name: 'restore', keywords: ['restore', 'recover', 'reset'] },

  // Download and export
  { name: 'download', keywords: ['download', 'save', 'export'] },
  { name: 'upload', keywords: ['upload', 'import', 'add'] },
  { name: 'save', keywords: ['save', 'disk', 'store'] },
  { name: 'share', keywords: ['share', 'send', 'export'] },

  // Misc useful
  { name: 'settings', keywords: ['settings', 'config', 'gear'] },
  { name: 'tune', keywords: ['tune', 'adjust', 'settings'] },
  { name: 'build', keywords: ['build', 'tools', 'wrench'] },
  { name: 'flash_on', keywords: ['flash', 'light', 'bright'] },
  { name: 'flash_off', keywords: ['flash', 'off', 'no light'] },
  { name: 'visibility', keywords: ['show', 'visible', 'eye', 'view'] },
  { name: 'visibility_off', keywords: ['hide', 'invisible', 'eye', 'hidden'] },
  { name: 'center_focus_strong', keywords: ['focus', 'center', 'target'] },
  { name: 'style', keywords: ['style', 'theme', 'design'] },
  { name: 'smart_toy', keywords: ['ai', 'robot', 'smart', 'auto'] },
  { name: 'psychology', keywords: ['ai', 'brain', 'smart', 'think'] },
  { name: 'bolt', keywords: ['fast', 'quick', 'lightning', 'speed'] },
  { name: 'water_drop', keywords: ['water', 'drop', 'liquid', 'wet'] },
  { name: 'local_fire_department', keywords: ['fire', 'hot', 'flame'] },
  { name: 'ac_unit', keywords: ['cold', 'snow', 'freeze', 'ice'] },
  { name: 'park', keywords: ['nature', 'tree', 'outdoor', 'green'] },
  { name: 'landscape', keywords: ['landscape', 'mountain', 'scenery'] },
  { name: 'nightlight', keywords: ['night', 'dark', 'moon'] },
  { name: 'light_mode', keywords: ['light', 'day', 'sun', 'bright'] },
  { name: 'dark_mode', keywords: ['dark', 'night', 'moon'] },
];

export function IconPicker({ selectedIcon, onSelectIcon }: IconPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredIcons = useMemo(() => {
    if (!searchQuery.trim()) {
      return AVAILABLE_ICONS;
    }
    const query = searchQuery.toLowerCase().trim();
    return AVAILABLE_ICONS.filter(
      (icon) =>
        icon.name.toLowerCase().includes(query) ||
        icon.keywords.some((kw) => kw.toLowerCase().includes(query))
    );
  }, [searchQuery]);

  const handleSelectIcon = useCallback((iconName: string | null) => {
    onSelectIcon(iconName);
    setIsOpen(false);
    setSearchQuery('');
  }, [onSelectIcon]);

  return (
    <div className="relative">
      {/* Selected icon display / trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-neon/50 focus:border-neon focus:ring-2 focus:ring-neon/20 focus:outline-none transition-all duration-200 w-full text-left group"
      >
        {selectedIcon ? (
          <>
            <span
              className="material-symbols-outlined text-slate-600 dark:text-slate-300 group-hover:text-neon transition-colors"
              style={{ fontSize: '20px', width: '20px', height: '20px' }}
            >
              {selectedIcon}
            </span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{selectedIcon}</span>
          </>
        ) : (
          <span className="text-sm text-slate-400 dark:text-slate-500 flex-1">No icon selected</span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown picker */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-elevated max-h-72 overflow-hidden flex flex-col animate-fade-in">
          {/* Search input */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-700">
            <div className="relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              >
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search icons..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-neon/30 focus:border-neon focus:outline-none transition-all text-slate-700 dark:text-slate-200 placeholder-slate-400"
                autoFocus
              />
            </div>
          </div>

          {/* Clear option */}
          <button
            type="button"
            onClick={() => handleSelectIcon(null)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700 transition-colors"
          >
            <span className="w-5 h-5 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-md text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </span>
            <span className="font-medium">No icon</span>
          </button>

          {/* Icon grid */}
          <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
            {filteredIcons.length === 0 ? (
              <div className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
                No icons found
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-1.5">
                {filteredIcons.map((icon) => (
                  <button
                    key={icon.name}
                    type="button"
                    onClick={() => handleSelectIcon(icon.name)}
                    className={`p-2 rounded-lg transition-all duration-150 flex items-center justify-center ${
                      selectedIcon === icon.name
                        ? 'bg-neon/20 ring-2 ring-neon text-slate-900 dark:text-white'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                    title={icon.name}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '22px', width: '22px', height: '22px' }}
                    >
                      {icon.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default IconPicker;
