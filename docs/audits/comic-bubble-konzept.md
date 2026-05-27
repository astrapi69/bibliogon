# Konzept: Comic-Sprechblasen in Bibliogon

## Ausgangslage

Bibliogon unterstützt 6 Bubble-Types im Comic-Editor. Aktuell werden Bubble-Body (CSS div) und Tail (SVG Polygon) als getrennte Elemente gerendert. Das erzeugt eine sichtbare Naht an der Verbindungsstelle. Ziel: jeder Bubble-Type wird als ein einheitlicher SVG-Shape gerendert, mit organischen Bezier-Kurven statt geraden Linien. Der Tail ist integraler Bestandteil der Form, nicht ein angeheftetes Dreieck.

## Technischer Ansatz: Single SVG Path (Approach A)

Jeder Bubble-Type wird als ein `<svg>` Element mit einem `<path>` gerendert. Der `d`-Attribut-String beschreibt die komplette Kontur: Bubble-Outline + Tail als eine geschlossene Form. Text wird als `<div>` mit `position: absolute` über dem SVG gelayert (kein `<foreignObject>`, das hat WeasyPrint-Probleme im PDF-Export).

```
┌──────────────────────────────────┐
│ <div style="position: relative"> │
│   <svg width="100%" height="100%"│  ← Bubble-Shape (fill + stroke)
│     <path d="..." />             │
│   </svg>                         │
│   <div class="bubble-text">     │  ← Text-Overlay (HTML, position: absolute)
│     Sprechblasen-Text            │
│   </div>                         │
│ </div>                           │
└──────────────────────────────────┘
```

Mirror-Disziplin: Der identische SVG-Path muss sowohl im Frontend (React-Komponente) als auch im Backend (Python PDF-Walker `_render_comic_bubble`) generiert werden. Beide nutzen die gleiche mathematische Path-Generierung mit denselben Parametern.

---

## Die 6 Bubble-Types im Detail

### 1. Speech (Sprechblase)

**Form:** Ellipse (abgerundetes Oval)
**Kontur:** `border-radius: 50%` Equivalent als SVG Ellipse via 4 kubische Bezier-Kurven
**Stroke:** 1.5px solid, Farbe aus `bubble_config.border_color` (default: schwarz)
**Fill:** `bubble_config.background_color` (default: weiss)
**Tail:** Organische Bezier-Kurve die nahtlos aus der Ellipsen-Kontur herausfliesst

```
         ╭──────────────────╮
        ╱                    ╲
       │    Hallo Welt!       │
        ╲                    ╱
         ╰──────────╮──────╯
                     ╲
                      ╲
                       ╰─ Tip (Bezier-Kurve, nicht gerade)
```

**SVG-Path-Strategie:**
- Ellipse als 4 kubische Bezier-Segmente (M → C → C → C → C)
- Am Tail-Ansatzpunkt: Path unterbricht die Ellipsen-Kontur
- Zwei Bezier-Kurven führen zur Spitze (S-Kurve: breit am Ansatz, spitz am Tip)
- Zurück zur Ellipsen-Kontur, nahtlos weiter

**Tail-Kurven (der Kern der natürlichen Optik):**
```
Ansatz links (auf Ellipse) ──╮
                               ╲  ← Kubische Bezier, Control-Points
                                ╲    erzeugen S-Kurve
                                 ╰── Tip (spitzer Punkt)
                                ╱
                               ╱  ← Kubische Bezier, gespiegelt
Ansatz rechts (auf Ellipse) ──╯
```

Die Control-Points der Bezier-Kurven bestimmen wie "bauchig" der Tail ist. Bei kurzen Tails (tail_length_px < 20): flache Kurve. Bei langen Tails: ausgeprägtere S-Kurve. Die Basis-Breite am Ansatzpunkt beträgt ca. 15-20% der Bubble-Breite.

---

### 2. Thought (Gedankenblase)

**Form:** Rounded Rectangle mit sehr grossen Radien (cloud-artig)
**Kontur:** Abgerundetes Rechteck, SVG `rx/ry` als Bezier-Approximation
**Stroke:** 1.5px solid
**Fill:** weiss (default)
**Tail:** KEINE Linie zur Spitze. Stattdessen: Kette aus 2-3 kleiner werdenden Kreisen/Ellipsen

```
         ╭──────────────────╮
        │                    │
        │   Hmm, ich denke   │
        │   dass...           │
        │                    │
         ╰──────────────────╯
              ○
            ○
          ○
```

