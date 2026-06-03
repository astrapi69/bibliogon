import {describe, it, expect, vi, beforeEach} from "vitest";
import {renderHook} from "@testing-library/react";

import {useGoBack} from "./useGoBack";

const navigateMock = vi.fn();
let locationKey = "default";

vi.mock("react-router-dom", () => ({
    useNavigate: () => navigateMock,
    useLocation: () => ({key: locationKey}),
}));

describe("useGoBack", () => {
    beforeEach(() => {
        navigateMock.mockClear();
        locationKey = "default";
    });

    it("navigates to the fallback on direct/deep-link entry (location.key === 'default')", () => {
        locationKey = "default";
        const {result} = renderHook(() => useGoBack("/articles"));
        result.current();
        expect(navigateMock).toHaveBeenCalledWith("/articles");
    });

    it("pops history (-1) when navigated to from elsewhere in the app", () => {
        locationKey = "abc123";
        const {result} = renderHook(() => useGoBack("/articles"));
        result.current();
        expect(navigateMock).toHaveBeenCalledWith(-1);
    });

    it("defaults the fallback to '/'", () => {
        locationKey = "default";
        const {result} = renderHook(() => useGoBack());
        result.current();
        expect(navigateMock).toHaveBeenCalledWith("/");
    });
});
