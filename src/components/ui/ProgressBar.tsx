interface ProgressBarProps {
  value: number;
  max?: number;
  /** A static Tailwind class (e.g. 'bg-primary-600') OR a hex color (e.g. '#3B82F6') */
  color?: string;
  height?: string;
  showLabel?: boolean;
}

export default function ProgressBar({
  value,
  max = 100,
  color = 'bg-primary-600',
  height = 'h-2',
  showLabel = false,
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  // If color starts with '#' or 'rgb', treat as inline style; otherwise as Tailwind class
  const isInlineColor = color.startsWith('#') || color.startsWith('rgb');

  return (
    <div className="w-full">
      <div className={`w-full bg-gray-200 rounded-full ${height}`}>
        <div
          className={`${isInlineColor ? '' : color} ${height} rounded-full transition-all duration-500`}
          style={{
            width: `${percentage}%`,
            ...(isInlineColor ? { backgroundColor: color } : {}),
          }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-gray-500 mt-1">{percentage.toFixed(1)}%</p>
      )}
    </div>
  );
}
