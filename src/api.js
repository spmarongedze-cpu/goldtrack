// Talks to the Apps Script web app. Caches the last good response so the app
// still shows data offline, and queues writes until the connection returns.

const KEY = 'goldtrack.config'
const CACHE = 'goldtrack.cache.'
const QUEUE = 'goldtrack.queue'

export const config = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } },
  set(c) { localStorage.setItem(KEY, JSON.stringify(c)) }
}

async function call(action, payload = {}) {
  const { url, pin } = config.get()
  if (!url) throw new Error('No backend URL set. Open Settings and paste your Apps Script URL.')
  const res = await fetch(url, {
    method: 'POST',
    // text/plain avoids a CORS preflight, which Apps Script cannot answer
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, pin, ...payload })
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || 'Request failed')
  return json.data
}

export async function read(action, payload) {
  const key = CACHE + action + (payload?.days ? ':' + payload.days : '')
  try {
    const data = await call(action, payload)
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }))
    return { data, stale: false }
  } catch (err) {
    const c = localStorage.getItem(key)
    if (c) return { ...JSON.parse(c), stale: true, error: err.message }
    throw err
  }
}

export function queued() { try { return JSON.parse(localStorage.getItem(QUEUE)) || [] } catch { return [] } }

export async function write(action, payload) {
  try {
    return await call(action, payload)
  } catch (err) {
    if (!navigator.onLine || /fetch/i.test(err.message)) {
      const q = queued(); q.push({ action, payload, at: Date.now() })
      localStorage.setItem(QUEUE, JSON.stringify(q))
      return { queued: true }
    }
    throw err
  }
}

export async function flushQueue() {
  const q = queued()
  if (!q.length) return 0
  const left = []
  for (const item of q) {
    try { await call(item.action, item.payload) } catch { left.push(item) }
  }
  localStorage.setItem(QUEUE, JSON.stringify(left))
  return q.length - left.length
}
