import React, { useEffect, useState } from 'react'
import { fmt, grams, costUsd, sellUsd, timeAgo, BAND_LABEL } from '../money.js'
import { read } from '../api.js'
import PriceChart from '../PriceChart.jsx'

export default function Dashboard({ prices, fidelity, lots, sales, refresh, state }) {
  const [days, setDays] = useState('7')
  const [hist, setHist] = useState({ data: [], fgr: [], loading: true })
  useEffect(() => {
    let live = true
    setHist(h => ({ ...h, loading: true }))
    Promise.all([
      read('priceHistory', { days: Number(days) }).catch(() => ({ data: [] })),
      read('fidelityHistory', { days: Number(days) }).catch(() => ({ data: [] }))
    ]).then(([r, f]) => live && setHist({ data: r.data, fgr: f.data, loading: false }))
    return () => { live = false }
  }, [days, prices?.fetchedAt])
  if (!prices) return <div className="empty">{state.loading ? 'Fetching the gold price…' : 'No price yet. Check Settings, then pull to refresh.'}</div>

  const zig = prices.zigPerUsd
  const inStock = lots.filter(l => l.status !== 'sold' && Number(l.weight_g) > 0)
  const totals = inStock.reduce((a, l) => {
    const w = Number(l.weight_g)
    a.weight += w
    a.cost += costUsd(l, zig) * w
    a.value += sellUsd(l, prices, fidelity).price * w
    return a
  }, { weight: 0, cost: 0, value: 0 })
  const unrealised = totals.value - totals.cost
  const realised = sales.reduce((a, s) => a + Number(s.profit_usd || 0), 0)

  return (
    <>
      <section className="hero">
        <div className="price">{fmt(prices.usdPerG24)}<small>per gram, 24k</small></div>
        <div className="sub">
          <span><b>{fmt(prices.usdPerG24 * zig, 'ZiG')}</b> /g</span>
          <span><b>{fmt(prices.usdPerOz, 'USD', 0)}</b> /oz</span>
          <span>{prices.source} · {timeAgo(prices.fetchedAt)}</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="ghost" onClick={() => refresh(true)} disabled={state.loading}>Refresh price</button>
        </div>
      </section>

      <section className="section">
        <h2>Fidelity Gold Refinery buying prices {fidelity?.ok && <span className="muted">{fidelity.date}</span>}</h2>
        {!fidelity?.ok && <div className="notice error">No Fidelity list yet{fidelity?.error ? `: ${fidelity.error}` : ''}. Stock is being valued off spot until one loads.</div>}
        {fidelity?.ok && (
          <div className="fgr">
            {fidelity.stale && <div className="notice">This list is {fidelity.ageDays} days old – the daily fetch may be failing. Check the FidelityLog sheet.</div>}
            <table>
              <thead><tr><th>Category</th><th className="num">US$/g</th><th className="num">ZiG/g</th><th className="num">vs spot</th></tr></thead>
              <tbody>
                {Object.entries(fidelity.bands).filter(([, v]) => v > 0).map(([k, v]) => (
                  <tr key={k} className={k === 'sg90' ? 'hl' : ''}>
                    <td>{BAND_LABEL[k]}</td>
                    <td className="num">{fmt(v)}</td>
                    <td className="num">{fmt(v * zig, 'ZiG')}</td>
                    <td className="num muted">{((v / prices.usdPerG24 - 1) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">SG = specific-gravity purity band. Fire-assay cash applies to lodgements above 100 g. Published daily by FGR; fetched via <a href={fidelity.sourceUrl} target="_blank" rel="noreferrer">Mining Zimbabwe</a>. {prices.sellBasis === 'fidelity' ? 'Your stock is valued at these bands.' : 'Stock is valued at spot minus your spread (change in Settings).'}</p>
          </div>
        )}
      </section>

      <section className="section">
        <h2>International spot by purity</h2>
        <table>
          <thead><tr><th>Purity</th><th className="num">Spot USD/g</th><th className="num">ZiG/g</th><th className="num">We buy</th><th className="num">We sell</th></tr></thead>
          <tbody>
            {Object.entries(prices.perGram).sort((a, b) => b[0] - a[0]).map(([k, v]) => (
              <tr key={k}>
                <td>{k}k</td>
                <td className="num">{fmt(v.usd)}</td>
                <td className="num">{fmt(v.zig, 'ZiG')}</td>
                <td className="num">{fmt(v.usd * (1 + prices.buySpreadPct / 100))}</td>
                <td className="num">{fmt(v.usd * (1 + prices.sellSpreadPct / 100))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">LBMA spot from {prices.source}. Buy/sell columns apply your spreads ({prices.buySpreadPct}% / {prices.sellSpreadPct}%). ZiG rate {zig} per USD.</p>
      </section>

      <section className="section">
        <h2>Position</h2>
        <div className="stats">
          <div className="stat"><div className="label">Gold on hand</div><div className="value">{grams(totals.weight)}<small>{inStock.length} lot{inStock.length === 1 ? '' : 's'}</small></div></div>
          <div className="stat"><div className="label">Cost of stock</div><div className="value">{fmt(totals.cost)}<small>{fmt(totals.cost * zig, 'ZiG')}</small></div></div>
          <div className="stat"><div className="label">Value {prices.sellBasis === 'fidelity' && fidelity?.ok ? 'at Fidelity bands' : 'at sell price'}</div><div className="value">{fmt(totals.value)}<small>{fmt(totals.value * zig, 'ZiG')}</small></div></div>
          <div className="stat"><div className="label">Unrealised profit</div><div className={'value ' + (unrealised >= 0 ? 'up' : 'down')}>{fmt(unrealised)}<small>{totals.cost ? (unrealised / totals.cost * 100).toFixed(1) + '% on cost' : '—'}</small></div></div>
          <div className="stat"><div className="label">Realised profit (all sales)</div><div className={'value ' + (realised >= 0 ? 'up' : 'down')}>{fmt(realised)}<small>{sales.length} sale{sales.length === 1 ? '' : 's'}</small></div></div>
        </div>
      </section>

      <PriceChart history={hist.data} fgrHistory={hist.fgr} days={days} onPeriod={setDays} loading={hist.loading} zig={zig} />
    </>
  )
}
