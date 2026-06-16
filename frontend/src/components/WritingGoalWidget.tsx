/** Daily writing-goal widget (WRITING-GOALS-PROGRESS-TRACKING-01).
 *
 *  The consumer of the WritingSession backend: shows today's net words
 *  written against a per-device daily goal, with a progress bar + a
 *  consecutive-day streak. The goal lives in localStorage (per-device,
 *  default 500); the per-day word history comes from
 *  GET /api/writing-sessions. Streak + today are computed here so the
 *  backend stays goal-agnostic. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flame, BarChart3 } from "lucide-react";

import { type WritingSession } from "../api/client";
import { getStorage } from "../storage";
import { useI18n } from "../hooks/useI18n";
import styles from "./WritingGoalWidget.module.css";

const GOAL_KEY = "bibliogon-daily-word-goal";
const DEFAULT_GOAL = 500;

function readGoal(): number {
  if (typeof window === "undefined") return DEFAULT_GOAL;
  const raw = localStorage.getItem(GOAL_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GOAL;
}

/** LOCAL calendar date as YYYY-MM-DD. Must be local (not UTC) to match
 *  the backend's ``date.today()`` so "today" agrees across server +
 *  client on the same machine. */
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return localIso(new Date());
}

function isoMinus(dayIso: string, n: number): string {
  const [y, m, dd] = dayIso.split("-").map(Number);
  const d = new Date(y, m - 1, dd); // local midnight
  d.setDate(d.getDate() - n);
  return localIso(d);
}

/** Consecutive days (ending today, or yesterday if today's goal isn't
 *  met yet) where words_written >= goal. Exported for unit testing. */
export function computeStreak(
  sessions: WritingSession[],
  goal: number,
): number {
  if (goal <= 0) return 0;
  const byDay = new Map(sessions.map((s) => [s.day, s.words_written]));
  const today = todayIso();
  // Today still in progress: if not yet met, start the run from
  // yesterday so an unfinished today doesn't zero the streak.
  let offset = (byDay.get(today) ?? 0) >= goal ? 0 : 1;
  let streak = 0;
  while ((byDay.get(isoMinus(today, offset)) ?? 0) >= goal) {
    streak++;
    offset++;
  }
  return streak;
}

export default function WritingGoalWidget() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<WritingSession[]>([]);
  const [goal, setGoal] = useState<number>(readGoal);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStorage()
      .writingSessions.list(60)
      .then((rows) => {
        if (!cancelled) {
          setSessions(rows);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render until loaded, to avoid a flash of "0 words".
  if (!loaded) return null;
  // The widget belongs to the writing context: hide it for users who
  // have never written (no writing sessions). A "0 / 500" goal on a
  // fresh account is noise (#342).
  if (sessions.length === 0) return null;

  const today = todayIso();
  const todayWords = sessions.find((s) => s.day === today)?.words_written ?? 0;
  const streak = computeStreak(sessions, goal);
  const pct = goal > 0 ? Math.min(100, (todayWords / goal) * 100) : 0;
  const done = todayWords >= goal;

  return (
    <div className={styles.widget} data-testid="writing-goal-widget">
      <span className={styles.today} data-testid="writing-goal-today">
        {t("ui.writing_goal.today", "Today")}: {todayWords} / {goal}{" "}
        {t("ui.editor.words", "words")}
      </span>
      <div className={styles.bar} aria-hidden>
        <div
          className={`${styles.barFill} ${done ? styles.barFillDone : styles.barFillProgress}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {streak > 0 && (
        <span className={styles.streak} data-testid="writing-goal-streak">
          <Flame size={14} aria-hidden />{" "}
          {t("ui.writing_goal.streak", "{n}-day streak").replace(
            "{n}",
            String(streak),
          )}
        </span>
      )}
      <span className={styles.goalEdit}>
        {t("ui.writing_goal.daily_goal", "Daily goal")}:
        <input
          type="number"
          min={0}
          id="writing-goal-daily-target"
          name="writing-goal-daily-target"
          className={`input ${styles.goalInput}`}
          defaultValue={goal}
          aria-label={t("ui.writing_goal.daily_goal", "Daily goal")}
          data-testid="writing-goal-input"
          onBlur={(e) => {
            const n = parseInt(e.target.value, 10);
            const next = Number.isFinite(n) && n > 0 ? n : DEFAULT_GOAL;
            setGoal(next);
            localStorage.setItem(GOAL_KEY, String(next));
          }}
        />
      </span>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => navigate("/writing-history")}
        data-testid="writing-goal-history-open"
      >
        <BarChart3 size={14} aria-hidden />{" "}
        {t("ui.writing_stats.open", "Verlauf")}
      </button>
    </div>
  );
}
