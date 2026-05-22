/**
 * Actor-level tests for ``kdpWizardMachine``.
 *
 * Follows the canonical
 * ``frontend/src/components/import-wizard/machines/wizardMachine.test.ts``
 * shape: ``createActor(...).start()`` + direct event dispatch +
 * ``actor.getSnapshot()`` assertions. No DOM, no fake timers.
 *
 * C2 scope: 14 cases covering the 7-state visible Phase 1 subset
 * (metadata + metadataError + cover + export + exporting +
 * exportSuccess + exportError). C8 / C10 re-add pricing + arc
 * tests when those states return to the machine.
 */

import { describe, it, expect } from "vitest";
import { createActor } from "xstate";

import { kdpWizardMachine } from "./kdpWizardMachine";
import type {
    KdpWizardError,
    ValidationIssue,
    ImageDimensions,
} from "./types";
import type {
    KdpMetadataCheckResult,
    KdpMetadataIssue,
} from "../../../api/client";

function passingMetadataResult(): KdpMetadataCheckResult {
    return {
        complete: true,
        error_count: 0,
        warning_count: 0,
        issues: [],
    };
}

function passingMetadataIssues(): KdpMetadataIssue[] {
    return [];
}

function failingMetadataIssues(): KdpMetadataIssue[] {
    return [
        { field: "title", message: "Title required", severity: "error" },
    ];
}

function retryableError(context: KdpWizardError["context"]): KdpWizardError {
    return {
        message: "transient",
        context,
        retryable: true,
    };
}

function validCoverDim(): ImageDimensions {
    return { width: 1600, height: 2560 };
}

function passingCoverIssues(): ValidationIssue[] {
    return [];
}

function failingCoverIssues(): ValidationIssue[] {
    return [
        {
            field: "dimensions",
            severity: "error",
            message: "Cover too small",
        },
    ];
}

