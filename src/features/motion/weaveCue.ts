export type WeaveCueKind = "filter" | "layout" | "sidebar" | "tag" | "scan-complete";

export interface WeaveCue {
  id: number;
  kind: WeaveCueKind;
  color?: string;
}

export interface WeaveCueOptions {
  color?: string;
  duration?: number;
}
