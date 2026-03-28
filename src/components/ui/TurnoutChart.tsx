'use client';

interface DataPoint {
  timestamp: string;
  turnoutPercentage: number;
}

interface TurnoutChartProps {
  data: DataPoint[];
}

export default function TurnoutChart({ data }: TurnoutChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
        No trend data available yet
      </div>
    );
  }

  const width = 100; // percentage-based for responsiveness
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = 800 - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Y-axis: 0-100%
  const yMin = 0;
  const yMax = 100;

  // Map data points to SVG coordinates
  const points = data.map((d, i) => {
    const x = padding.left + (data.length === 1 ? chartWidth / 2 : (i / (data.length - 1)) * chartWidth);
    const y = padding.top + chartHeight - ((d.turnoutPercentage - yMin) / (yMax - yMin)) * chartHeight;
    return { x, y, ...d };
  });

  // Build the line path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Build the area path (for gradient fill)
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  // Y-axis grid lines & labels
  const yTicks = [0, 25, 50, 75, 100];

  // X-axis labels: show up to ~8 evenly spaced labels
  const maxLabels = 8;
  const labelInterval = Math.max(1, Math.floor(data.length / maxLabels));
  const xLabels = points.filter((_, i) => i % labelInterval === 0 || i === points.length - 1);

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const gradientId = 'turnout-gradient';

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <svg
        viewBox={`0 0 800 ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F94433" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#F94433" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y-axis grid lines and labels */}
        {yTicks.map((tick) => {
          const y = padding.top + chartHeight - ((tick - yMin) / (yMax - yMin)) * chartHeight;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + chartWidth}
                y2={y}
                stroke="#E5E7EB"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="text-[11px]"
                fill="#9CA3AF"
              >
                {tick}%
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#F94433" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#FFFFFF"
            stroke="#F94433"
            strokeWidth="2"
          />
        ))}

        {/* X-axis labels */}
        {xLabels.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={padding.top + chartHeight + 24}
            textAnchor="middle"
            className="text-[11px]"
            fill="#9CA3AF"
          >
            {formatTime(p.timestamp)}
          </text>
        ))}

        {/* Axes */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + chartHeight}
          stroke="#D1D5DB"
        />
        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={padding.left + chartWidth}
          y2={padding.top + chartHeight}
          stroke="#D1D5DB"
        />
      </svg>
    </div>
  );
}
