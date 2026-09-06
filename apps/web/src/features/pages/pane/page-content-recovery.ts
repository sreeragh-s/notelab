import { isEffectivelyEmptyPageContent } from "@zilobase/page-context";

type PageContentHandle = {
  getContentJson: () => unknown;
  setContentJson: (content: unknown) => boolean;
};

// A null result stops structural recovery when the editor rejects restoration.
export function recoverPageEditorContent(handle: PageContentHandle, savedContent: unknown) {
  let content = handle.getContentJson();
  if (isEffectivelyEmptyPageContent(content) && !isEffectivelyEmptyPageContent(savedContent)) {
    if (!handle.setContentJson(savedContent)) return null;
    content = handle.getContentJson() ?? savedContent;
  }
  return { content };
}
