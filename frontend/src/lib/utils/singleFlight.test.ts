import { describe, it, expect, vi } from "vitest";

import { singleFlight } from "./singleFlight";

describe("singleFlight", () => {
    it("collapses concurrent calls into a single fetcher invocation (page-load burst)", async () => {
        const fetcher = vi.fn(async () => "value");
        const get = singleFlight(fetcher);

        const results = await Promise.all([get(), get(), get(), get(), get()]);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(results).toEqual(["value", "value", "value", "value", "value"]);
    });

    it("gives every concurrent caller the same resolved value", async () => {
        let n = 0;
        const get = singleFlight(async () => ++n);

        const results = await Promise.all([get(), get(), get(), get()]);

        expect(results).toEqual([1, 1, 1, 1]);
    });

    it("fetches fresh after the previous call settled (nothing retained)", async () => {
        const fetcher = vi.fn(async () => "v");
        const get = singleFlight(fetcher);

        await get();
        await get();

        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("cold start: the very first call invokes the fetcher", async () => {
        const fetcher = vi.fn(async () => "first");
        const get = singleFlight(fetcher);

        expect(fetcher).not.toHaveBeenCalled();
        await expect(get()).resolves.toBe("first");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("does not cache rejections: the next call retries", async () => {
        const fetcher = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce("ok");
        const get = singleFlight(fetcher);

        await expect(get()).rejects.toThrow("boom");
        await expect(get()).resolves.toBe("ok");
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("propagates a rejection to all concurrent callers from one invocation", async () => {
        const fetcher = vi.fn(async () => {
            throw new Error("fail");
        });
        const get = singleFlight(fetcher);

        const p1 = get();
        const p2 = get();

        await expect(p1).rejects.toThrow("fail");
        await expect(p2).rejects.toThrow("fail");
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("isolates separate single-flight instances", async () => {
        const fa = vi.fn(async () => "a");
        const fb = vi.fn(async () => "b");
        const getA = singleFlight(fa);
        const getB = singleFlight(fb);

        expect(await Promise.all([getA(), getB()])).toEqual(["a", "b"]);
        expect(fa).toHaveBeenCalledTimes(1);
        expect(fb).toHaveBeenCalledTimes(1);
    });
});
