export async function fetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('Fetch error') as Error & { status: number };
    error.status = res.status;
    try {
      const body = await res.json();
      error.message = body.error || `Request failed (${res.status})`;
    } catch {
      error.message = `Request failed (${res.status})`;
    }
    throw error;
  }
  return res.json();
}

export function calculateTurnout(voted: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((voted / total) * 1000) / 10;
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return '0';
  return num.toLocaleString();
}

export function formatTurnout(voted: number, total: number): string {
  return `${formatNumber(voted)} / ${formatNumber(total)}`;
}

export function classNames(...classes: (string | number | boolean | undefined | null)[]): string {
  return classes.filter((c): c is string => typeof c === 'string' && c.length > 0).join(' ');
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-100 text-green-800';
    case 'ACTIVE':
      return 'bg-blue-100 text-blue-800';
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'Reported';
    case 'ACTIVE':
      return 'In Progress';
    case 'PENDING':
      return 'Pending';
    default:
      return status;
  }
}
