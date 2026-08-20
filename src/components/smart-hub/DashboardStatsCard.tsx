import { memo } from 'react';
import { cn } from '@/lib/utils';

interface DashboardStatsCardProps {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}

export const DashboardStatsCard = memo(function DashboardStatsCard({
  label,
  value,
  hint,
  className,
}: DashboardStatsCardProps) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 shadow-card', className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
});
