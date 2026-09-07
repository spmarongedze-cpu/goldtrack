import React, { useEffect, useState, useCallback } from 'react'
import { read, write, flushQueue, queued, config } from './api.js'
import Dashboard from './screens/Dashboard.jsx'
import Stock from './screens/Stock.jsx'
import Calculator from './screens/Calculator.jsx'
import Sales from './screens/Sales.jsx'
import Settings from './screens/Settings.jsx'

const TABS = [
  ['home', 'Prices', 'M3 12 12 4l9 8M5 10v10h14V10'],
  ['stock', 'Stock', 'M4 8h16l-2 12H6zM8 8V5h8v3'],
  ['calc', 'Profit', 'M5 3h14v18H5zM8 7h8M8 12h3M13 12h3M8 16h3M13 16h3'],
  ['sales', 'Sales', 'M3 17l6-6 4 4 8-8M14 7h7v7'],
  ['settings', 'Settings', 'M12 8a4 4 0 100 8 4 4 0 000-8zM4 12h2M18 12h2M12 4v2M12 18v2'],
]

export default function App() {
  const [tab, setTab] = useState(config.get().url ? 'home' : 'settings')
  const [prices, setPrices] = useState(null)
  const [fidelity, setFidelity] = useState(null)
  const [lots, setLots] = useState([])
  const [sales, setSales] = useState([])
  const [settings, setSettings] = useState({})
  const [state, setState] = useState({ loading: false, stale: false, error: null })
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(queued().length)

  const refresh = useCallback(async (force = false) => {
    if (!config.get().url) return
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const [p, l, s, st, f] = await Promise.all([
        read('prices', { force }), read('lots'), read('sales'), read('settings'), read('fidelity', { force }).catch(() => ({ data: null }))
      ])
      setPrices(p.data); setLots(l.data); setSales(s.data); setSettings(st.data); setFidelity(f.data)
      setState({ loading: false, stale: p.stale, error: p.error || null })
    } catch (err) {
      setState({ loading: false, stale: true, error: err.message })
    }
  }, [])

  useEffect(() => {
    refresh()
    const on = async () => { setOnline(true); const n = await flushQueue(); setPending(queued().length); if (n) refresh() }
    const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    const t = setInterval(() => refresh(), 15 * 60 * 1000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t) }
  }, [refresh])

  const act = async (action, payload) => {
    const r = await write(action, payload)
    setPending(queued().length)
    if (!r.queued) await refresh()
    return r
  }

  const statusText = !online ? 'Offline' + (pending ? ` · ${pending} change(s) waiting` : '')
    : state.loading ? 'Updating…'
    : state.stale ? 'Showing last saved data' : (pending ? `${pending} change(s) waiting` : 'Live')

  const props = { prices, fidelity, lots, sales, settings, act, refresh, state }

  return (
    <div className="app">
      <header className="top">
        <h1>GoldTrack</h1>
        <span className={'status' + (!online ? ' offline' : state.stale ? ' stale' : '')}>{statusText}</span>
      </header>

      {state.error && tab !== 'settings' && <div className="section" style={{ paddingBottom: 0 }}><div className="notice error">{state.error}</div></div>}

      {tab === 'home' && <Dashboard {...props} />}
      {tab === 'stock' && <Stock {...props} />}
      {tab === 'calc' && <Calculator {...props} />}
      {tab === 'sales' && <Sales {...props} />}
      {tab === 'settings' && <Settings {...props} setSettings={setSettings} />}

      <nav className="nav" aria-label="Main">
        {TABS.map(([id, label, d]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
