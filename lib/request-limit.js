// A local development safety net, NOT a multi-instance production limiter.
// In production every request must use an atomic shared store such as Upstash Redis.
const state = new Map()
export function allowRequest(key, now = Date.now()) {
  const previous = state.get(key)
  const bucket = !previous || now - previous.start > 86400000 ? { start: now, count: 0 } : previous
  bucket.count += 1
  state.set(key, bucket)
  if (state.size > 20000) {
    for (const [k, v] of state) if (now - v.start > 86400000) state.delete(k)
  }
  return bucket.count <= 10
}
