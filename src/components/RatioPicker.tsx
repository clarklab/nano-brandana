import { SettingsPicker, PickerOption } from './SettingsPicker';

export type AspectRatio = '1:1' | '2:3' | '3:4' | '4:5' | '9:16' | '3:2' | '4:3' | '5:4' | '16:9' | '21:9' | null;

const RATIO_OPTIONS: PickerOption<AspectRatio>[] = [
  {
    value: null,
    label: 'Auto',
    description: 'AI decides',
    icon: 'auto_awesome',
  },
  {
    value: '1:1',
    label: 'Square',
    description: '1:1',
    icon: 'crop_square',
  },
  {
    value: '4:5',
    label: 'Portrait',
    description: '4:5',
    icon: 'crop_portrait',
  },
  {
    value: '9:16',
    label: 'Story',
    description: '9:16',
    icon: 'smartphone',
  },
  {
    value: '16:9',
    label: 'Wide',
    description: '16:9',
    icon: 'crop_landscape',
  },
  {
    value: '3:2',
    label: 'Photo',
    description: '3:2',
    icon: 'photo_camera',
  },
];

// Extended options for when we want to show all ratios
export const ALL_RATIO_OPTIONS: PickerOption<AspectRatio>[] = [
  {
    value: null,
    label: 'Auto',
    description: 'AI decides',
    icon: 'auto_awesome',
  },
  // Square
  {
    value: '1:1',
    label: 'Square',
    description: '1:1',
    icon: 'crop_square',
  },
  // Portrait
  {
    value: '2:3',
    label: 'Portrait',
    description: '2:3',
    icon: 'crop_portrait',
  },
  {
    value: '3:4',
    label: 'Portrait',
    description: '3:4',
    icon: 'crop_portrait',
  },
  {
    value: '4:5',
    label: 'Portrait',
    description: '4:5',
    icon: 'crop_portrait',
  },
  {
    value: '9:16',
    label: 'Story',
    description: '9:16',
    icon: 'smartphone',
  },
  // Landscape
  {
    value: '3:2',
    label: 'Photo',
    description: '3:2',
    icon: 'crop_landscape',
  },
  {
    value: '4:3',
    label: 'Classic',
    description: '4:3',
    icon: 'crop_landscape',
  },
  {
    value: '5:4',
    label: 'Medium',
    description: '5:4',
    icon: 'crop_landscape',
  },
  {
    value: '16:9',
    label: 'Wide',
    description: '16:9',
    icon: 'crop_landscape',
  },
  {
    value: '21:9',
    label: 'Cinema',
    description: '21:9',
    icon: 'movie',
  },
];

interface RatioPickerProps {
  value: AspectRatio;
  onChange: (value: AspectRatio) => void;
  showAllOptions?: boolean;
}

export function RatioPicker({ value, onChange, showAllOptions = false }: RatioPickerProps) {
  const options = showAllOptions ? ALL_RATIO_OPTIONS : RATIO_OPTIONS;

  // Get display value - show the ratio string if not auto
  const displayValue = value ?? 'Auto';

  return (
    <SettingsPicker
      value={value}
      onChange={onChange}
      options={options}
      icon="crop"
      title="Aspect Ratio"
      displayValue={displayValue}
    />
  );
}
