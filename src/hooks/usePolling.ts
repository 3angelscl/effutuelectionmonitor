import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function usePollingData<T>(url: string, refreshInterval = 30000) {
  const { data, error, isLoading, mutate } = useSWR<T>(url, fetcher, {
    refreshInterval,
    revalidateOnFocus: true,
  });

  return { data, error, isLoading, mutate };
}
