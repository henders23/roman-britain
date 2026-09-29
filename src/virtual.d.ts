// Served by scripts/vite-datasets.mjs. Each load() resolves to a DatasetModule (src/data/schema.ts).
declare module 'virtual:atlas-datasets' {
  export const DATASETS: Record<string, { slug: string; title: string; subtitle: string; load: () => Promise<{ default: unknown }> }>;
  export const DEFAULT_DATASET: string | null;
}