**SVG-Strategie:**
- Hauptblase: Rounded-Rect als SVG Path (4 Geraden + 4 Bogen)
- Tail: 3 separate `<circle>` oder `<ellipse>` Elemente
- Kreise werden progressiv kleiner: 60% → 40% → 25% der Bubble-Höhe
- Abstand zwischen Kreisen: proportional zu `tail_length_px`
- Richtung: folgt `tail_direction` (8 Oktanten)
- Position entlang Kante: `tail_position_pct`

**Sizing der Thought-Bubbles:**
```
Kreis 1 (nah an Bubble):  Durchmesser = max(12px, bubble_height * 0.12)
Kreis 2 (mittel):         Durchmesser = Kreis_1 * 0.65
Kreis 3 (am Tip):         Durchmesser = Kreis_2 * 0.60
```

**Abstände:**
```
Bubble-Rand → Kreis 1:   tail_length_px * 0.25
Kreis 1 → Kreis 2:       tail_length_px * 0.35
Kreis 2 → Kreis 3:       tail_length_px * 0.40
```

Fill und Stroke der Kreise identisch mit der Hauptblase (gleiche background_color, gleicher border).

---

### 3. Narration (Erzählertext)

**Form:** Rechteck mit scharfen oder leicht gerundeten Ecken
**Kontur:** Gerade Kanten, optional 2-4px Radius
**Stroke:** 1.5px solid (default), oft dünner oder ganz ohne
**Fill:** `#f5f5dc` (Beige, default), signalisiert Erzähler-Stimme
**Tail:** Kein Tail. Narration-Boxen haben per Definition keinen Tail (der Erzähler "spricht" nicht aus einer Position heraus).

```
┌──────────────────────────┐
│  Der nächste Morgen       │
│  brachte keine Antworten. │
└──────────────────────────┘
```

**SVG-Strategie:**
- Einfachster Path: `M x,y L ... L ... L ... Z` (4 Linien)
- Optional: kleine `rx/ry` Radien für subtile Rundung
- `tail_direction: "none"` ist der Default und einzige sinnvolle Wert

---

### 4. Shout (Ausruf/Schrei)

**Form:** Stern/Zacken-Polygon (20 Vertices im aktuellen Code, alternierende innere/äussere Punkte)
**Kontur:** Gezackte Sternform, erzeugt visuellen "Explosions"-Effekt
**Stroke:** 2px solid (etwas dicker für visuelles Gewicht)
**Fill:** weiss oder gelb (default: weiss)
**Tail:** Einer der Zacken wird verlängert und zeigt zum Sprecher

```
        ╱╲    ╱╲
      ╱╱  ╲╱╱  ╲╲
     ╱╱  WHAM!   ╲╲
     ╲╲          ╱╱
      ╲╲  ╱╲  ╱╱
        ╲╱  ╲╱
             ╲
              ╲  ← Verlängerter Zacken
               ╲
```

**SVG-Strategie:**
- Stern-Polygon: 20 Punkte alternierend auf innerem und äusserem Radius
- Äusserer Radius: 50% der Bubble-Dimension
- Innerer Radius: 65-75% des äusseren Radius
- Tail-Integration: der Zacken der am nächsten zur `tail_direction` liegt, wird in der Länge auf `tail_length_px` verlängert
- Die beiden Nachbar-Punkte (innere Radius-Punkte) bilden die Tail-Basis
- Der verlängerte Zacken-Tip wird optional mit leichter Bezier-Kurve versehen (weniger spitz als die normalen Zacken)
- Keine separaten Tail-Elemente nötig, der Stern absorbiert den Tail in seine Form

**Zacken-Verlängerung:**
```
Normaler Zacken:    Tip auf outer_radius (z.B. 50px vom Zentrum)
Tail-Zacken:        Tip auf outer_radius + tail_length_px
Nachbar-Zacken:     Unverändert, bilden natürliche Basis
```

---

### 5. Whisper (Flüstern)

**Form:** Identisch mit Thought (Rounded Rectangle), aber mit gestrichelter Kontur
**Kontur:** Dashed/gestrichelt, signalisiert leise/geflüsterte Rede
**Stroke:** 1.5px dashed (stroke-dasharray in SVG)
**Fill:** weiss (default), leicht transparent (opacity: 0.9)
**Tail:** Wie Speech (Bezier-Kurve), aber ebenfalls gestrichelt

```
         ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
        ┊                      ┊
        ┊   (psst, komm her)   ┊
        ┊                      ┊
         ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
                  ┊
                   ┊
                    ┊
```

