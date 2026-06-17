import {describe, it, expect} from "vitest";
import {RingBuffer} from "./RingBuffer";

describe("RingBuffer", () => {
    it("pushes and returns items in insertion order", () => {
        const buf = new RingBuffer<string>(3);
        buf.push("a");
        buf.push("b");
        expect(buf.toArray()).toEqual(["a", "b"]);
        expect(buf.size()).toBe(2);
    });

    it("exposes its capacity", () => {
        expect(new RingBuffer<number>(5).capacity).toBe(5);
    });

    it("evicts the oldest item once full", () => {
        const buf = new RingBuffer<number>(3);
        buf.push(1);
        buf.push(2);
        buf.push(3);
        buf.push(4);
        expect(buf.toArray()).toEqual([2, 3, 4]);
        expect(buf.size()).toBe(3);
    });

    it("keeps insertion order across many wraps", () => {
        const buf = new RingBuffer<number>(3);
        for (let i = 0; i < 10; i++) {
            buf.push(i);
        }
        expect(buf.toArray()).toEqual([7, 8, 9]);
        expect(buf.size()).toBe(3);
    });

    it("size never exceeds capacity", () => {
        const buf = new RingBuffer<number>(2);
        for (let i = 0; i < 100; i++) {
            buf.push(i);
        }
        expect(buf.size()).toBe(2);
        expect(buf.toArray()).toEqual([98, 99]);
    });

    it("clear empties the buffer", () => {
        const buf = new RingBuffer<number>(3);
        buf.push(1);
        buf.push(2);
        buf.clear();
        expect(buf.size()).toBe(0);
        expect(buf.toArray()).toEqual([]);
    });

    it("works again after a clear", () => {
        const buf = new RingBuffer<number>(2);
        buf.push(1);
        buf.clear();
        buf.push(9);
        buf.push(8);
        buf.push(7);
        expect(buf.toArray()).toEqual([8, 7]);
    });

    it("toArray returns a fresh array (no aliasing)", () => {
        const buf = new RingBuffer<number>(3);
        buf.push(1);
        const snapshot = buf.toArray();
        snapshot.push(99);
        expect(buf.toArray()).toEqual([1]);
    });

    it("rejects a non-positive capacity", () => {
        expect(() => new RingBuffer<number>(0)).toThrow(RangeError);
        expect(() => new RingBuffer<number>(-1)).toThrow(RangeError);
        expect(() => new RingBuffer<number>(1.5)).toThrow(RangeError);
    });
});
