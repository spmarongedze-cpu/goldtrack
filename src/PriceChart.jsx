import React, { useMemo, useState } from 'react'
import { fmt } from './money.js'

const PERIODS = [['7', 'Week'], ['30', 'Month'], ['365', 'Year']]

// Dependency-free SVG line chart of USD per gram (24k) with period toggles.
export default function PriceChart({ history, fgrHistory, days, onPeriod, loading, zig }) {
  const [cur, setCur] = useState('USD')
  const [src, setSrc] = useState('spot') // 'spot' = international 24k per gram, 'fgr' = Fidelity SG 90%+ per gram
  const pts = useMemo(() => {
    const raw = src === 'fgr'
      ? (fgrHistory || []).filter(p => p.sg90 > 0).map(p => ({ t: new Date(p.date), usd: Number(p.sg90), z: zig }))
      : (history || []).map(p => ({ t: new Date(p.t), usd: p.usdPerG24, z: p.zig || zig }))
    return raw.map(p => ({ t: p.t, v: cur === 'ZiG' ? p.usd * p.z : p.usd }))
  }, [history, fgrHistory, src, cur, zig])

  const W = 360, H = 160, L = 44, R = 8, T = 10, B = 24
  let body = null, meta = null
  if (pts.length >= 2) {
    const vs = pts.map(p => p.v), min = Math.min(...vs), max = Math.max(...vs), pad = (max - min || 1) * 0.1
    const lo = min - pad, hi = max + pad
    const t0 = pts[0].t.getTime(), t1 = pts[pts.length - 1].t.getTime() || t0 + 1
    const x = t => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R)
    const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t.getTime()).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
    const first = pts[0].v, last = pts[pts.length - 1].v, chg = (last / first - 1) * 100
    const ticks = [lo + pad, (lo + hi) / 2, hi - pad]
    const dateFmt = days === '7' ? { weekday: 'short' } : days === '30' ? { day: 'numeric', month: 'short' } : { month: 'short' }
    const labels = [0, 0.5, 1].map(f => { const t = t0 + f * (t1 - t0); return { x: x(t), s: new Date(t).toLocaleDateString('en-GB', dateFmt) } })
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Gold price per gram over the last ${days} days`}>
        {ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="var(--ink-2)">{cur === 'ZiG' ? Math.round(v) : v.toFixed(1)}</text></g>)}
        <path d={`${d} L${x(t1).toFixed(1)},${H - B} L${L},${H - B} Z`} fill="var(--gold)" opacity=".12" />
        <path d={d} fill="none" stroke="var(--gold-deep)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(t1)} cy={y(last)} r="3.5" fill="var(--gold-deep)" />
        {labels.map((l, i) => <text key={i} x={l.x} y={H - 6} fontSize="10" fill="var(--ink-2)" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{l.s}</text>)}
      </svg>
    )
    meta = <div className="chart-meta"><span>{fmt(first, cur)} → <b>{fmt(last, cur)}</b></span><span className={chg >= 0 ? 'up' : 'down'}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span><span className="muted">high {fmt(max, cur)} · low {fmt(min, cur)}</span></div>
  }

  return (
    <section className="section">
      <h2>Price history <span className="muted">{src === 'fgr' ? '(Fidelity SG 90%+, per gram)' : '(international spot, 24k per gram)'}</span></h2>
      <div className="chart">
        <div className="toggles">
          <div className="seg">{[['spot', 'International'], ['fgr', 'Fidelity']].map(([k, l]) => <button key={k} className={src === k ? 'on' : ''} onClick={() => setSrc(k)}>{l}</button>)}</div>
          <div className="seg">{['USD', 'ZiG'].map(c => <button key={c} className={cur === c ? 'on' : ''} onClick={() => setCur(c)}>{c}</button>)}</div>
        </div>
        <div className="toggles">
          <div className="seg">{PERIODS.map(([d, l]) => <button key={d} className={days === d ? 'on' : ''} onClick={() => onPeriod(d)}>{l}</button>)}</div>
        </div>
        {body || <div className="empty" style={{ padding: 24 }}>{loading ? 'Loading history…' : src === 'fgr' ? 'Fewer than two Fidelity lists stored for this period. Run backfillFidelity in the script to load past lists.' : 'Not enough readings yet. The chart fills as prices are logged; run installDailyTrigger and backfillHistory in the script to load past prices.'}</div>}
        {meta}
      </div>
    </section>
  )
}
