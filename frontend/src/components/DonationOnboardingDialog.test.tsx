/**
 * Tests for DonationOnboardingDialog.
 *
 * Focus: the localStorage flag is set on every dismiss path
 * (Support, Understood, close-X), so the dialog is shown at most
 * once per user per machine. Also pins the `shouldShowDonationOnboarding`
 * helper that Dashboard calls.
 */

import React from "react";
import {describe, it, expect, beforeEach, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import DonationOnboardingDialog, {
  shouldShowDonationOnboarding,
  DONATION_ONBOARDING_SEEN_KEY,
} from "./DonationOnboardingDialog";
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

describe("shouldShowDonationOnboarding", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns true when flag is missing", () => {
    expect(shouldShowDonationOnboarding()).toBe(true);
  });

  it("returns false when flag is set to 'true'", () => {
    localStorage.setItem(DONATION_ONBOARDING_SEEN_KEY, "true");
    expect(shouldShowDonationOnboarding()).toBe(false);
  });

  it("returns true when flag is any other value", () => {
    localStorage.setItem(DONATION_ONBOARDING_SEEN_KEY, "false");
    expect(shouldShowDonationOnboarding()).toBe(true);
  });
});

describe("DonationOnboardingDialog dismiss paths", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("'Understood' sets the seen flag and calls onClose", () => {
    const onClose = vi.fn();
    render(<DonationOnboardingDialog open={true} onClose={onClose} donations={baseConfig} />);
    fireEvent.click(screen.getByTestId("donation-onboarding-understood"));
    expect(localStorage.getItem(DONATION_ONBOARDING_SEEN_KEY)).toBe("true");
    expect(onClose).toHaveBeenCalled();
  });

  it("close-X sets the seen flag", () => {
    const onClose = vi.fn();
    render(<DonationOnboardingDialog open={true} onClose={onClose} donations={baseConfig} />);
    fireEvent.click(screen.getByTestId("donation-onboarding-close"));
    expect(localStorage.getItem(DONATION_ONBOARDING_SEEN_KEY)).toBe("true");
    expect(onClose).toHaveBeenCalled();
  });

  it("'Support' with a landing_page_url sets the flag and closes immediately", () => {
    const config = {...baseConfig, landing_page_url: "https://bibliogon.app/support"};
    const onClose = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<DonationOnboardingDialog open={true} onClose={onClose} donations={config} />);
    fireEvent.click(screen.getByTestId("donation-onboarding-support"));
    expect(localStorage.getItem(DONATION_ONBOARDING_SEEN_KEY)).toBe("true");
    expect(openSpy).toHaveBeenCalledWith(
      "https://bibliogon.app/support",
      "_blank",
      "noopener,noreferrer",
    );
    expect(onClose).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("'Support' without a landing_page_url sets the flag and progresses to channel list", () => {
    const onClose = vi.fn();
    render(<DonationOnboardingDialog open={true} onClose={onClose} donations={baseConfig} />);
    fireEvent.click(screen.getByTestId("donation-onboarding-support"));
    // Flag is set even though onClose has not fired yet (we are in step 1)
    expect(localStorage.getItem(DONATION_ONBOARDING_SEEN_KEY)).toBe("true");
    // Channel list rendered
    expect(screen.getByTestId("donation-onboarding-channel-Liberapay")).toBeTruthy();
    expect(screen.getByTestId("donation-onboarding-channel-Ko-fi")).toBeTruthy();
  });

  it("clicking a channel link in step 1 closes the dialog", () => {
    const onClose = vi.fn();
    render(<DonationOnboardingDialog open={true} onClose={onClose} donations={baseConfig} />);
    fireEvent.click(screen.getByTestId("donation-onboarding-support"));
    const link = screen.getByTestId("donation-onboarding-channel-Liberapay") as HTMLAnchorElement;
    expect(link.href).toBe("https://liberapay.com/astrapi69/donate");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalled();
  });
});
