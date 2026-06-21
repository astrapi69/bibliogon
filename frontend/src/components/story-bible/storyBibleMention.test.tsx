/**
 * Tests for the Story Bible @-mention extension helpers (STORY-BIBLE
 * C13). The suggestion popup itself drives body-level DOM + a tippy-
 * less positioned div that only activates on a real "@" keystroke;
 * per the "@dnd-kit/Radix happy-dom brittleness" rule that interactive
 * path is covered by the Playwright spec. Here we pin the pure pieces:
 * the click-delegation helper + the extension factory shape.
 */
import React from "react"
import {describe, it, expect, vi} from "vitest"

import {createStoryBibleMention, handleMentionClick} from "./storyBibleMention"

describe("handleMentionClick", () => {
    function clickEventOn(el: HTMLElement) {
        return {
            target: el,
            preventDefault: vi.fn(),
        } as unknown as React.MouseEvent
    }

    it("returns false when the click is not on a mention", () => {
        const div = document.createElement("div")
        const onOpen = vi.fn()
        expect(handleMentionClick(clickEventOn(div), onOpen)).toBe(false)
        expect(onOpen).not.toHaveBeenCalled()
    })

    it("opens the entity when a mention badge is clicked", () => {
        const span = document.createElement("span")
        span.setAttribute("data-mention-id", "e42")
        const onOpen = vi.fn()
        const ev = clickEventOn(span)
        expect(handleMentionClick(ev, onOpen)).toBe(true)
        expect(onOpen).toHaveBeenCalledWith("e42")
        expect(ev.preventDefault).toHaveBeenCalled()
    })

    it("resolves the mention id from a nested click target", () => {
        const span = document.createElement("span")
        span.setAttribute("data-mention-id", "e7")
        const inner = document.createElement("b")
        span.appendChild(inner)
        const onOpen = vi.fn()
        expect(handleMentionClick(clickEventOn(inner), onOpen)).toBe(true)
        expect(onOpen).toHaveBeenCalledWith("e7")
    })
})

describe("createStoryBibleMention", () => {
    it("builds a configured mention extension named 'mention'", () => {
        const ext = createStoryBibleMention("book-1")
        expect(ext.name).toBe("mention")
        // configure() returns the same extension with options merged;
        // the suggestion char is the @ trigger.
        expect(ext.options.suggestion.char).toBe("@")
    })
})
