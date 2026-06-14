import React, { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  BookmarkPlus,
  GitBranch,
  BookOpen,
  LayoutGrid,
  Table,
  Network,
  ListChecks,
} from "lucide-react";
import type { Chapter } from "../../api/client";
import { SIDEBAR_MENU_BREAKPOINT_PX } from "../../hooks/useSidebarCollapse";
import Tooltip from "../Tooltip";

/**
 * Collapsible "Werkzeuge" (tools) button cluster in the chapter
 * sidebar footer: Storyboard, Outliner, Story-Bible, relationship
 * graph, the offline slot, Git-Sicherung, Sync zum Repo, TOC-Prüfen,
 * and Save-as-template.
 *
 * Extracted from `ChapterSidebar.tsx` (god-file burn-down). Owns only
 * the open/close state (with the viewport-responsive default + the
 * `localStorage` persistence). Every button is rendered from a prop +
 * callback; the parent keeps all the application state. All
 * `data-testid`s and i18n keys are byte-identical to the inline version.
 */
export default function SidebarToolsGroup({
  chapters,
  onShowStoryboard,
  storyboardActive,
  onShowOutline,
  outlineActive,
  onStoryBible,
  storyBibleActive,
  onShowRelationships,
  relationshipsActive,
  offlineSlot,
  onGitBackup,
  gitSyncState,
  onGitSync,
  gitSyncMapped,
  hasToc,
  onValidateToc,
  onSaveAsTemplate,
  t,
}: {
  chapters: Chapter[];
  onShowStoryboard?: () => void;
  storyboardActive?: boolean;
  onShowOutline?: () => void;
  outlineActive?: boolean;
  onStoryBible?: () => void;
  storyBibleActive?: boolean;
  onShowRelationships?: () => void;
  relationshipsActive?: boolean;
  offlineSlot?: React.ReactNode;
  onGitBackup?: () => void;
  gitSyncState?: string | null;
  onGitSync?: () => void;
  gitSyncMapped?: boolean;
  hasToc: boolean;
  onValidateToc?: () => void;
  onSaveAsTemplate?: () => void;
  t: (key: string, fallback: string) => string;
}) {
  // The secondary book-tool buttons (Storyboard, Story Bible, Git, ...) live
  // in a Collapsible so they don't squeeze the chapter list on short
  // viewports. An explicit user toggle persists across sessions; with no
  // stored preference the default is viewport-responsive — expanded on
  // desktop (room for both), collapsed on narrow viewports (the chapter
  // list needs the space).
  const [toolsOpen, setToolsOpen] = useState(() => {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("bibliogon.sidebar_tools_open");
      if (stored === "1") return true;
      if (stored === "0") return false;
    }
    return (
      typeof window !== "undefined" &&
      window.innerWidth >= SIDEBAR_MENU_BREAKPOINT_PX
    );
  });

  return (
    <Collapsible.Root
      open={toolsOpen}
      onOpenChange={(open) => {
        setToolsOpen(open);
        try {
          localStorage.setItem("bibliogon.sidebar_tools_open", open ? "1" : "0");
        } catch {
          /* private mode / no storage - non-critical */
        }
      }}
    >
      <Collapsible.Trigger asChild>
        <button
          className="btn-sidebar-block"
          style={{ marginBottom: 6, justifyContent: "space-between" }}
          data-testid="chapter-sidebar-tools-toggle"
          aria-label={t("ui.sidebar.tools", "Werkzeuge")}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Wrench size={14} /> {t("ui.sidebar.tools", "Werkzeuge")}
          </span>
          {toolsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        {onShowStoryboard && (
          <button
            className={`btn-sidebar-block ${storyboardActive ? "is-active" : ""}`}
            style={{ marginBottom: 6 }}
            onClick={onShowStoryboard}
            data-testid="chapter-sidebar-storyboard"
            title={t("ui.storyboard.open", "Storyboard öffnen")}
          >
            <LayoutGrid size={14} /> {t("ui.storyboard.title", "Storyboard")}
          </button>
        )}
        {onShowOutline && (
          <button
            className={`btn-sidebar-block ${outlineActive ? "is-active" : ""}`}
            style={{ marginBottom: 6 }}
            onClick={onShowOutline}
            data-testid="chapter-sidebar-outline"
            title={t("ui.outliner.open", "Outliner öffnen")}
          >
            <Table size={14} /> {t("ui.outliner.title", "Outliner")}
          </button>
        )}
        {onStoryBible && (
          <button
            className={`btn-sidebar-block ${storyBibleActive ? "is-active" : ""}`}
            style={{ marginBottom: 6 }}
            onClick={onStoryBible}
            data-testid="story-bible-toggle"
            title={t("ui.story_bible.open", "Story-Bibel öffnen")}
          >
            <BookOpen size={14} />{" "}
            {t("ui.story_bible.sidebar_button", "Story-Bibel")}
          </button>
        )}
        {onShowRelationships && (
          <button
            className={`btn-sidebar-block ${relationshipsActive ? "is-active" : ""}`}
            style={{ marginBottom: 6 }}
            onClick={onShowRelationships}
            data-testid="chapter-sidebar-relationships"
            title={t("ui.relationship_graph.open", "Beziehungsgraph öffnen")}
          >
            <Network size={14} />{" "}
            {t("ui.relationship_graph.title", "Beziehungsgraph")}
          </button>
        )}
        {offlineSlot}
        {onGitBackup && (
          <button
            className="btn-sidebar-block"
            style={{ marginBottom: 6, position: "relative" }}
            onClick={onGitBackup}
            data-testid="sidebar-git-backup"
            data-git-sync-state={gitSyncState ?? ""}
            title={gitSyncStateLabel(gitSyncState, t)}
          >
            <GitBranch size={14} /> {t("ui.sidebar.git_backup", "Git-Sicherung")}
            {gitSyncState &&
              ["remote_ahead", "diverged"].includes(gitSyncState) && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--accent)",
                  }}
                  data-testid="sidebar-git-sync-dot"
                />
              )}
          </button>
        )}
        {gitSyncMapped && onGitSync && (
          <button
            className="btn-sidebar-block"
            style={{ marginBottom: 6 }}
            onClick={onGitSync}
            data-testid="sidebar-git-sync"
            title={t(
              "ui.git_sync.sidebar_tooltip",
              "Buchstand in das verbundene Git-Repository commiten",
            )}
          >
            <GitBranch size={14} /> {t("ui.sidebar.git_sync", "Sync zum Repo")}
          </button>
        )}
        {hasToc && onValidateToc && (
          <button
            className="btn-sidebar-block"
            style={{ marginBottom: 6 }}
            onClick={onValidateToc}
          >
            <ListChecks size={14} /> {t("ui.sidebar.toc_validate", "TOC prüfen")}
          </button>
        )}
        {onSaveAsTemplate && (
          <Tooltip
            content={
              chapters.length === 0
                ? t(
                    "ui.sidebar.save_template_disabled",
                    "Erstelle zuerst ein Kapitel",
                  )
                : t(
                    "ui.sidebar.save_template_tooltip",
                    "Buchstruktur als wiederverwendbare Vorlage speichern",
                  )
            }
          >
            <button
              className="btn-sidebar-block"
              style={{ marginBottom: 6 }}
              onClick={onSaveAsTemplate}
              disabled={chapters.length === 0}
              data-testid="sidebar-save-as-template"
            >
              <BookmarkPlus size={14} />{" "}
              {t("ui.sidebar.save_as_template", "Als Vorlage speichern")}
            </button>
          </Tooltip>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function gitSyncStateLabel(
  state: string | null | undefined,
  t: (key: string, fallback: string) => string,
): string {
  switch (state) {
    case "in_sync":
      return t("ui.git.in_sync", "synchron");
    case "local_ahead":
      return t("ui.git.local_ahead", "lokal vorne");
    case "remote_ahead":
      return t("ui.git.remote_ahead", "Remote hat Änderungen");
    case "diverged":
      return t("ui.git.diverged_short", "divergiert");
    case "never_synced":
      return t("ui.git.never_synced", "noch nicht synchronisiert");
    default:
      return t("ui.sidebar.git_backup", "Git-Sicherung");
  }
}
