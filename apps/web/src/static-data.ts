import type { ProjectSnapshot } from '@shishan/protocol';

export interface StaticShiShanData {
  snapshot: ProjectSnapshot;
  sources?: Readonly<Record<string, string>>;
  generatedAt: string;
}

declare global {
  interface Window {
    __SHISHAN_STATIC__?: StaticShiShanData;
  }
}

export function readStaticData(): StaticShiShanData | undefined {
  return window.__SHISHAN_STATIC__;
}
