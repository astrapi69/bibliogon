/**
 * Tests for SupportSection and the getDonationsConfig typing helper.
 *
 * Kill-switch behaviour (returning null when disabled or absent)
 * is the S-01 contract the Settings page relies on to hide the tab.
 */

import React from "react";
import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import SupportSection, {getDonationsConfig} from "./SupportSection";

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({t: (_: string, f: string) => f}),
}));

describe("getDonationsConfig", () => {
  it("returns null when the block is missing", () => {
    expect(getDonationsConfig({})).toBeNull();
  });

  it("returns null when enabled is false", () => {
    expect(getDonationsConfig({donations: {enabled: false}})).toBeNull();
  });

  it("returns null when enabled is not strictly true", () => {
    expect(getDonationsConfig({donations: {enabled: "yes"}})).toBeNull();
    expect(getDonationsConfig({donations: {enabled: 1}})).toBeNull();
  });

  it("returns a normalised config when enabled", () => {
    const config = getDonationsConfig({
      donations: {
        enabled: true,
        landing_page_url: null,
        channels: [{name: "Liberapay", url: "https://liberapay.com/astrapi69/donate"}],
      },
    });
    expect(config).not.toBeNull();
    expect(config!.enabled).toBe(true);
    expect(config!.landing_page_url).toBeNull();
    expect(config!.channels).toHaveLength(1);
  });

  it("preserves landing_page_url when present and non-empty", () => {
    const config = getDonationsConfig({
      donations: {
        enabled: true,
        landing_page_url: "https://bibliogon.app/support",
        channels: [],
      },
    });
    expect(config!.landing_page_url).toBe("https://bibliogon.app/support");
  });

  it("normalises empty-string landing_page_url to null", () => {
    const config = getDonationsConfig({
      donations: {enabled: true, landing_page_url: "", channels: []},
    });
    expect(config!.landing_page_url).toBeNull();
  });

  it("tolerates a non-array channels field", () => {
    const config = getDonationsConfig({
      donations: {enabled: true, landing_page_url: null, channels: "nope"},
    });
    expect(config!.channels).toEqual([]);
  });
});

describe("SupportSection rendering", () => {
  const channels = [
    {
      name: "Liberapay",
      url: "https://liberapay.com/astrapi69/donate",
      recommended: true,
      description_key: "ui.donations.channels.liberapay_desc",
    },
    {
      name: "PayPal",
      url: "https://paypal.com/donate",
    },
  ];

  it("renders one card per channel", () => {
    render(
      <SupportSection
        config={{enabled: true, landing_page_url: null, channels}}
      />,
    );
    expect(screen.getByTestId("donation-channel-Liberapay")).toBeTruthy();
    expect(screen.getByTestId("donation-channel-PayPal")).toBeTruthy();
  });

  it("channel URLs open in a new tab with noopener/noreferrer", () => {
    render(
      <SupportSection
        config={{enabled: true, landing_page_url: null, channels}}
      />,
    );
    const card = screen.getByTestId("donation-channel-Liberapay");
    const link = card.querySelector("a") as HTMLAnchorElement;
    expect(link.href).toBe("https://liberapay.com/astrapi69/donate");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.rel).toContain("noreferrer");
  });

  it("collapses to a single primary button when landing_page_url is set", () => {
    render(
      <SupportSection
        config={{
          enabled: true,
          landing_page_url: "https://bibliogon.app/support",
          channels,
        }}
      />,
    );
    // No per-channel cards in landing-page mode
    expect(screen.queryByTestId("donation-channel-Liberapay")).toBeNull();
    expect(screen.queryByTestId("donation-channel-PayPal")).toBeNull();
  });
});
