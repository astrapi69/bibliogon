/**
 * Themed audiobook player with full playback controls.
 *
 * Renders as a sticky bottom bar inside the audiobook metadata tab.
 * Owns a hidden `<audio>` element and exposes play/pause, seek,
 * volume, speed, skip +/-15s, auto-advance, keyboard shortcuts.
 *
 * All UI text flows through i18n. All colors use CSS variables so
 * the player respects the active theme (3 themes x light/dark).
 */

import {useCallback, useEffect, useRef, useState} from "react"
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  X, ChevronRight,
} from "lucide-react"
import * as Slider from "@radix-ui/react-slider"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Tooltip from "@radix-ui/react-tooltip"
import {useI18n} from "../hooks/useI18n"

// --- Types ---

export interface PlayerChapter {
  title: string
  url: string
  position: number
}

interface Props {
  chapters: PlayerChapter[]
  currentIndex: number
  bookTitle: string
  onChapterChange: (index: number) => void
  onClose: () => void
}

// --- Constants ---

const SKIP_SECONDS = 15
const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0]
const AUTO_ADVANCE_KEY = "bibliogon.player.autoAdvance"

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// --- Component ---

export default function AudiobookPlayer({chapters, currentIndex, bookTitle, onChapterChange, onClose}: Props) {
  const {t} = useI18n()
  const audioRef = useRef<HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(1.0)
  const [autoAdvance, setAutoAdvance] = useState(() => {
    try { return localStorage.getItem(AUTO_ADVANCE_KEY) !== "false" } catch { return true }
  })

  const chapter = chapters[currentIndex]
  const hasNext = currentIndex < chapters.length - 1
  const hasPrev = currentIndex > 0

  // --- Audio element sync ---

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.src = chapter?.url || ""
    el.load()
    setCurrentTime(0)
    setDuration(0)
    // Auto-play when chapter changes (user clicked play or auto-advanced)
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [chapter?.url])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = muted ? 0 : volume
  }, [volume, muted])

  useEffect(() => {
    try { localStorage.setItem(AUTO_ADVANCE_KEY, String(autoAdvance)) } catch { /* ignore */ }
  }, [autoAdvance])

  // Time update listener
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => setCurrentTime(el.currentTime)
    const onDur = () => setDuration(el.duration || 0)
    const onEnded = () => {
      setPlaying(false)
      if (autoAdvance && hasNext) {
        onChapterChange(currentIndex + 1)
      }
    }
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    el.addEventListener("timeupdate", onTime)
    el.addEventListener("durationchange", onDur)
    el.addEventListener("loadedmetadata", onDur)
    el.addEventListener("ended", onEnded)
    el.addEventListener("pause", onPause)
    el.addEventListener("play", onPlay)
    return () => {
      el.removeEventListener("timeupdate", onTime)
      el.removeEventListener("durationchange", onDur)
      el.removeEventListener("loadedmetadata", onDur)
      el.removeEventListener("ended", onEnded)
      el.removeEventListener("pause", onPause)
      el.removeEventListener("play", onPlay)
    }
  }, [autoAdvance, hasNext, currentIndex, onChapterChange])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const el = audioRef.current
      if (el) { el.pause(); el.src = "" }
    }
  }, [])

  // --- Controls ---

  const togglePlay = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause() } else { el.play().catch(() => {}) }
  }, [playing])

  const seek = useCallback((value: number[]) => {
    const el = audioRef.current
    if (!el || !isFinite(duration)) return
    el.currentTime = value[0]
    setCurrentTime(value[0])
  }, [duration])

  const skip = useCallback((delta: number) => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(el.currentTime + delta, duration))
  }, [duration])

  const handleClose = useCallback(() => {
    const el = audioRef.current
    if (el) { el.pause(); el.src = "" }
    setPlaying(false)
    onClose()
  }, [onClose])

  // --- Keyboard shortcuts ---

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle when the player container or its children are focused
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== containerRef.current) return

      switch (e.key) {
        case " ":
          e.preventDefault()
          togglePlay()
          break
        case "ArrowLeft":
          e.preventDefault()
          skip(-SKIP_SECONDS)
          break
        case "ArrowRight":
          e.preventDefault()
          skip(SKIP_SECONDS)
          break
        case "ArrowUp":
          e.preventDefault()
          setVolume((v) => Math.min(1, v + 0.1))
          setMuted(false)
          break
        case "ArrowDown":
          e.preventDefault()
          setVolume((v) => Math.max(0, v - 0.1))
          break
        case "Escape":
          e.preventDefault()
          handleClose()
          break
        default:
          // 0-9: jump to percentage
          if (/^[0-9]$/.test(e.key) && duration > 0) {
            e.preventDefault()
            const pct = parseInt(e.key) / 10
            const el = audioRef.current
            if (el) { el.currentTime = pct * duration }
          }
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [togglePlay, skip, handleClose, duration])

  if (!chapter) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="audiobook-player"
      tabIndex={0}
      role="region"
      aria-label={t("ui.audiobook.player.label", "Audiobook-Player")}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="auto"/>

      {/* Progress bar - full width at the top of the bar */}
      <div className="audiobook-player__progress">
        <Slider.Root
          className="audiobook-slider"
          value={[currentTime]}
          min={0}
          max={duration || 1}
          step={0.5}
          onValueChange={seek}
          aria-label={t("ui.audiobook.player.seek", "Seek")}
        >
          <Slider.Track className="audiobook-slider__track">
            <Slider.Range className="audiobook-slider__range"/>
          </Slider.Track>
          <Slider.Thumb className="audiobook-slider__thumb"/>
        </Slider.Root>
      </div>

      {/* Controls row */}
      <div className="audiobook-player__controls">
        {/* Chapter info */}
        <div className="audiobook-player__info">
          <span className="audiobook-player__title">{chapter.title}</span>
          <span className="audiobook-player__meta">
            {t("ui.audiobook.player.chapter_of", "{current} von {total}")
              .replace("{current}", String(currentIndex + 1))
              .replace("{total}", String(chapters.length))}
            {bookTitle && ` \u00b7 ${bookTitle}`}
          </span>
        </div>

        {/* Playback buttons */}
        <div className="audiobook-player__buttons">
          <Tip label={t("ui.audiobook.player.prev", "Vorheriges Kapitel")}>
            <button
              className="btn-icon"
              onClick={() => hasPrev && onChapterChange(currentIndex - 1)}
              disabled={!hasPrev}
              aria-label={t("ui.audiobook.player.prev", "Vorheriges Kapitel")}
            >
              <SkipBack size={16}/>
            </button>
          </Tip>

          <Tip label={`-${SKIP_SECONDS}s`}>
            <button className="btn-icon" onClick={() => skip(-SKIP_SECONDS)} aria-label={`Skip back ${SKIP_SECONDS}s`}>
              <SkipBack size={14} style={{opacity: 0.7}}/>
              <span style={{fontSize: "0.5625rem", position: "absolute", bottom: 0, right: 0}}>{SKIP_SECONDS}</span>
            </button>
          </Tip>

          <button
            className="audiobook-player__play-btn"
            onClick={togglePlay}
            aria-label={playing ? t("ui.audiobook.player.pause", "Pause") : t("ui.audiobook.player.play", "Abspielen")}
          >
            {playing ? <Pause size={20}/> : <Play size={20} style={{marginLeft: 2}}/>}
          </button>

          <Tip label={`+${SKIP_SECONDS}s`}>
            <button className="btn-icon" onClick={() => skip(SKIP_SECONDS)} aria-label={`Skip forward ${SKIP_SECONDS}s`}>
              <SkipForward size={14} style={{opacity: 0.7}}/>
              <span style={{fontSize: "0.5625rem", position: "absolute", bottom: 0, right: 0}}>{SKIP_SECONDS}</span>
            </button>
          </Tip>

          <Tip label={t("ui.audiobook.player.next", "Nächstes Kapitel")}>
            <button
              className="btn-icon"
              onClick={() => hasNext && onChapterChange(currentIndex + 1)}
              disabled={!hasNext}
              aria-label={t("ui.audiobook.player.next", "Nächstes Kapitel")}
            >
              <SkipForward size={16}/>
            </button>
          </Tip>
        </div>

        {/* Time display */}
        <span className="audiobook-player__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Speed picker */}
        <DropdownMenu.Root>
          <Tip label={t("ui.audiobook.player.speed", "Geschwindigkeit")}>
            <DropdownMenu.Trigger asChild>
              <button className="audiobook-player__speed-btn">
                {speed}x
              </button>
            </DropdownMenu.Trigger>
          </Tip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="dropdown-content" sideOffset={5} align="center">
              {SPEED_OPTIONS.map((s) => (
                <DropdownMenu.Item
                  key={s}
                  className={`dropdown-item${s === speed ? " dropdown-item--active" : ""}`}
                  onSelect={() => setSpeed(s)}
                >
                  {s}x
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Volume */}
        <div className="audiobook-player__volume">
          <Tip label={muted ? t("ui.audiobook.player.unmute", "Ton ein") : t("ui.audiobook.player.mute", "Ton aus")}>
            <button className="btn-icon" onClick={() => setMuted((m) => !m)}>
              {muted || volume === 0 ? <VolumeX size={14}/> : <Volume2 size={14}/>}
            </button>
          </Tip>
          <Slider.Root
            className="audiobook-slider audiobook-slider--volume"
            value={[muted ? 0 : volume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={(v) => { setVolume(v[0]); setMuted(false) }}
            aria-label={t("ui.audiobook.player.volume", "Lautstärke")}
          >
            <Slider.Track className="audiobook-slider__track">
              <Slider.Range className="audiobook-slider__range"/>
            </Slider.Track>
            <Slider.Thumb className="audiobook-slider__thumb audiobook-slider__thumb--sm"/>
          </Slider.Root>
        </div>

        {/* Auto-advance toggle */}
        <Tip label={autoAdvance
          ? t("ui.audiobook.player.auto_advance_on", "Automatisch weiter (an)")
          : t("ui.audiobook.player.auto_advance_off", "Automatisch weiter (aus)")
        }>
          <button
            className={`btn-icon audiobook-player__toggle${autoAdvance ? " audiobook-player__toggle--active" : ""}`}
            onClick={() => setAutoAdvance((a) => !a)}
          >
            <ChevronRight size={14}/>
          </button>
        </Tip>

        {/* Close */}
        <Tip label={t("ui.audiobook.player.close", "Player schließen")}>
          <button className="btn-icon" onClick={handleClose} aria-label={t("ui.audiobook.player.close", "Player schließen")}>
            <X size={14}/>
          </button>
        </Tip>
      </div>
    </div>
  )
}

/** Tiny tooltip wrapper to avoid repetition. */
function Tip({label, children}: {label: string; children: React.ReactElement}) {
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip-content" sideOffset={5}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
