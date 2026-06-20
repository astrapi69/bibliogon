import React, {useRef, useState} from "react"
import {type Page, type PageLayout, type PageUpdate} from "../api/client"
import {getStorage} from "../storage"
import {warnIfOfflineStorageNearlyFull} from "../utils/storageQuota"
import {writeSecondaryImageAssetId} from "../utils/editor/layoutConfig"
import {useI18n} from "../hooks/useI18n"

interface UsePageImageUploadArgs {
    page: Page
    bookId: string
    onUpdate: (updates: PageUpdate) => Promise<void> | void
}

interface UsePageImageUploadResult {
    fileInputRef: React.RefObject<HTMLInputElement | null>
    uploading: boolean
    uploadError: string | null
    setUploadError: React.Dispatch<React.SetStateAction<string | null>>
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
    /** #437: drag-and-drop entry-point. Uploads + persists the primary
     *  image directly from a File (no input event), sharing the exact
     *  upload/persist path as handleFileChange. */
    uploadPrimaryFile: (file: File) => Promise<void>
    secondaryFileInputRef: React.RefObject<HTMLInputElement | null>
    uploadingSecondary: boolean
    uploadSecondaryError: string | null
    handleSecondaryFileChange: (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => Promise<void>
}

/**
 * PB-PHASE4 god-file split: the page-image upload logic extracted
 * from PageCanvas. Owns the primary + secondary image upload
 * handlers plus their busy/error state and the file-input refs.
 * The JSX (file inputs, replace buttons, error rows) stays in
 * PageCanvas and wires to the refs/handlers/state returned here.
 *
 * ``setUploadError`` is returned so the consumer can reset the
 * primary upload error inside its own page-switch effect (keeping
 * the original combined-effect timing identical).
 *
 * The primary handler persists ``image_asset_id`` directly on the
 * page; the secondary handler stores its asset id at
 * ``layout_config[layout].secondary_image_asset_id`` via
 * writeSecondaryImageAssetId (preserving the namespaced shape +
 * sibling layouts' configs).
 */
export function usePageImageUpload({
    page,
    bookId,
    onUpdate,
}: UsePageImageUploadArgs): UsePageImageUploadResult {
    const {t} = useI18n()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    // Phase 2 C2 (2026-05-28): multi-image layouts need a separate
    // upload affordance for the SECONDARY image. State + ref are
    // mounted in every render to keep the hook order stable; the
    // JSX block that reads them is conditionally rendered only for
    // multi-image layouts. Empty state on non-multi-image layouts
    // is harmless.
    const secondaryFileInputRef = useRef<HTMLInputElement>(null)
    const [uploadingSecondary, setUploadingSecondary] = useState(false)
    const [uploadSecondaryError, setUploadSecondaryError] = useState<
        string | null
    >(null)

    const uploadPrimaryFile = async (file: File) => {
        setUploading(true)
        setUploadError(null)
        try {
            const asset = await getStorage().assets.upload(bookId, file, "figure")
            await onUpdate({image_asset_id: asset.id})
            void warnIfOfflineStorageNearlyFull(
                t(
                    "ui.offline.storage_almost_full",
                    "Browser-Speicher fast voll. Entferne nicht benötigte Offline-Bücher, um Platz zu schaffen.",
                ),
            )
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : String(err))
        } finally {
            setUploading(false)
        }
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            await uploadPrimaryFile(file)
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    /** Phase 2 C2 (2026-05-28): upload + persist the SECONDARY image
     *  for multi-image layouts. Mirrors handleFileChange but stores
     *  the asset id at ``layout_config[layout].secondary_image_asset_id``
     *  via writeSecondaryImageAssetId — preserving the namespaced
     *  shape + sibling layouts' configs. */
    const handleSecondaryFileChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploadingSecondary(true)
        setUploadSecondaryError(null)
        try {
            const asset = await getStorage().assets.upload(bookId, file, "figure")
            const nextConfig = writeSecondaryImageAssetId(
                page.layout_config,
                page.layout as PageLayout,
                asset.id,
            )
            await onUpdate({layout_config: nextConfig})
            void warnIfOfflineStorageNearlyFull(
                t(
                    "ui.offline.storage_almost_full",
                    "Browser-Speicher fast voll. Entferne nicht benötigte Offline-Bücher, um Platz zu schaffen.",
                ),
            )
        } catch (err: unknown) {
            setUploadSecondaryError(
                err instanceof Error ? err.message : String(err),
            )
        } finally {
            setUploadingSecondary(false)
            if (secondaryFileInputRef.current)
                secondaryFileInputRef.current.value = ""
        }
    }

    return {
        fileInputRef,
        uploading,
        uploadError,
        setUploadError,
        handleFileChange,
        uploadPrimaryFile,
        secondaryFileInputRef,
        uploadingSecondary,
        uploadSecondaryError,
        handleSecondaryFileChange,
    }
}
