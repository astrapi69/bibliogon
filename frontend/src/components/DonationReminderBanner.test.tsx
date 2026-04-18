/**
 * Tests for DonationReminderBanner decision logic and dismiss paths.
 *
 * Focus is on the pure helpers (shouldShowReminder, ensureFirstUseDate)
 * and the two dismiss handlers setting the correct cooldowns. Render
 * output is lightly verified; the interesting behaviour is the
 * localStorage state machine.
 */

import React from "react";
import {describe, it, expect, beforeEach, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import DonationReminderBanner, {
  ensureFirstUseDate,
  shouldShowReminder,
  FIRST_USE_DATE_KEY,
  REMINDER_NEXT_ALLOWED_KEY,
} from "./DonationReminderBanner";
import {DONATION_ONBOARDING_SEEN_KEY} from "./DonationOnboardingDialog";
import type {DonationsConfig} from "./SupportSection";

vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({t: (_: string, f: string) => f}),
}));

const baseConfig: DonationsConfig = {
  enabled: true,
  landing_page_url: null,
  channels: [
    {name: "Liberapay", url: "https://liberapay.com/astrapi69/donate", recommended: true},
    {name: "Ko-fi", url: "https://ko-fi.com/astrapi69"},
  ],
};

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

describe("ensureFirstUseDate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sets the first-use date when missing", () => {
    ensureFirstUseDate();
    expect(localStorage.getItem(FIRST_USE_DATE_KEY)).toBeTruthy();
  });

  it("is idempotent: does not overwrite an existing date", () => {
    const stable = "2024-01-15T10:00:00.000Z";
    localStorage.setItem(FIRST_USE_DATE_KEY, stable);
    ensureFirstUseDate();
    expect(localStorage.getItem(FIRST_USE_DATE_KEY)).toBe(stable);
  });
});

describe("shouldShowReminder", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns false when donations config is null", () => {
    expect(shouldShowReminder(null)).toBe(false);
  });

  it("returns false when onboarding has not been seen", () => {
    localStorage.setItem(FIRST_USE_DATE_KEY, daysAgo(120).toISOString());
    expect(shouldShowReminder(baseConfig)).toBe(false);
  });

  it("returns false when first-use is less than 90 days ago", () => {
    localStorage.setItem(DONATION_ONBOARDING_SEEN_KEY, "true");
    localStorage.setItem(FIRST_USE_DATE_KEY, daysAgo(30).toISOString());
    expect(shouldShowReminder(baseConfig)).toBe(false);
  });

  it("returns true when 90+ days elapsed and no cooldown set", () => {
    localStorage.setItem(DONATION_ONBOARDING_SEEN_KEY, "true");
    localStorage.setItem(FIRST_USE_DATE_KEY, daysAgo(100).toISOString());
    expect(shouldShowReminder(baseConfig)).toBe(true);
  });

  it("respects an active next-allowed cooldown", () => {
    localStorage.setItem(DONATION_ONBOARDING_SEEN_KEY, "true");
    localStorage.setItem(FIRST_USE_DATE_KEY, daysAgo(100).toISOString());
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    localStorage.setItem(REMINDER_NEXT_ALLOWED_KEY, futureDate.toISOString());
    expect(shouldShowReminder(baseConfig)).toBe(false);
  });

  it("returns true when cooldown is in the past", () => {
    localStorage.setItem(DONATION_ONBOARDING_SEEN_KEY, "true");
    localStorage.setItem(FIRST_USE_DATE_KEY, daysAgo(100).toISOString());
    localStorage.setItem(REMINDER_NEXT_ALLOWED_KEY, daysAgo(5).toISOString());
    expect(shouldShowReminder(baseConfig)).toBe(true);
  });
});

describe("DonationReminderBanner dismiss paths", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("'Not now' sets a 90-day cooldown", () => {
    const onDismiss = vi.fn();
    render(<DonationReminderBanner donations={baseConfig} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId("donation-reminder-not-now"));
    const next = localStorage.getItem(REMINDER_NEXT_ALLOWED_KEY);
    expect(next).toBeTruthy();
    const nextDate = new Date(next!);
    const daysAhead = Math.round((nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(daysAhead).toBeGreaterThanOrEqual(89);
    expect(daysAhead).toBeLessThanOrEqual(91);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("'Support' sets a 180-day cooldown", () => {
    const onDismiss = vi.fn();
    render(<DonationReminderBanner donations={baseConfig} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId("donation-reminder-support"));
    const next = localStorage.getItem(REMINDER_NEXT_ALLOWED_KEY);
    expect(next).toBeTruthy();
    const nextDate = new Date(next!);
    const daysAhead = Math.round((nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(daysAhead).toBeGreaterThanOrEqual(179);
    expect(daysAhead).toBeLessThanOrEqual(181);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("close-X is equivalent to 'Not now' (90-day cooldown)", () => {
    const onDismiss = vi.fn();
    render(<DonationReminderBanner donations={baseConfig} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId("donation-reminder-close"));
    const next = localStorage.getItem(REMINDER_NEXT_ALLOWED_KEY);
    const nextDate = new Date(next!);
    const daysAhead = Math.round((nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(daysAhead).toBeGreaterThanOrEqual(89);
    expect(daysAhead).toBeLessThanOrEqual(91);
  });

  it("Support button links to the recommended channel when no landing_page_url", () => {
    const onDismiss = vi.fn();
    render(<DonationReminderBanner donations={baseConfig} onDismiss={onDismiss} />);
    const supportLink = screen.getByTestId("donation-reminder-support") as HTMLAnchorElement;
    expect(supportLink.href).toBe("https://liberapay.com/astrapi69/donate");
  });

  it("Support button links to landing_page_url when set", () => {
    const config = {...baseConfig, landing_page_url: "https://bibliogon.app/support"};
    render(<DonationReminderBanner donations={config} onDismiss={vi.fn()} />);
    const supportLink = screen.getByTestId("donation-reminder-support") as HTMLAnchorElement;
    expect(supportLink.href).toBe("https://bibliogon.app/support");
  });
});
