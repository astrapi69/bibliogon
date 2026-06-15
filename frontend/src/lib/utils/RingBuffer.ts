/**
 * A fixed-capacity, framework-free FIFO ring buffer.
 *
 * Once `capacity` items have been pushed, every further push evicts the
 * oldest item. `toArray` always returns the live contents in insertion
 * order (oldest first). No app or framework imports — usable anywhere.
 *
 * @typeParam T - the element type held by the buffer.
 *
 * @example
 * ```ts
 * const buf = new RingBuffer<number>(3);
 * buf.push(1);
 * buf.push(2);
 * buf.push(3);
 * buf.push(4);          // evicts 1
 * buf.toArray();        // [2, 3, 4]
 * buf.size();           // 3
 * buf.capacity;         // 3
 * buf.clear();
 * buf.toArray();        // []
 * ```
 */
export class RingBuffer<T> {
    private readonly slots: (T | undefined)[];
    private writeIndex = 0;
    private count = 0;

    /**
     * Create a ring buffer holding at most `capacity` items.
     *
     * @param capacity - maximum number of items retained; must be >= 1.
     * @throws RangeError if `capacity` is not a positive integer.
     */
    constructor(private readonly _capacity: number) {
        if (!Number.isInteger(_capacity) || _capacity < 1) {
            throw new RangeError("RingBuffer capacity must be a positive integer");
        }
        this.slots = new Array<T | undefined>(_capacity);
    }

    /**
     * Append an item. When the buffer is full this overwrites the oldest
     * item.
     *
     * @param item - the item to append.
     */
    push(item: T): void {
        this.slots[this.writeIndex] = item;
        this.writeIndex = (this.writeIndex + 1) % this._capacity;
        if (this.count < this._capacity) {
            this.count += 1;
        }
    }

    /**
     * Return the current contents in insertion order (oldest first).
     *
     * @returns a fresh array; mutating it does not affect the buffer.
     */
    toArray(): T[] {
        const result: T[] = [];
        const start = this.count < this._capacity ? 0 : this.writeIndex;
        for (let offset = 0; offset < this.count; offset += 1) {
            const slot = this.slots[(start + offset) % this._capacity];
            result.push(slot as T);
        }
        return result;
    }

    /** Remove every item, resetting the buffer to empty. */
    clear(): void {
        this.slots.fill(undefined);
        this.writeIndex = 0;
        this.count = 0;
    }

    /** The number of items currently held (0..capacity). */
    size(): number {
        return this.count;
    }

    /** The maximum number of items the buffer can hold. */
    get capacity(): number {
        return this._capacity;
    }
}
