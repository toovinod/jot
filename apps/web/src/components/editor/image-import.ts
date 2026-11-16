import type { Editor, EditorEvents } from "@tiptap/react";
import { upload } from "@/lib/api";
export function isSupportedImage(file: File) {
  return /^image\/(png|jpeg|gif)$/.test(file.type) && file.size <= 10 * 1024 * 1024;
}
export async function uploadEditorImages({
  editor,
  files,
  position = editor.state.selection.to,
  onPendingChange,
  onError,
  isDisabled,
  uploadFile = upload,
}: {
  editor: Editor;
  files: File[];
  position?: number;
  onPendingChange: (delta: number) => void;
  onError: (message: string) => void;
  isDisabled: () => boolean;
  uploadFile?: (file: File) => Promise<{ url: string }>;
}) {
  const supported = files.filter(isSupportedImage);
  if (supported.length !== files.length)
    onError(
      "Only PNG, JPEG, and GIF images smaller than 10 MB can be uploaded. Video is not supported.",
    );
  if (!supported.length) return;
  onPendingChange(supported.length);
  // Map the insertion point through edits so delayed images retain order without stealing the cursor.
  let anchor = position;
  const mapAnchor = ({ transaction }: EditorEvents["transaction"]) => {
    anchor = transaction.mapping.map(anchor, 1);
  };
  editor.on("transaction", mapAnchor);
  try {
    for (const item of supported) {
      try {
        const result = await uploadFile(item);
        if (editor.isDestroyed) continue;
        if (isDisabled()) {
          onError(
            "Upload finished while the editor was busy. Upload the file again after the operation finishes.",
          );
          continue;
        }
        editor.commands.insertContentAt(
          Math.min(anchor, editor.state.doc.content.size),
          { type: "image", attrs: { src: result.url, alt: item.name } },
          { updateSelection: false },
        );
        // Block insertion can normalize a position out of a paragraph. Find its actual end.
        let insertedEnd = anchor;
        let closestDistance = Infinity;
        editor.state.doc.descendants((node, position) => {
          if (
            node.type.name === "image" &&
            node.attrs.src === result.url &&
            Math.abs(position - anchor) < closestDistance
          ) {
            insertedEnd = position + node.nodeSize;
            closestDistance = Math.abs(position - anchor);
          }
        });
        anchor = insertedEnd;
      } catch (error) {
        onError((error as Error).message);
      } finally {
        onPendingChange(-1);
      }
    }
  } finally {
    editor.off("transaction", mapAnchor);
  }
}
