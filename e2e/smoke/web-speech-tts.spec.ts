/**
 * Smoke test for the browser-native read-aloud (Web Speech API) feature.
 *
 * Covers the happy path the Vitest pins cannot reach in a real browser:
 * the floating speaker button is present in the editor, starting playback
 * swaps it for the mini-player (play/pause + stop + speed slider), and
 * stopping returns to the floating button.
 *
 * `speechSynthesis` is stubbed via `addInitScript` so the spec is
 * deterministic across CI runners (real voices + audio output differ by
 * machine and would make this flaky). The stub records the spoken text +
 * rate so the assertions verify the wiring, not the audio.
 *
 * CC writes the spec; Aster runs it (Pre-Release Gate).
 */

import {test, expect, createBook, createChapter} from "../fixtures/base";

function body(text: string): string {
    return JSON.stringify({
        type: "doc",
        content: [{type: "paragraph", content: [{type: "text", text}]}],
    });
}

const WIDE = {width: 1440, height: 900};

test.describe("Web Speech read-aloud", () => {
    test.beforeEach(async ({page}) => {
        // Deterministic speechSynthesis stub for every page in the context.
        await page.addInitScript(() => {
            class FakeUtterance {
                text: string;
                rate = 1;
                lang = "";
                voice: unknown = null;
                onend: (() => void) | null = null;
                onerror: (() => void) | null = null;
                onboundary: (() => void) | null = null;
                constructor(text: string) {
                    this.text = text;
                }
            }
            const spoken: FakeUtterance[] = [];
            // @ts-expect-error - test stub
            window.__ttsSpoken = spoken;
            // Chromium exposes `speechSynthesis` as a READONLY accessor on
            // window: a plain `window.speechSynthesis = {...}` assignment
            // silently no-ops (non-strict), leaving the REAL synthesis in
            // place - which then throws a sync TypeError when handed our
            // FakeUtterance, before the hook ever sets status "playing".
            // That made this spec red on every run since it landed (#711).
            // defineProperty replaces the accessor for real.
            Object.defineProperty(window, "SpeechSynthesisUtterance", {
                value: FakeUtterance,
                configurable: true,
            });
            Object.defineProperty(window, "speechSynthesis", {
                configurable: true,
                value: {
                    speak: (u: FakeUtterance) => spoken.push(u),
                    cancel: () => {},
                    pause: () => {},
                    resume: () => {},
                    getVoices: () => [],
                    addEventListener: () => {},
                    removeEventListener: () => {},
                },
            });
        });
    });

    test("floating button starts playback and shows the mini-player", async ({page}) => {
        const book = await createBook("Read Aloud");
        const chapter = await createChapter(book.id, "Kapitel Eins", body("VORLESETEXT"));

        await page.setViewportSize(WIDE);
        await page.goto(`/book/${book.id}?chapter=${chapter.id}`);

        const button = page.getByTestId("web-speech-tts-button");
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();

        // Wait for the chapter content to reach the TipTap editor BEFORE
        // clicking: getText() feeds speak(), and speak("") is a silent
        // no-op (status stays idle, the mini-player never mounts). The
        // button is visible + enabled from first mount, so without this
        // wait the click races the content fetch - a race CI always lost
        // (red every nightly since the spec landed, #711).
        await expect(page.locator(".ProseMirror")).toContainText("VORLESETEXT");

        await button.click();

        // Mini-player replaces the floating button while speaking.
        await expect(page.getByTestId("web-speech-tts-player")).toBeVisible();
        await expect(page.getByTestId("web-speech-tts-play-pause")).toBeVisible();
        await expect(page.getByTestId("web-speech-tts-stop")).toBeVisible();
        await expect(page.getByTestId("web-speech-tts-button")).toHaveCount(0);

        // The stub recorded the spoken chapter text.
        const spokenText = await page.evaluate(
            // @ts-expect-error - test stub
            () => window.__ttsSpoken?.[0]?.text as string,
        );
        expect(spokenText).toContain("VORLESETEXT");

        // Stop returns to the floating button.
        await page.getByTestId("web-speech-tts-stop").click();
        await expect(page.getByTestId("web-speech-tts-button")).toBeVisible();
        await expect(page.getByTestId("web-speech-tts-player")).toHaveCount(0);
    });
});
