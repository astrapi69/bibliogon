/**
 * useEditorImageUpload — image upload + insert for the chapter Editor (#207).
 *
 * Extracted verbatim from Editor.tsx (no behaviour change): owns the hidden
 * file-input ref, the upload-asset-then-insert side effect, and the
 * context-menu file-selected handler. The editor's drag/paste handlers in
 * the `useEditor` config call `uploadAndInsertImage` directly.
 */

import { useRef, type ChangeEvent, type MutableRefObject } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";

import { getStorage } from "../../storage";
import { warnIfOfflineStorageNearlyFull } from "../../utils/platform/storageQuota";
import { notify } from "../../utils/platform/notify";

interface Params {
  bookId?: string;
  /** Live editor instance ref (kept in sync by the caller). */
  editorRef: MutableRefObject<TiptapEditor | null>;
  t: (key: string, fallback: string) => string;
}

export function useEditorImageUpload({ bookId, editorRef, t }: Params) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const uploadAndInsertImage = async (file: File) => {
    if (!bookId) return;
    try {
      const asset = await getStorage().assets.upload(bookId, file, "figure");
      const src = `/api/books/${bookId}/assets/file/${asset.filename}`;
      editorRef.current?.chain().focus().setImage({ src, alt: file.name }).run();
      void warnIfOfflineStorageNearlyFull(
        t(
          "ui.offline.storage_almost_full",
          "Browser-Speicher fast voll. Entferne nicht benötigte Offline-Bücher, um Platz zu schaffen.",
        ),
      );
    } catch (err) {
      notify.error(t("ui.editor.upload_failed", "Upload fehlgeschlagen"), err);
    }
  };

  // Context-menu "Insert image": open a file picker, then run the
  // same upload+insert path as drag/paste. Only wired when the
  // surface has a bookId to upload assets against.
  const handleImageFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      void uploadAndInsertImage(file);
    }
    event.target.value = "";
  };

  return { imageInputRef, uploadAndInsertImage, handleImageFileSelected };
}
