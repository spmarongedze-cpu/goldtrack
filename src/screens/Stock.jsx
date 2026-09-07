import React, { useState } from 'react'
import { fmt, grams, costUsd, spotUsd, sellUsd, fgrBand, BAND_LABEL } from '../money.js'

const blank = () => ({ date: new Date().toISOString().slice(0, 10), supplier: '', weight_g: '', purity_k: 24, purity_pct: '', buy_price_per_g: '', currency: 'USD', notes: '' })

export default function Stock({ prices, fidelity, lots, act }) {
  const [form, setForm] = useState(null) // null = closed, object = editing/adding
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const zig = prices?.zigPerUsd || 1
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const lot = { ...form, weight_g: Number(form.weight_g), purity_k: Number(form.purity_k), purity_pct: form.purity_pct === '' ? '' : Number(form.purity_pct), buy_price_per_g: Number(form.buy_price_per_g) }
      const r = await act(lot.id ? 'updateLot' : 'addLot', { lot })
      setMsg(r.queued ? 'Saved on this phone. It will sync when you are back online.' : 'Saved.')
      setForm(null)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  const remove = async (lot) => {
    if (!confirm(`Delete lot from ${lot.supplier || 'unknown'} (${grams(lot.weight_g)})?`)) return
    setBusy(true)
    try { await act('deleteLot', { id: lot.id }) } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  const inStock = lots.filter(l => l.status !== 'sold' && Number(l.weight_g) > 0)

  return (
    <section className="section">
      {msg && <div className="notice">{msg}</div>}
      {!form && <button className="primary" onClick={() => setForm(blank())} style={{ width: '100%', marginBottom: 14 }}>Add gold to stock</button>}

      {form && (
        <div className="form" style={{ marginBottom: 18 }}>
          <div className="two">
            <div className="field"><label>Date bought</label><input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
            <div className="field"><label>Supplier</label><input value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Name or ID" /></div>
          </div>
          <div className="two">
            <div className="field"><label>Weight (grams)</label><input type="number" inputMode="decimal" step="0.001" value={form.weight_g} onChange={e => set('weight_g', e.target.value)} /></div>
            <div className="field"><label>Karat</label>
              <select value={form.purity_k} onChange={e => set('purity_k', e.target.value)}>
                {[24, 22, 21, 18, 14, 9].map(k => <option key={k} value={k}>{k}k</option>)}
              </select></div>
          </div>
          <div className="field"><label>Purity % (SG or assay result)</label>
            <input type="number" inputMode="decimal" step="0.1" min="0" max="100" value={form.purity_pct} onChange={e => set('purity_pct', e.target.value)} placeholder={(Number(form.purity_k) / 24 * 100).toFixed(1)} />
            <span className="hint">{(() => { const b = fgrBand(form.purity_pct || Number(form.purity_k) / 24 * 100); return b ? `Fidelity band: ${BAND_LABEL[b]}` : 'Below 75% – no Fidelity band, valued off spot' })()}</span>
          </div>
          <div className="two">
            <div className="field"><label>Price paid per gram</label><input type="number" inputMode="decimal" step="0.01" value={form.buy_price_per_g} onChange={e => set('buy_price_per_g', e.target.value)} /></div>
            <div className="field"><label>Currency</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)}><option>USD</option><option>ZiG</option></select></div>
          </div>
          {prices && form.weight_g && form.buy_price_per_g && (
            <p className="hint">Spot for {form.purity_k}k is {fmt(spotUsd(prices, form.purity_k))}/g. You are paying {((costUsd(form, zig) / spotUsd(prices, form.purity_k) - 1) * 100).toFixed(1)}% vs spot.</p>
          )}
          <div className="field"><label>Notes</label><input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Form, assay, receipt no." /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={save} disabled={busy || !form.weight_g || !form.buy_price_per_g}>{form.id ? 'Save changes' : 'Add to stock'}</button>
            <button className="ghost" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <h2>In stock</h2>
      {inStock.length === 0 && <div className="empty">Nothing in stock yet. Add your first lot above.</div>}
      {inStock.map(l => {
        const w = Number(l.weight_g)
        const cost = costUsd(l, zig)
        const s = prices ? sellUsd(l, prices, fidelity) : null
        const sell = s ? s.price : null
        const pl = sell !== null ? (sell - cost) * w : null
        return (
          <div className="lot" key={l.id}>
            <div className="row">
              <div>
                <div className="title">{grams(w)} · {l.purity_k}k</div>
                <div className="meta">{l.supplier || 'No supplier'} · {String(l.date).slice(0, 10)} · bought at {fmt(l.buy_price_per_g, l.currency)}/g{l.purity_pct ? ` · ${l.purity_pct}% purity` : ''}</div>
              </div>
              {pl !== null && (
                <div className="pl">
                  <div className={'amt ' + (pl >= 0 ? 'up' : 'down')}>{fmt(pl)}</div>
                  <div className="muted">{((sell / cost - 1) * 100).toFixed(1)}% at {s.source}</div>
                </div>
              )}
            </div>
            <div className="actions">
              <button className="ghost" onClick={() => setForm({ ...l, date: String(l.date).slice(0, 10) })}>Edit</button>
              <button className="danger" onClick={() => remove(l)}>Delete</button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
