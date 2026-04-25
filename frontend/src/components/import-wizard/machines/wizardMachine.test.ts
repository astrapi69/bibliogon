import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import { wizardMachine } from "./wizardMachine";
import type { DetectedProject, DuplicateInfo } from "../../../api/import";

function singleBookDetected(): DetectedProject {
    return {
        format_name: "bgb",
        source_identifier: "sha256:single",
        title: "Solo",
        author: "A",
        is_multi_book: false,
        books: null,
    } as unknown as DetectedProject;
}

function multiBookDetected(ids: string[]): DetectedProject {
    return {
        format_name: "bgb",
        source_identifier: "sha256:multi::" + ids[0],
        title: "First",
        author: "A",
        is_multi_book: true,
        books: ids.map((id, i) => ({
            title: `Book ${i + 1}`,
            author: "A",
            subtitle: null,
            chapter_count: 1,
            has_cover: false,
            source_identifier: `sha256:multi::${id}`,
            duplicate_of: null,
        })),
    } as unknown as DetectedProject;
}

function noDup(): DuplicateInfo {
    return { found: false } as DuplicateInfo;
}

describe("wizardMachine", () => {
    it("starts in upload state", () => {
        const actor = createActor(wizardMachine).start();
        expect(actor.getSnapshot().value).toBe("upload");
        actor.stop();
    });

    it("SELECT_FILE moves to detecting", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        expect(actor.getSnapshot().value).toBe("detecting");
        actor.stop();
    });

    it("SELECT_GIT_URL moves to detecting", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_GIT_URL", url: "https://x/y.git" });
        expect(actor.getSnapshot().value).toBe("detecting");
        actor.stop();
    });

    it("DETECTION_COMPLETE single-book moves to summary", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_COMPLETE",
            detected: singleBookDetected(),
            duplicate: noDup(),
            tempRef: "imp-1",
        });
        expect(actor.getSnapshot().value).toBe("summary");
        actor.stop();
    });

    it("ADVANCE_FROM_SUMMARY routes to previewSingleBook for single", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_COMPLETE",
            detected: singleBookDetected(),
            duplicate: noDup(),
            tempRef: "imp-1",
        });
        actor.send({ type: "ADVANCE_FROM_SUMMARY" });
        expect(actor.getSnapshot().value).toBe("previewSingleBook");
        actor.stop();
    });

    it("ADVANCE_FROM_SUMMARY routes to previewMultiBook for multi", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_COMPLETE",
            detected: multiBookDetected(["a", "b", "c"]),
            duplicate: noDup(),
            tempRef: "imp-2",
        });
        actor.send({ type: "ADVANCE_FROM_SUMMARY" });
        expect(actor.getSnapshot().value).toBe("previewMultiBook");
        actor.stop();
    });

    it("multi-book starts with all selected by default", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_COMPLETE",
            detected: multiBookDetected(["a", "b"]),
            duplicate: noDup(),
            tempRef: "imp-2",
        });
        const ids =
            actor.getSnapshot().context.multiBookSelection.selectedSourceIds;
        expect(ids).toEqual(["sha256:multi::a", "sha256:multi::b"]);
        actor.stop();
    });

    it("TOGGLE_BOOK_SELECTION removes/adds the id", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_COMPLETE",
            detected: multiBookDetected(["a", "b"]),
            duplicate: noDup(),
            tempRef: "imp-2",
        });
        actor.send({ type: "ADVANCE_FROM_SUMMARY" });
        actor.send({
            type: "TOGGLE_BOOK_SELECTION",
            sourceId: "sha256:multi::a",
        });
        expect(
            actor.getSnapshot().context.multiBookSelection.selectedSourceIds,
        ).toEqual(["sha256:multi::b"]);
        actor.stop();
    });

    it("DESELECT_ALL_BOOKS empties selection; EXECUTE blocked by guard", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_COMPLETE",
            detected: multiBookDetected(["a", "b"]),
            duplicate: noDup(),
            tempRef: "imp-2",
        });
        actor.send({ type: "ADVANCE_FROM_SUMMARY" });
        actor.send({ type: "DESELECT_ALL_BOOKS" });
        expect(
            actor.getSnapshot().context.multiBookSelection.selectedSourceIds,
        ).toEqual([]);
        // EXECUTE without selection is blocked by hasMultiBookSelection guard.
        actor.send({ type: "EXECUTE" });
        expect(actor.getSnapshot().value).toBe("previewMultiBook");
        actor.stop();
    });

    it("SELECT_ALL_BOOKS restores full selection", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_COMPLETE",
            detected: multiBookDetected(["a", "b"]),
            duplicate: noDup(),
            tempRef: "imp-2",
        });
        actor.send({ type: "ADVANCE_FROM_SUMMARY" });
        actor.send({ type: "DESELECT_ALL_BOOKS" });
        actor.send({ type: "SELECT_ALL_BOOKS" });
        expect(
            actor.getSnapshot().context.multiBookSelection.selectedSourceIds,
        ).toEqual(["sha256:multi::a", "sha256:multi::b"]);
        actor.stop();
    });

    it("DETECTION_FAILED routes to error and stores cause", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_FAILED",
            error: {
                message: "boom",
                context: "detect",
                retryable: true,
            },
        });
        expect(actor.getSnapshot().value).toBe("error");
        expect(actor.getSnapshot().context.error?.message).toBe("boom");
        actor.stop();
    });

    it("RETRY from error with retryable goes back to detecting", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_FAILED",
            error: {
                message: "x",
                context: "detect",
                retryable: true,
            },
        });
        actor.send({ type: "RETRY" });
        expect(actor.getSnapshot().value).toBe("detecting");
        actor.stop();
    });

    it("EXECUTE_SUCCESS moves to success and stores ids", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_COMPLETE",
            detected: singleBookDetected(),
            duplicate: noDup(),
            tempRef: "imp-1",
        });
        actor.send({ type: "ADVANCE_FROM_SUMMARY" });
        actor.send({ type: "EXECUTE" });
        actor.send({
            type: "EXECUTE_SUCCESS",
            bookId: "abc",
            bookIds: ["abc"],
            title: "Solo",
        });
        expect(actor.getSnapshot().value).toBe("success");
        expect(actor.getSnapshot().context.bookId).toBe("abc");
        expect(actor.getSnapshot().context.importedBookIds).toEqual(["abc"]);
        actor.stop();
    });

    it("RESET from success returns to upload with cleared context", () => {
        const actor = createActor(wizardMachine).start();
        actor.send({ type: "SELECT_FILE", files: [new File([], "x")] });
        actor.send({
            type: "DETECTION_COMPLETE",
            detected: singleBookDetected(),
            duplicate: noDup(),
            tempRef: "imp-1",
        });
        actor.send({ type: "ADVANCE_FROM_SUMMARY" });
        actor.send({ type: "EXECUTE" });
        actor.send({
            type: "EXECUTE_SUCCESS",
            bookId: "abc",
            bookIds: ["abc"],
            title: "Solo",
        });
        actor.send({ type: "RESET" });
        expect(actor.getSnapshot().value).toBe("upload");
        expect(actor.getSnapshot().context.bookId).toBeNull();
        actor.stop();
    });
});
