/**
 * Turns the parity record's file maps into the shapes the port consumes
 * (#736).
 *
 * The record stores a project as a path -> content map rather than as a
 * base64 ZIP, so the Python recorder (`zipfile`) and these tests (`fflate`)
 * build the same archive by construction instead of agreeing on one blob's
 * bytes. Text files are stored as text so a diff of the record is readable;
 * binary files carry base64.
 *
 * Test-only, but not a `.test.ts` file: three different parity suites read
 * the same record, and a helper that lives inside one of them is a helper the
 * others import from a test file.
 */

import { zipSync } from "fflate";

import { buildProjectTree, type ProjectTree } from "./projectFiles";

/** One file in a recorded project: UTF-8 text, or base64 bytes. */
export interface RecordedFile {
    text?: string;
    b64?: string;
}

/**
 * A recorded project's files.
 *
 * The value is optional because the record's cases do not all carry the same
 * paths, so TypeScript infers the imported JSON's union with `undefined` on
 * every key that some case omits. Accepting that here keeps the call sites
 * free of an `as unknown as` cast, which would also switch off the checking
 * that makes this type worth having.
 */
export type RecordedFiles = Record<string, RecordedFile | undefined>;

function decodeBase64(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** A recorded file map as raw ZIP-entry bytes. */
export function recordedEntries(files: RecordedFiles): Record<string, Uint8Array> {
    const encoder = new TextEncoder();
    const entries: Record<string, Uint8Array> = {};
    for (const [path, file] of Object.entries(files)) {
        if (file === undefined) continue;
        entries[path] =
            file.b64 !== undefined ? decodeBase64(file.b64) : encoder.encode(file.text ?? "");
    }
    return entries;
}

/** A recorded file map as a project tree, wrapper directory already stripped. */
export function recordedTree(files: RecordedFiles): ProjectTree {
    return buildProjectTree(recordedEntries(files));
}

/**
 * A recorded file map as a real ZIP archive.
 *
 * For the orchestrator's own tests, which take the bytes a user drops rather
 * than a tree - so the unzip step is exercised too.
 */
export function recordedZip(files: RecordedFiles): Uint8Array {
    return zipSync(recordedEntries(files));
}
