import React, { useState } from 'react'
import { config } from '../api.js'

export default function Settings({ settings, act, refresh, setSettings }) {
  const [cfg, setCfg] = useState(config.get())
  const [s, setS] = useState({ ZIG_PER_USD: '', BUY_SPREAD_PCT: '', SELL_SPREAD_PCT: '', MANUAL_USD_PER_OZ: '', SELL_BASIS: 'fidelity', ...settings })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const saveCfg = async () => { config.set(cfg); setMsg('Connection saved. Loading…'); await refresh(true); setMsg('Connected.') }
  const saveSettings = async () => {
    setBusy(true); setMsg(null)
    try {
      const out = { ZIG_PER_USD: Number(s.ZIG_PER_USD), BUY_SPREAD_PCT: Number(s.BUY_SPREAD_PCT), SELL_SPREAD_PCT: Number(s.SELL_SPREAD_PCT), MANUAL_USD_PER_OZ: s.MANUAL_USD_PER_OZ === '' ? '' : Number(s.MANUAL_USD_PER_OZ), SELL_BASIS: s.SELL_BASIS }
      const r = await act('saveSettings', { settings: out })
      if (!r.queued) setSettings(r)
      setMsg('Settings saved.')
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  const f = (k) => ({ value: s[k] ?? '', onChange: e => setS(x => ({ ...x, [k]: e.target.value })) })

  return (
    <section className="section">
      {msg && <div className="notice">{msg}</div>}
      <h2>Connection to your Google Sheet</h2>
      <div className="form" style={{ marginBottom: 22 }}>
        <div className="field"><label>Apps Script web app URL</label><input value={cfg.url || ''} onChange={e => setCfg({ ...cfg, url: e.target.value.trim() })} placeholder="https://script.google.com/macros/s/…/exec" /></div>
        <div className="field"><label>Team PIN</label><input type="password" inputMode="numeric" value={cfg.pin || ''} onChange={e => setCfg({ ...cfg, pin: e.target.value })} /></div>
        <button className="primary" onClick={saveCfg} disabled={!cfg.url}>Save connection</button>
        <p className="hint">Each team member installs the app and enters the same URL and PIN. See SETUP.md for how to deploy the script.</p>
      </div>

      <h2>How stock is valued</h2>
      <div className="form" style={{ marginBottom: 22 }}>
        <div className="field"><label>Sell price basis</label>
          <select {...f('SELL_BASIS')}>
            <option value="fidelity">Fidelity Gold Refinery band for the lot's purity (recommended)</option>
            <option value="spot">International spot minus my selling spread</option>
          </select>
          <span className="hint">Fidelity is the sole licensed buyer, so its daily list is the price you actually receive. Spot is useful if you sell elsewhere or want a reference.</span></div>
      </div>

      <h2>Rates and spreads</h2>
      <div className="form">
        <div className="field"><label>ZiG per USD</label><input type="number" inputMode="decimal" step="0.01" {...f('ZIG_PER_USD')} /><span className="hint">Update from the RBZ interbank rate. Used for all ZiG conversions.</span></div>
        <div className="two">
          <div className="field"><label>Buying spread (% vs spot)</label><input type="number" inputMode="decimal" step="0.5" {...f('BUY_SPREAD_PCT')} /></div>
          <div className="field"><label>Selling spread (% vs spot)</label><input type="number" inputMode="decimal" step="0.5" {...f('SELL_SPREAD_PCT')} /></div>
        </div>
        <div className="field"><label>Manual spot override (USD per oz)</label><input type="number" inputMode="decimal" {...f('MANUAL_USD_PER_OZ')} placeholder="Leave blank to use the live feed" /><span className="hint">Use this if the API is down or you want to price off a specific quote.</span></div>
        <button className="primary" onClick={saveSettings} disabled={busy}>Save settings</button>
      </div>
    </section>
  )
}
