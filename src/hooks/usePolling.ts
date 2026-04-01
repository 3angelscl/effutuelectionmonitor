import useSWR from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`API error: ${res.status} ${res.statusText}`);
    (err as Error & { status: number }).status = res.status;
    throw err;
  }
  return res.json();
};

export function usePollingData<T>(url: string, refreshInterval = 30000) {
  const { data, error, isLoading, mutate } = useSWR<T>(url, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
  });

  return { data, error, isLoading, mutate };
}
