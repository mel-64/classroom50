import { describe, expect, it } from "vitest"
import { mapWithConcurrency } from "./concurrency"

describe("mapWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const items = [30, 10, 20, 0]
    const out = await mapWithConcurrency(items, 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms))
      return ms * 2
    })
    expect(out).toEqual([60, 20, 40, 0])
  })

  it("never runs more than `limit` tasks at once", async () => {
    let active = 0
    let peak = 0
    const items = Array.from({ length: 12 }, (_, i) => i)
    await mapWithConcurrency(items, 3, async (i) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return i
    })
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1)
  })

  it("returns an empty array for empty input without invoking the task", async () => {
    let calls = 0
    const out = await mapWithConcurrency([], 4, async (x) => {
      calls++
      return x
    })
    expect(out).toEqual([])
    expect(calls).toBe(0)
  })

  it("runs every item even when limit exceeds item count", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 10, async (x) => x + 1)
    expect(out).toEqual([2, 3, 4])
  })

  it("propagates the first rejection", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error("boom")
        return x
      }),
    ).rejects.toThrow("boom")
  })
})