**SVG-Strategie:**
- Gleicher Path wie Speech (Ellipse oder Rounded-Rect mit Tail)
- `stroke-dasharray: "6 4"` (6px Strich, 4px Lücke)
- `stroke-linecap: round` für weichere Dash-Enden
- Fill mit reduzierter Opacity: `fill-opacity: 0.9`
- Tail nutzt denselben gestrichelten Stroke, Bezier-Kurven wie Speech

---

### 6. Sound Effect (Lautmalerei)

**Form:** Keine feste Form, nur Text. Oder optional: freie organische Kontur
**Kontur:** Keine (border: none)
**Stroke:** Kein Stroke
**Fill:** Transparent oder sehr subtil
**Tail:** Kein Tail (Soundeffekte schweben frei im Panel)
**Text-Styling:** Gross, fett, oft rotiert, Comic-Font

```

       B A M !

       * K R A C H *

```

**SVG-Strategie:**
- Minimal: nur der Text-Overlay-Div, kein SVG-Shape nötig
- Optional: SVG-Path als subtile Hintergrund-Form (z.B. leichte Wolke/Splash)
- `tail_direction` sollte immer `"none"` sein
- Haupt-Differenzierung über CSS: `font-size`, `font-weight`, `text-transform`, `letter-spacing`, optional `transform: rotate()`

---

## Tail-Positionierung (Gemeinsame Logik)

### Datenmodell (bestehendes Schema, kein Change)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `tail_direction` | String(8) Enum | N, NE, E, SE, S, SW, W, NW, none, auto |
| `tail_position_pct` | Integer 0-100 | Position entlang der Kante |
| `tail_length_px` | Integer 0-64 | Länge vom Ansatzpunkt zur Spitze |

### Direction → Kanten-Mapping

```
NW ──── N ──── NE
│                │
W      Bubble     E
│                │
SW ──── S ──── SE
```

| Direction | Primäre Kante | Sekundäre Kante (Diagonalen) |
|-----------|--------------|------------------------------|
| N | Oben | - |
| NE | Oben | Rechts (Ansatz näher an rechter Ecke) |
| E | Rechts | - |
| SE | Unten | Rechts (Ansatz näher an rechter Ecke) |
| S | Unten | - |
| SW | Unten | Links (Ansatz näher an linker Ecke) |
| W | Links | - |
| NW | Oben | Links (Ansatz näher an linker Ecke) |

### Drag-to-Position (bereits implementiert)

User draggt den Tail-Tip auf dem Canvas. Bei Pointer-Up:
1. Winkel vom Bubble-Zentrum zur neuen Tip-Position berechnen
2. Nächsten der 8 Oktanten bestimmen → `tail_direction`
3. Projektion auf die Kante → `tail_position_pct`
4. Distanz Kante → Tip → `tail_length_px`
5. API-Call mit den 3 abgeleiteten Werten

---

## Bezier-Kurven-Parameter für den Tail

### Speech + Whisper (organische S-Kurve)

```javascript
// Tail von der Bubble-Kante zur Spitze
// P0 = linker Ansatzpunkt auf Bubble-Kontur
// P3 = Tip (Spitze)
// P1, P2 = Control-Points für die S-Kurve

const baseWidth = Math.max(8, bubbleWidth * 0.15);  // Basis-Breite am Ansatz
const halfBase = baseWidth / 2;

// Linke Tail-Kante (P0 → Tip)
const cp1_distance = tailLength * 0.4;  // Control-Point 40% des Wegs
const cp1_spread = halfBase * 0.3;      // Leichte Auswölbung

// Rechte Tail-Kante (Tip → P3)
const cp2_distance = tailLength * 0.6;  // Control-Point 60% des Wegs
const cp2_spread = halfBase * 0.2;      // Weniger Auswölbung (verjüngt sich)
```

**Kurzes Tail (< 20px):** Flache Kurve, fast gerade, subtiler Übergang
**Mittleres Tail (20-40px):** Deutliche S-Kurve, klassisches Comic-Look
**Langes Tail (40-64px):** Ausgeprägte Kurve, dynamischer Look

### Thought (Kreis-Kette)

Keine Bezier-Kurven für den Tail. Stattdessen:

```javascript
const circles = [];
const count = tailLength > 30 ? 3 : tailLength > 15 ? 2 : 1;
let currentDiameter = Math.max(12, bubbleHeight * 0.12);

for (let i = 0; i < count; i++) {
  circles.push({
    cx: startX + directionVector.x * spacing * (i + 1),
    cy: startY + directionVector.y * spacing * (i + 1),
    r: currentDiameter / 2
  });
  currentDiameter *= 0.6;  // Jeder Kreis 60% des vorherigen
}
```

