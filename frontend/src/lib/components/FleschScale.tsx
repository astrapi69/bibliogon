/**
 * Flesch reading-ease benchmark scale (#285).
 *
 * App-agnostic: no app imports, no i18n hook. Labels are passed in (with
 * sensible English defaults) so the component can be reused anywhere. It
 * renders a four-band readability scale with a marker on the band the score
 * falls into, plus a genre-comparison line giving the score real-world
 * context.
 */

import styles from "./FleschScale.module.css";

/** The four readability bands, easiest first. */
export type FleschBand = "easy" | "readable" | "demanding" | "academic";

/** Genres with a typical Flesch reading-ease benchmark. */
export type FleschGenre = "fiction" | "nonfiction" | "scientific" | "children";

/** Typical Flesch reading-ease scores per genre (constants, not computed). */
export const GENRE_BENCHMARKS: Record<FleschGenre, number> = {
  fiction: 70,
  nonfiction: 55,
  scientific: 35,
  children: 85,
};

/** Fixed numeric band ranges shown under each band label. */
const BAND_RANGES: Record<FleschBand, string> = {
  easy: "80+",
  readable: "60-80",
  demanding: "40-60",
  academic: "<40",
};

const BAND_ORDER: FleschBand[] = ["easy", "readable", "demanding", "academic"];

/** Localizable labels (English defaults keep the component standalone). */
export interface FleschScaleLabels {
  bands: Record<FleschBand, string>;
  genres: Record<FleschGenre, string>;
  yourBook: string;
  comparison: string;
}

const DEFAULT_LABELS: FleschScaleLabels = {
  bands: {
    easy: "Easy",
    readable: "Readable",
    demanding: "Demanding",
    academic: "Academic",
  },
  genres: {
    fiction: "Fiction",
    nonfiction: "Non-fiction",
    scientific: "Scientific",
    children: "Children's book",
  },
  yourBook: "Your book",
  comparison: "Comparison",
};

/** Partial label override; any field falls back to the English default. */
export interface FleschScaleLabelsOverride {
  bands?: Partial<Record<FleschBand, string>>;
  genres?: Partial<Record<FleschGenre, string>>;
  yourBook?: string;
  comparison?: string;
}

interface FleschScaleProps {
  score: number;
  /** Optional genre to emphasize in the comparison line. */
  genre?: FleschGenre;
  labels?: FleschScaleLabelsOverride;
}

/** Determine the readability band for a Flesch reading-ease score. */
export function fleschBand(score: number): FleschBand {
  if (score >= 80) return "easy";
  if (score >= 60) return "readable";
  if (score >= 40) return "demanding";
  return "academic";
}

function mergeLabels(
  override?: FleschScaleLabelsOverride,
): FleschScaleLabels {
  return {
    bands: { ...DEFAULT_LABELS.bands, ...override?.bands },
    genres: { ...DEFAULT_LABELS.genres, ...override?.genres },
    yourBook: override?.yourBook ?? DEFAULT_LABELS.yourBook,
    comparison: override?.comparison ?? DEFAULT_LABELS.comparison,
  };
}

/** Render the four-band Flesch scale with a marker and genre comparison. */
export default function FleschScale({ score, genre, labels }: FleschScaleProps) {
  const merged = mergeLabels(labels);
  const activeBand = fleschBand(score);
  const activeIndex = BAND_ORDER.indexOf(activeBand);
  const markerLeft = ((activeIndex + 0.5) / BAND_ORDER.length) * 100;

  return (
    <div
      className={styles.scale}
      data-testid="flesch-scale"
      data-band={activeBand}
      role="img"
      aria-label={`${merged.yourBook}: ${score.toFixed(1)} — ${merged.bands[activeBand]}`}
    >
      <div className={styles.bands}>
        {BAND_ORDER.map((band) => (
          <div
            key={band}
            className={`${styles.band} ${styles[band]} ${
              band === activeBand ? styles.active : ""
            }`}
          >
            <span className={styles.bandLabel}>{merged.bands[band]}</span>
            <span className={styles.bandRange}>{BAND_RANGES[band]}</span>
          </div>
        ))}
      </div>
      <div className={styles.markerRow}>
        <span
          className={styles.marker}
          style={{ left: `${markerLeft}%` }}
          data-testid="flesch-marker"
        >
          ▲ {merged.yourBook}: {score.toFixed(1)}
        </span>
      </div>
      <p className={styles.comparison}>
        {merged.comparison}:{" "}
        {(["fiction", "nonfiction", "scientific", "children"] as FleschGenre[]).map(
          (g, i) => (
            <span
              key={g}
              className={g === genre ? styles.genreActive : undefined}
            >
              {i > 0 ? ", " : ""}
              {merged.genres[g]} ~{GENRE_BENCHMARKS[g]}
            </span>
          ),
        )}
      </p>
    </div>
  );
}
