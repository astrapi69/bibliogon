/**
 * Regression pin: the content-type dropdown lists ALL 8 types, Blogpost
 * INCLUDED (reported missing 3x). Renders CreateArticlePage with the real
 * ContentTypesProvider seeded with all 8 registry types, opens the Radix
 * Select, and asserts every type's option is present. A reintroduced
 * filter/slice that drops the default (Blogpost) fails this test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import CreateArticlePage from "./CreateArticlePage";
import { ContentTypesProvider } from "../hooks/useContentTypes";
import type { ContentType, ContentTypeDef } from "../api/client";

const IDS: ContentType[] = [
  "blogpost",
  "tutorial",
  "review",
  "essay",
  "newsletter",
  "interview",
  "listicle",
  "short_story",
];

const ALL_TYPES: Record<string, ContentTypeDef> = Object.fromEntries(
  IDS.map((id) => [
    id,
    {
      id,
      label_key: `ui.content_types.${id}`,
      description_key: `ui.content_types.${id}_desc`,
      default_title_key: `ui.content_types.${id}_default_title`,
      icon: "FileText",
      default: id === "blogpost",
      extra_fields: [],
    },
  ]),
);

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (_k: string, fb: string) => fb,
    lang: "en",
    setLang: vi.fn(),
  }),
}));

vi.mock("../api/client", () => ({
  api: {
    settings: {
      getApp: vi
        .fn()
        .mockResolvedValue({ author: { name: "", pen_names: [] } }),
    },
    articles: { create: vi.fn() },
  },
  ApiError: class ApiError extends Error {},
}));

vi.mock("../utils/platform/notify", () => ({
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateArticlePage content-type dropdown", () => {
  it("lists all 8 content types including Blogpost", async () => {
    render(
      <MemoryRouter initialEntries={["/articles/new"]}>
        <ContentTypesProvider initialTypes={ALL_TYPES}>
          <Routes>
            <Route path="/articles/new" element={<CreateArticlePage />} />
          </Routes>
        </ContentTypesProvider>
      </MemoryRouter>,
    );

    const trigger = await screen.findByTestId("create-article-type");
    // Open the Radix Select (keyboard is the most reliable opener under
    // happy-dom; click is a fallback).
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(trigger);

    for (const id of IDS) {
      await waitFor(() =>
        expect(screen.getByTestId(`create-article-type-${id}`)).toBeTruthy(),
      );
    }
  });
});
