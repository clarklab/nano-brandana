import { SettingsPicker, PickerOption } from './SettingsPicker';

export type ImageSize = '1K' | '2K' | '4K';

const QUALITY_OPTIONS: PickerOption<ImageSize>[] = [
  {
    value: '1K',
    label: 'SD',
    description: '~1024px',
    icon: 'sd',
  },
  {
    value: '2K',
    label: 'HD',
    description: '~2048px',
    icon: 'hd',
  },
  {
    value: '4K',
    label: '4K',
    description: '~4096px',
    icon: '4k',
  },
];

interface QualityPickerProps {
  value: ImageSize;
  onChange: (value: ImageSize) => void;
}

export function QualityPicker({ value, onChange }: QualityPickerProps) {
  return (
    <SettingsPicker
      value={value}
      onChange={onChange}
      options={QUALITY_OPTIONS}
      icon="tune"
      title="Quality"
    />
  );
}
