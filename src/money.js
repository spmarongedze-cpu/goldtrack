export const OZ = 31.1034768

export function fmt(n, currency = 'USD', digits = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  const s = Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return currency === 'ZiG' ? `ZiG ${s}` : `$${s}`
}

export function grams(n) {
  return `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 })} g`
}

// Cost of a lot in USD per gram, regardless of the currency it was bought in
export function costUsd(lot, zig) {
  const p = Number(lot.buy_price_per_g)
  return lot.currency === 'ZiG' ? p / zig : p
}

// Current spot value per gram for a purity, USD
export function spotUsd(prices, purity) {
  return prices.usdPerG24 * (Number(purity) / 24)
}

export function timeAgo(iso) {
  if (!iso) return ''
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(iso).toLocaleDateString()
}

// Fidelity band for a lot's purity %. Below 75% there is no FGR band.
export function fgrBand(purityPct) {
  const p = Number(purityPct)
  if (p >= 90) return 'sg90'
  if (p >= 85) return 'sg85'
  if (p >= 80) return 'sg80'
  if (p >= 75) return 'sg75'
  return null
}
export const BAND_LABEL = { sg90: 'SG 90%+', sg85: 'SG 85–90%', sg80: 'SG 80–85%', sg75: 'SG 75–80%', sample: 'Sample 5–10 g', fire_assay: 'Fire assay cash' }

// Purity % for a lot: explicit purity_pct if given, otherwise from karat
export function purityPct(lot) {
  return lot.purity_pct ? Number(lot.purity_pct) : Number(lot.purity_k) / 24 * 100
}

// What you'd sell a lot for today, USD per gram, and where that number came from.
// basis 'fidelity' → FGR band for the lot's purity (falls back to spot if no list or no band)
// basis 'spot'     → spot for the purity × (1 + sell spread)
export function sellUsd(lot, prices, fidelity, basis = prices?.sellBasis || 'fidelity') {
  const band = fgrBand(purityPct(lot))
  if (basis === 'fidelity' && fidelity?.ok && band && fidelity.bands[band] > 0) {
    return { price: fidelity.bands[band], source: 'FGR ' + BAND_LABEL[band] }
  }
  const spot = prices.usdPerG24 * (purityPct(lot) / 100)
  return { price: spot * (1 + prices.sellSpreadPct / 100), source: `spot ${prices.sellSpreadPct}%` }
}