describe("kdpWizardMachine", () => {
    it("starts in metadata state", () => {
        const actor = createActor(kdpWizardMachine).start();
        expect(actor.getSnapshot().value).toBe("metadata");
        actor.stop();
    });

    it("ADVANCE from metadata blocked before METADATA_LOADED dispatches", () => {
        // Sentinel: ``metadataResult !== null`` means "load
        // completed". Fresh actor has metadataResult=null →
        // canAdvanceFromMetadata returns false. C1's original
        // design (checking only the issuesFiltered array) had
        // this hole.
        const actor = createActor(kdpWizardMachine).start();
        actor.send({ type: "ADVANCE" });
        expect(actor.getSnapshot().value).toBe("metadata");
        actor.stop();
    });

    it("METADATA_LOADED stores result and filtered issues", () => {
        const actor = createActor(kdpWizardMachine).start();
        const result = passingMetadataResult();
        actor.send({
            type: "METADATA_LOADED",
            result,
            issuesFiltered: passingMetadataIssues(),
        });
        const ctx = actor.getSnapshot().context;
        expect(ctx.metadataResult).toBe(result);
        expect(ctx.metadataIssuesFiltered).toEqual([]);
        expect(actor.getSnapshot().value).toBe("metadata");
        actor.stop();
    });

    it("METADATA_FAILED transitions to metadataError and stores error", () => {
        const actor = createActor(kdpWizardMachine).start();
        const error = retryableError("metadata");
        actor.send({ type: "METADATA_FAILED", error });
        expect(actor.getSnapshot().value).toBe("metadataError");
        expect(actor.getSnapshot().context.error).toBe(error);
        actor.stop();
    });

    it("RETRY from metadataError returns to metadata when retryable", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_FAILED",
            error: retryableError("metadata"),
        });
        actor.send({ type: "RETRY" });
        expect(actor.getSnapshot().value).toBe("metadata");
        expect(actor.getSnapshot().context.error).toBeNull();
        actor.stop();
    });

    it("ADVANCE from metadata blocked when issues contain an error", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_LOADED",
            result: passingMetadataResult(),
            issuesFiltered: failingMetadataIssues(),
        });
        actor.send({ type: "ADVANCE" });
        expect(actor.getSnapshot().value).toBe("metadata");
        actor.stop();
    });

    it("ADVANCE from metadata transitions to cover when no errors", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_LOADED",
            result: passingMetadataResult(),
            issuesFiltered: passingMetadataIssues(),
        });
        actor.send({ type: "ADVANCE" });
        expect(actor.getSnapshot().value).toBe("cover");
        actor.stop();
    });

    it("COVER_VALIDATED stores dimensions and issues", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_LOADED",
            result: passingMetadataResult(),
            issuesFiltered: passingMetadataIssues(),
        });
        actor.send({ type: "ADVANCE" });
        const dim = validCoverDim();
        const issues = passingCoverIssues();
        actor.send({ type: "COVER_VALIDATED", dim, issues });
        const ctx = actor.getSnapshot().context;
        expect(ctx.coverDimensions).toEqual(dim);
        expect(ctx.coverIssues).toEqual(issues);
        actor.stop();
    });

    it("ADVANCE from cover blocked when cover issues contain an error", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_LOADED",
            result: passingMetadataResult(),
            issuesFiltered: passingMetadataIssues(),
        });
        actor.send({ type: "ADVANCE" });
        actor.send({
            type: "COVER_VALIDATED",
            dim: validCoverDim(),
            issues: failingCoverIssues(),
        });
        actor.send({ type: "ADVANCE" });
        expect(actor.getSnapshot().value).toBe("cover");
        actor.stop();
    });

    it("ADVANCE from cover transitions to export when no error issues (C2 direct path)", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_LOADED",
            result: passingMetadataResult(),
            issuesFiltered: passingMetadataIssues(),
        });
        actor.send({ type: "ADVANCE" });
        actor.send({
            type: "COVER_VALIDATED",
            dim: validCoverDim(),
            issues: passingCoverIssues(),
        });
        actor.send({ type: "ADVANCE" });
        expect(actor.getSnapshot().value).toBe("export");
        actor.stop();
    });

    it("BACK from cover returns to metadata", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_LOADED",
            result: passingMetadataResult(),
            issuesFiltered: passingMetadataIssues(),
        });
        actor.send({ type: "ADVANCE" });
        actor.send({ type: "BACK" });
        expect(actor.getSnapshot().value).toBe("metadata");
        actor.stop();
    });

    it("GENERATE from export transitions to exporting", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_LOADED",
            result: passingMetadataResult(),
            issuesFiltered: passingMetadataIssues(),
        });
        actor.send({ type: "ADVANCE" });
        actor.send({
            type: "COVER_VALIDATED",
            dim: validCoverDim(),
            issues: passingCoverIssues(),
        });
        actor.send({ type: "ADVANCE" });
        actor.send({ type: "GENERATE" });
        expect(actor.getSnapshot().value).toBe("exporting");
        actor.stop();
    });

    it("EXPORT_SUCCESS transitions to exportSuccess and stores filename", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_LOADED",
            result: passingMetadataResult(),
            issuesFiltered: passingMetadataIssues(),
        });
        actor.send({ type: "ADVANCE" });
        actor.send({
            type: "COVER_VALIDATED",
            dim: validCoverDim(),
            issues: passingCoverIssues(),
        });
        actor.send({ type: "ADVANCE" });
        actor.send({ type: "GENERATE" });
        actor.send({
            type: "EXPORT_SUCCESS",
            filename: "book-kdp-package.zip",
            blobUrl: "blob:http://localhost/abc-123",
        });
        const snap = actor.getSnapshot();
        expect(snap.value).toBe("exportSuccess");
        expect(snap.context.exportFilename).toBe("book-kdp-package.zip");
        expect(snap.context.exportBlobUrl).toBe(
            "blob:http://localhost/abc-123",
        );
        actor.stop();
    });

    it("CANCEL from cover resets context and returns to metadata", () => {
        const actor = createActor(kdpWizardMachine).start();
        actor.send({
            type: "METADATA_LOADED",
            result: passingMetadataResult(),
            issuesFiltered: passingMetadataIssues(),
        });
        actor.send({ type: "ADVANCE" });
        actor.send({
            type: "COVER_VALIDATED",
            dim: validCoverDim(),
            issues: passingCoverIssues(),
        });
        actor.send({ type: "CANCEL" });
        const snap = actor.getSnapshot();
        expect(snap.value).toBe("metadata");
        expect(snap.context.metadataResult).toBeNull();
        expect(snap.context.coverDimensions).toBeNull();
        actor.stop();
    });
});
