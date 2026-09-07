import React, { useState, useMemo } from 'react'
import { fmt, grams, costUsd, sellUsd, purityPct } from '../money.js'

// "What profit can I make on my stock?" — pick lots, move the slider.
export default function Calculator({ prices, fidelity, lots }) {
  const useFgr = prices?.sellBasis === 'fidelity' && fidelity?.ok
  const [pct, setPct] = useState(0)
  const [chosen, setChosen] = useState(null) // null = all in-stock lots
  const [target, setTarget] = useState('')

  if (!prices) return <div className="empty">Waiting for a price before the calculator can run.</div>
  const zig = prices.zigPerUsd
  const inStock = lots.filter(l => l.status !== 'sold' && Number(l.weight_g) > 0)
  const selected = chosen ? inStock.filter(l => chosen.has(l.id)) : inStock

  const calc = useMemo(() => {
    let weight = 0, cost = 0, revenue = 0
    const rows = selected.map(l => {
      const w = Number(l.weight_g), c = costUsd(l, zig)
      const base = useFgr ? sellUsd(l, prices, fidelity, 'fidelity') : { price: prices.usdPerG24 * purityPct(l) / 100, source: 'spot' }
      const sell = base.price * (1 + pct / 100)
      weight += w; cost += c * w; revenue += sell * w
      return { ...l, w, c, sell, source: base.source, profit: (sell - c) * w, breakEvenOz: c * (100 / purityPct(l)) * 31.1034768 }
    })
    return { rows, weight, cost, revenue, profit: revenue - cost }
  }, [selected, pct, prices, fidelity, zig, useFgr])

  // Spot price at which the selected stock exactly breaks even (weighted)
  const breakEvenOz = calc.weight ? calc.rows.reduce((a, r) => a + r.breakEvenOz * r.w, 0) / calc.weight : 0
  const targetOz = Number(target)
  const profitAtTarget = targetOz > 0
    ? calc.rows.reduce((a, r) => a + ((targetOz / 31.1034768) * (purityPct(r) / 100) * (useFgr ? r.sell / (prices.usdPerG24 * purityPct(r) / 100) : 1 + pct / 100) - r.c) * r.w, 0)
    : null

  const toggle = (id) => {
    const next = new Set(chosen || inStock.map(l => l.id))
    next.has(id) ? next.delete(id) : next.add(id)
    setChosen(next)
  }

  return (
    <section className="section">
      <div className="scenario">
        <div className="muted">If you sell {grams(calc.weight)} at {useFgr ? 'Fidelity band' : 'spot'} {pct >= 0 ? '+' : ''}{pct}%</div>
        <div className={'big ' + (calc.profit >= 0 ? 'up' : 'down')}>{fmt(calc.profit)}</div>
        <div className="muted">{fmt(calc.profit * zig, 'ZiG')} · {calc.cost ? (calc.profit / calc.cost * 100).toFixed(1) : 0}% on cost · revenue {fmt(calc.revenue)}</div>
        <input type="range" min="-15" max="15" step="0.5" value={pct} onChange={e => setPct(Number(e.target.value))} aria-label="Sell price relative to spot" />
        <div className="muted" style={{ display: 'flex', justifyContent: 'space-between' }}><span>15% below</span><span>{useFgr ? 'Fidelity price' : 'spot'}</span><span>15% above</span></div>
      </div>

      <div className="stats" style={{ marginTop: 12 }}>
        <div className="stat"><div className="label">Break-even spot price</div><div className="value">{fmt(breakEvenOz, 'USD', 0)}<small>per oz, break-even on cost</small></div></div>
        <div className="stat"><div className="label">Spot now</div><div className="value">{fmt(prices.usdPerOz, 'USD', 0)}<small>{((prices.usdPerOz / breakEvenOz - 1) * 100).toFixed(1)}% above break-even</small></div></div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>What if spot moves to (USD per oz)?</label>
        <input type="number" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder={Math.round(prices.usdPerOz * 1.05)} />
        {profitAtTarget !== null && <p className="hint">At {fmt(targetOz, 'USD', 0)}/oz, assuming Fidelity keeps the same discount to spot, profit would be <b className={profitAtTarget >= 0 ? 'up' : 'down'}>{fmt(profitAtTarget)}</b>.</p>}
      </div>

      <h2 style={{ marginTop: 18 }}>Lots included</h2>
      {inStock.length === 0 && <div className="empty">No stock to calculate on.</div>}
      <table>
        <thead><tr><th></th><th>Lot</th><th className="num">Cost/g</th><th className="num">Sell/g</th><th className="num">Profit</th></tr></thead>
        <tbody>
          {inStock.map(l => {
            const r = calc.rows.find(x => x.id === l.id)
            const on = !chosen || chosen.has(l.id)
            return (
              <tr key={l.id} style={{ opacity: on ? 1 : .45 }}>
                <td><input type="checkbox" checked={on} onChange={() => toggle(l.id)} aria-label={`Include ${l.supplier}`} /></td>
                <td>{grams(l.weight_g)} {l.purity_k}k<div className="muted">{l.supplier}</div></td>
                <td className="num">{fmt(costUsd(l, zig))}</td>
                <td className="num">{r ? fmt(r.sell) : '—'}<div className="muted">{r?.source}</div></td>
                <td className={'num ' + (r ? (r.profit >= 0 ? 'up' : 'down') : '')}>{r ? fmt(r.profit) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
