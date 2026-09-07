import React, { useState } from 'react'
import { fmt, grams, sellUsd } from '../money.js'

export default function Sales({ prices, fidelity, lots, sales, act }) {
  const inStock = lots.filter(l => l.status !== 'sold' && Number(l.weight_g) > 0)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const lot = form && inStock.find(l => l.id === form.lot_id)

  const open = () => {
    const first = inStock[0]
    setForm({ date: new Date().toISOString().slice(0, 10), lot_id: first?.id || '', weight_g: first?.weight_g || '', currency: 'USD', buyer: '', notes: '',
      sell_price_per_g: first && prices ? sellUsd(first, prices, fidelity).price.toFixed(2) : '' })
  }

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const sale = { ...form, weight_g: Number(form.weight_g), sell_price_per_g: Number(form.sell_price_per_g) }
      const r = await act('addSale', { sale })
      setMsg(r.queued ? 'Recorded on this phone. It will sync when online.' : 'Sale recorded.')
      setForm(null)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  const total = sales.reduce((a, s) => a + Number(s.profit_usd || 0), 0)
  const byMonth = sales.reduce((m, s) => { const k = String(s.date).slice(0, 7); m[k] = (m[k] || 0) + Number(s.profit_usd || 0); return m }, {})

  const exportCsv = () => {
    const cols = ['date', 'lot_id', 'weight_g', 'purity_k', 'sell_price_per_g', 'currency', 'buyer', 'cost_per_g', 'profit_usd', 'notes']
    const csv = [cols.join(','), ...sales.map(s => cols.map(c => JSON.stringify(s[c] ?? '')).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'goldtrack-sales.csv'; a.click()
  }

  return (
    <section className="section">
      {msg && <div className="notice">{msg}</div>}
      {!form && <button className="primary" onClick={open} disabled={!inStock.length} style={{ width: '100%', marginBottom: 14 }}>Record a sale</button>}

      {form && (
        <div className="form" style={{ marginBottom: 18 }}>
          <div className="field"><label>Lot sold from</label>
            <select value={form.lot_id} onChange={e => { const l = inStock.find(x => x.id === e.target.value); set('lot_id', e.target.value); set('weight_g', l?.weight_g || '') }}>
              {inStock.map(l => <option key={l.id} value={l.id}>{grams(l.weight_g)} {l.purity_k}k — {l.supplier}</option>)}
            </select></div>
          <div className="two">
            <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
            <div className="field"><label>Weight sold (g)</label><input type="number" inputMode="decimal" step="0.001" max={lot?.weight_g} value={form.weight_g} onChange={e => set('weight_g', e.target.value)} /></div>
          </div>
          <div className="two">
            <div className="field"><label>Sell price per gram</label><input type="number" inputMode="decimal" step="0.01" value={form.sell_price_per_g} onChange={e => set('sell_price_per_g', e.target.value)} /></div>
            <div className="field"><label>Currency</label><select value={form.currency} onChange={e => set('currency', e.target.value)}><option>USD</option><option>ZiG</option></select></div>
          </div>
          {lot && prices && (() => { const s = sellUsd(lot, prices, fidelity); return <p className="hint">Today's {s.source} price for this lot is {fmt(s.price)}/g. Lot balance {grams(lot.weight_g)}.</p> })()}
          <div className="two">
            <div className="field"><label>Buyer</label><input value={form.buyer} onChange={e => set('buyer', e.target.value)} /></div>
            <div className="field"><label>Notes</label><input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Receipt no." /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={save} disabled={busy || !form.weight_g || !form.sell_price_per_g}>Record sale</button>
            <button className="ghost" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="stats">
        <div className="stat"><div className="label">Realised profit</div><div className={'value ' + (total >= 0 ? 'up' : 'down')}>{fmt(total)}<small>{sales.length} sales</small></div></div>
        <div className="stat"><div className="label">By month</div><div className="value" style={{ fontSize: 13, fontWeight: 400 }}>
          {Object.entries(byMonth).sort().reverse().slice(0, 4).map(([m, p]) => <div key={m}>{m}: <span className={p >= 0 ? 'up' : 'down'}>{fmt(p)}</span></div>)}
          {!sales.length && '—'}
        </div></div>
      </div>

      <h2 style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between' }}>Sales log {sales.length > 0 && <button className="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={exportCsv}>Export CSV</button>}</h2>
      {sales.length === 0 && <div className="empty">No sales recorded yet.</div>}
      <table>
        <tbody>
          {[...sales].reverse().map(s => (
            <tr key={s.id}>
              <td>{String(s.date).slice(0, 10)}<div className="muted">{s.buyer || 'No buyer'}</div></td>
              <td className="num">{grams(s.weight_g)} {s.purity_k}k<div className="muted">at {fmt(s.sell_price_per_g, s.currency)}/g</div></td>
              <td className={'num ' + (Number(s.profit_usd) >= 0 ? 'up' : 'down')}>{fmt(s.profit_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
