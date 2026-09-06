// The structural document shape shared by conversion and content inspection.
export type PageDocumentNode = {
  attrs?: Record<string, unknown>;
  content?: PageDocumentNode[];
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>;
  text?: string;
  type?: string;
};
