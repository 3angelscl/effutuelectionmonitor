import { ReactNode } from 'react';
import Card from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: string;
  trendUp?: boolean;
  progress?: number;
  valueClassName?: string;
}

export default function StatCard({
  label,
  value,
  subtitle,
  icon,
  trend,
  trendUp,
  progress,
  valueClassName,
}: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-2">
            {label}
          </p>
          <div className="flex items-baseline gap-2">
            <p className={`text-3xl font-bold ${valueClassName || 'text-gray-900'}`}>{value}</p>
            {trend && (
              <span
                className={`text-sm font-medium ${
                  trendUp ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {trend}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="text-primary-500">{icon}</div>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </Card>
  );
}