### Shout (verlängerter Zacken)

```javascript
// Finde den Zacken-Index der am nächsten zur tail_direction liegt
const closestSpike = findClosestSpikeToDirection(tail_direction, 20);

// Verlängere diesen einen Zacken
vertices[closestSpike].radius = outerRadius + tail_length_px;

// Optional: leichte Bezier-Kurve an der Spitze statt scharfem Punkt
// → macht den Shout-Tail etwas "weicher" als die anderen Zacken
```

---

## PDF-Export Mirror

Jeder SVG-Path der im Frontend generiert wird, muss identisch im Python PDF-Walker erzeugt werden. Die Path-Generierung wird in beiden Sprachen als Pure Function implementiert:

**TypeScript:** `generateBubblePath(type, width, height, tailDirection, tailPositionPct, tailLengthPx, borderRadius) → string`

**Python:** `generate_bubble_path(type, width, height, tail_direction, tail_position_pct, tail_length_px, border_radius) → str`

Beide Funktionen sind unit-testbar. Cross-Language-Konsistenz wird über Snapshot-Tests gesichert: gleiche Inputs → byte-identischer Path-String.

---

## Bubble-Config Overrides (bestehend)

Jeder Bubble-Type hat Defaults die der User per `bubble_config` überschreiben kann:

| Property | Default Speech | Default Thought | Default Narration | Default Shout | Default Whisper | Default Sound |
|----------|---------------|----------------|-------------------|--------------|----------------|--------------|
| background_color | #ffffff | #ffffff | #f5f5dc | #ffffff | #ffffff | transparent |
| border_color | #000000 | #000000 | #000000 | #000000 | #000000 | none |
| border_width | 1.5 | 1.5 | 1.5 | 2.0 | 1.5 | 0 |
| border_style | solid | solid | solid | solid | dashed | none |
| border_radius | 50% | 30% | 2px | n/a (star) | 30% | n/a |
| opacity | 1.0 | 1.0 | 1.0 | 1.0 | 0.9 | 0.0 |
| font_size | inherit | inherit | inherit | 120% | 90% | 150% |
| font_weight | normal | normal | normal | bold | normal | 900 |
| letter_spacing | normal | normal | normal | 0.05em | normal | 0.1em |

---

## Implementierungs-Reihenfolge (empfohlen)

### Phase 1: Speech (Referenz-Implementierung)
- `generateBubblePath()` für Ellipse + Bezier-Tail
- Ersetze div+SVG durch reines SVG+Text-Overlay
- Python Mirror
- Vitest + pytest Snapshot-Tests
- 3-4 Commits

### Phase 2: Thought (Kreis-Kette)
- Separate Rendering-Logik (Hauptblase + Kreise, kein zusammenhängender Path)
- Kreis-Sizing + Spacing-Algorithmus
- Python Mirror
- 2-3 Commits

### Phase 3: Narration + Sound Effect (trivial)
- Narration: einfaches Rect-Path
- Sound Effect: kein Shape (nur Text)
- 1 Commit zusammen

### Phase 4: Shout (Stern + verlängerter Zacken)
- Stern-Polygon-Generator mit variablem Zacken
- Tail als verlängerter Zacken
- 2-3 Commits

### Phase 5: Whisper (Dashed Speech)
- Kopiert Speech-Path, fügt stroke-dasharray hinzu
- Trivial nach Phase 1
- 1 Commit

### Phase 6: Axe-Core Violations + Cleanup
- aria-labels auf allen interaktiven Bubble-Elementen
- Contrast-Fixes
- Alte Approach-B-Reste entfernen
- 1-2 Commits

**Geschätzter Gesamt-Scope:** 12-16 Commits, 2-3 Sessions

---

## Zusammenfassung

| Bubble-Type | Form | Tail-Typ | SVG-Komplexität |
|-------------|------|----------|-----------------|
| Speech | Ellipse (Bezier) | Bezier S-Kurve | Hoch |
| Thought | Rounded-Rect | Kreis-Kette (2-3 Kreise) | Mittel |
| Narration | Rechteck | Kein Tail | Niedrig |
| Shout | 20-Zacken-Stern | Verlängerter Zacken | Hoch |
| Whisper | Ellipse (= Speech) | Bezier S-Kurve, dashed | Niedrig (nach Speech) |
| Sound Effect | Kein Shape | Kein Tail | Minimal |
