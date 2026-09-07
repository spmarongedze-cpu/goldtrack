/**
 * GoldTrack – Google Sheets backend (Apps Script Web App)
 *
 * Sheets used (created by setup()):
 *   Lots      – stock register
 *   Sales     – sales log
 *   Settings  – key/value (ZiG rate, buy/sell spreads, manual price override, team PIN)
 *   PriceLog  – every fetched spot price (audit trail + history chart)
 *
 * Endpoints (all via doPost with JSON body {action, pin, ...}):
 *   prices, lots, addLot, updateLot, deleteLot, sales, addSale, settings, saveSettings, priceHistory
 *
 * After setup(), also run installDailyTrigger() (daily spot + Fidelity logging) and optionally
 * backfillHistory() (spot) and backfillFidelity() (FGR lists).
 *
 * Script Properties to set (Project Settings → Script properties):
 *   GOLDAPI_KEY        – from goldapi.io (primary source)
 *   METALPRICEAPI_KEY  – from metalpriceapi.com (fallback, optional)
 */

var TROY_OZ_GRAMS = 31.1034768;
var CACHE_SECONDS = 15 * 60; // re-fetch spot price at most every 15 minutes

// ---------- HTTP entry points ----------

function doGet(e) {
  return respond({ ok: true, app: 'GoldTrack', hint: 'POST JSON {action:...}' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var settings = getSettings_();
    if (settings.TEAM_PIN && String(body.pin) !== String(settings.TEAM_PIN)) {
      return respond({ ok: false, error: 'Wrong PIN' });
    }
    var out;
    switch (body.action) {
      case 'prices':       out = getPrices_(settings, body.force); break;
      case 'priceHistory': out = getPriceHistory_(body.days || 7); break;
      case 'fidelity':     out = getFidelity_(body.force); break;
      case 'fidelityHistory': out = getFidelityHistory_(body.days || 30); break;
      case 'lots':         out = readRows_('Lots'); break;
      case 'addLot':       out = addRow_('Lots', body.lot, ['id','date','supplier','weight_g','purity_k','purity_pct','buy_price_per_g','currency','notes','status']); break;
      case 'updateLot':    out = updateRow_('Lots', body.lot); break;
      case 'deleteLot':    out = deleteRow_('Lots', body.id); break;
      case 'sales':        out = readRows_('Sales'); break;
      case 'addSale':      out = addSale_(body.sale); break;
      case 'settings':     out = settings; break;
      case 'saveSettings': out = saveSettings_(body.settings); break;
      default:             return respond({ ok: false, error: 'Unknown action ' + body.action });
    }
    return respond({ ok: true, data: out });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- One-time setup ----------

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, 'Lots', ['id','date','supplier','weight_g','purity_k','purity_pct','buy_price_per_g','currency','notes','status']);
  ensureSheet_(ss, 'Sales', ['id','date','lot_id','weight_g','purity_k','sell_price_per_g','currency','buyer','notes','cost_per_g','profit_usd']);
  ensureSheet_(ss, 'PriceLog', ['timestamp','source','usd_per_oz','usd_per_g_24k','zig_rate']);
  ensureSheet_(ss, 'FidelityLog', ['date','sg90','sg85','sg80','sg75','sample','fire_assay','source_url','fetched_at']);
  var s = ensureSheet_(ss, 'Settings', ['key','value']);
  var defaults = {
    ZIG_PER_USD: 26.5,            // update from RBZ – manual
    BUY_SPREAD_PCT: -5,           // what you pay vs spot (negative = below spot)
    SELL_SPREAD_PCT: -2,          // what you sell for vs spot (used when SELL_BASIS = spot)
    SELL_BASIS: 'fidelity',       // 'fidelity' = value stock at the FGR band for its purity; 'spot' = spot + SELL_SPREAD_PCT
    MANUAL_USD_PER_OZ: '',        // set to override the API price (leave blank to use API)
    TEAM_PIN: '1234'              // shared PIN for the app; change it
  };
  var existing = getSettings_();
  Object.keys(defaults).forEach(function (k) {
    if (existing[k] === undefined) s.appendRow([k, defaults[k]]);
  });
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------- Prices ----------

function getPrices_(settings, force) {
  var cache = CacheService.getScriptCache();
  var cached = force ? null : cache.get('spot');
  var spot = cached ? JSON.parse(cached) : null;

  if (!spot) {
    spot = fetchSpot_();
    if (spot) {
      cache.put('spot', JSON.stringify(spot), CACHE_SECONDS);
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceLog')
        .appendRow([new Date(), spot.source, spot.usdPerOz, spot.usdPerOz / TROY_OZ_GRAMS, Number(settings.ZIG_PER_USD)]);
    }
  }

  var manual = Number(settings.MANUAL_USD_PER_OZ);
  var usdPerOz = manual > 0 ? manual : (spot ? spot.usdPerOz : null);
  if (!usdPerOz) throw new Error('No price available – check API keys or set MANUAL_USD_PER_OZ');

  var usdPerG24 = usdPerOz / TROY_OZ_GRAMS;
  var zig = Number(settings.ZIG_PER_USD) || 0;
  var purities = { 24: 1, 22: 22 / 24, 21: 21 / 24, 18: 18 / 24, 14: 14 / 24, 9: 9 / 24 };
  var perGram = {};
  Object.keys(purities).forEach(function (k) {
    var usd = usdPerG24 * purities[k];
    perGram[k] = { usd: usd, zig: usd * zig };
  });

  return {
    source: manual > 0 ? 'manual override' : spot.source,
    fetchedAt: manual > 0 ? new Date().toISOString() : spot.fetchedAt,
    usdPerOz: usdPerOz,
    usdPerG24: usdPerG24,
    zigPerUsd: zig,
    perGram: perGram,
    buySpreadPct: Number(settings.BUY_SPREAD_PCT) || 0,
    sellSpreadPct: Number(settings.SELL_SPREAD_PCT) || 0,
    sellBasis: settings.SELL_BASIS || 'fidelity'
  };
}

function fetchSpot_() {
  var props = PropertiesService.getScriptProperties();
  var goldKey = props.getProperty('GOLDAPI_KEY');
  var mpKey = props.getProperty('METALPRICEAPI_KEY');

  // Primary: goldapi.io – returns USD per troy ounce
  if (goldKey) {
    try {
      var r = UrlFetchApp.fetch('https://www.goldapi.io/api/XAU/USD', {
        headers: { 'x-access-token': goldKey }, muteHttpExceptions: true
      });
      if (r.getResponseCode() === 200) {
        var j = JSON.parse(r.getContentText());
        if (j.price) return { source: 'goldapi.io', usdPerOz: Number(j.price), fetchedAt: new Date().toISOString() };
      }
    } catch (e) { Logger.log('goldapi failed: ' + e); }
  }

  // Fallback: metalpriceapi.com – returns XAU per USD, invert for USD per ounce
  if (mpKey) {
    try {
      var r2 = UrlFetchApp.fetch('https://api.metalpriceapi.com/v1/latest?api_key=' + mpKey + '&base=USD&currencies=XAU', { muteHttpExceptions: true });
      if (r2.getResponseCode() === 200) {
        var j2 = JSON.parse(r2.getContentText());
        if (j2.rates && j2.rates.XAU) return { source: 'metalpriceapi.com', usdPerOz: 1 / Number(j2.rates.XAU), fetchedAt: new Date().toISOString() };
      }
    } catch (e2) { Logger.log('metalpriceapi failed: ' + e2); }
  }
  return null;
}

function getPriceHistory_(days) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceLog');
  var last = sh.getLastRow();
  if (last < 2) return [];
  var rows = sh.getRange(2, 1, last - 1, 5).getValues();
  var since = Date.now() - days * 86400000;
  var out = [];
  var lastKey = null;
  rows.forEach(function (r) {
    var t = new Date(r[0]);
    if (t.getTime() < since || !r[3]) return;
    // Week view keeps every reading; longer views keep the last reading of each day
    var key = days <= 7 ? t.toISOString() : t.toISOString().slice(0, 10);
    var point = { t: t.toISOString(), usdPerG24: Number(r[3]), zig: Number(r[4]) || 0 };
    if (key === lastKey) out[out.length - 1] = point; else out.push(point);
    lastKey = key;
  });
  return out;
}

/**
 * Run once, then it logs the price every day at ~06:00 so the year chart fills in
 * even on days nobody opens the app. (Triggers → or just run installDailyTrigger.)
 */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'logDailyPrice') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('logDailyPrice').timeBased().everyDays(1).atHour(6).create();
}

function logDailyPrice() {
  getPrices_(getSettings_(), true);
  try { getFidelity_(true); } catch (e) { Logger.log('Fidelity fetch failed: ' + e); }
}

/**
 * Optional one-off: fills the PriceLog with the past year from goldapi.io's
 * historical endpoint (daily for 30 days, then weekly). Uses ~80 API calls.
 */
function backfillHistory() {
  var key = PropertiesService.getScriptProperties().getProperty('GOLDAPI_KEY');
  if (!key) throw new Error('GOLDAPI_KEY not set');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PriceLog');
  var zig = Number(getSettings_().ZIG_PER_USD) || 0;
  var dates = [];
  for (var d = 365; d > 30; d -= 7) dates.push(d);
  for (var d2 = 30; d2 >= 1; d2--) dates.push(d2);
  var rows = [];
  dates.forEach(function (daysAgo) {
    var dt = new Date(Date.now() - daysAgo * 86400000);
    var ymd = Utilities.formatDate(dt, 'UTC', 'yyyyMMdd');
    try {
      var r = UrlFetchApp.fetch('https://www.goldapi.io/api/XAU/USD/' + ymd, { headers: { 'x-access-token': key }, muteHttpExceptions: true });
      if (r.getResponseCode() === 200) {
        var j = JSON.parse(r.getContentText());
        if (j.price) rows.push([dt, 'goldapi.io (history)', Number(j.price), Number(j.price) / TROY_OZ_GRAMS, zig]);
      }
    } catch (e) { Logger.log(ymd + ' failed: ' + e); }
    Utilities.sleep(300);
  });
  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
    sh.getRange(2, 1, sh.getLastRow() - 1, 5).sort(1);
  }
  return rows.length;
}


// ---------- Fidelity Gold Refinery daily buying prices ----------
// FGR publishes a daily price list; Mining Zimbabwe republishes it as an HTML
// table at a stable URL pattern. We scrape the newest post once a day and keep
// every list in the FidelityLog sheet, so the app always has the last good list
// even if the site changes or is down.

var FGR_CATEGORY_URL = 'https://miningzimbabwe.com/category/fidelity-gold-prices/';
var FGR_BANDS = ['sg90','sg85','sg80','sg75','sample','fire_assay'];

function getFidelity_(force) {
  var cache = CacheService.getScriptCache();
  var latest = latestFidelityRow_();
  var today = Utilities.formatDate(new Date(), 'Africa/Harare', 'yyyy-MM-dd');
  var needFetch = force || !latest || latest.date < today;
  var tried = cache.get('fgr_tried');
  var error = null;

  if (needFetch && (force || !tried)) {
    cache.put('fgr_tried', '1', 3 * 60 * 60); // don't hammer the site: one attempt per 3 hours
    try {
      var fetched = fetchFidelity_();
      if (fetched && (!latest || fetched.date > latest.date)) {
        SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FidelityLog')
          .appendRow([fetched.date].concat(FGR_BANDS.map(function (b) { return fetched[b]; })).concat([fetched.source_url, new Date()]));
        latest = fetched;
      }
    } catch (e) { error = String(e); }
  }
  if (!latest) return { ok: false, error: error || 'No Fidelity price list stored yet' };
  var ageDays = Math.round((new Date(today) - new Date(latest.date)) / 86400000);
  return { ok: true, date: latest.date, bands: FGR_BANDS.reduce(function (o, b) { o[b] = Number(latest[b]); return o; }, {}),
           sourceUrl: latest.source_url, ageDays: ageDays, stale: ageDays > 3, error: error };
}

function latestFidelityRow_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FidelityLog');
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().filter(function (r) { return r[0]; });
  rows.sort(function (a, b) { return String(a[0]) < String(b[0]) ? 1 : -1; });
  var r = rows[0];
  if (!r) return null;
  return { date: toYmd_(r[0]), sg90: r[1], sg85: r[2], sg80: r[3], sg75: r[4], sample: r[5], fire_assay: r[6], source_url: r[7] };
}

function toYmd_(v) {
  return v instanceof Date ? Utilities.formatDate(v, 'Africa/Harare', 'yyyy-MM-dd') : String(v).slice(0, 10);
}

function fetchFidelity_() {
  var listing = UrlFetchApp.fetch(FGR_CATEGORY_URL, { muteHttpExceptions: true, followRedirects: true });
  if (listing.getResponseCode() !== 200) throw new Error('Listing HTTP ' + listing.getResponseCode());
  var m = listing.getContentText().match(/https:\/\/miningzimbabwe\.com\/gold-buying-prices[^"'\s]*?(\d{1,2})-([a-z]+)-(\d{4})\//i);
  if (!m) throw new Error('No price post found on listing page');
  var url = m[0];
  var out = parseFidelityPost_(url);
  if (!out) throw new Error('No SG 90% price could be parsed at ' + url);
  return out;
}

function getFidelityHistory_(days) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FidelityLog');
  if (!sh || sh.getLastRow() < 2) return [];
  var since = Date.now() - days * 86400000;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues()
    .filter(function (r) { return r[0] && new Date(r[0]).getTime() >= since; })
    .map(function (r) { return { date: toYmd_(r[0]), sg90: r[1], fire_assay: r[6] }; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}

/** One-off: pull older FGR lists from the listing pages (about 10 per page). */
function backfillFidelity(pages) {
  pages = pages || 6;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FidelityLog');
  var have = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { have[toYmd_(r[0])] = 1; });
  var added = 0;
  for (var p = 1; p <= pages; p++) {
    var url = FGR_CATEGORY_URL + (p > 1 ? 'page/' + p + '/' : '');
    var html = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
    var re = /https:\/\/miningzimbabwe\.com\/gold-buying-prices[^"'\s]*?\d{1,2}-[a-z]+-\d{4}\//gi, m, seen = {};
    while ((m = re.exec(html))) {
      if (seen[m[0]]) continue; seen[m[0]] = 1;
      try {
        // Reuse the single-post parser by temporarily pointing it at this URL
        var fetched = parseFidelityPost_(m[0]);
        if (fetched && !have[fetched.date]) {
          sh.appendRow([fetched.date].concat(FGR_BANDS.map(function (b) { return fetched[b]; })).concat([fetched.source_url, new Date()]));
          have[fetched.date] = 1; added++;
        }
      } catch (e) { Logger.log(m[0] + ': ' + e); }
      Utilities.sleep(400);
    }
  }
  return added;
}

function parseFidelityPost_(url) {
  var m = url.match(/(\d{1,2})-([a-z]+)-(\d{4})\//i);
  var months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  var date = m[3] + '-' + ('0' + (months.indexOf(m[2].toLowerCase()) + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  var html = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true }).getContentText();
  var out = { date: date, source_url: url };
  var rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi, row;
  while ((row = rowRe.exec(html))) {
    var cells = [], cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, c;
    while ((c = cellRe.exec(row[1]))) cells.push(c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim());
    if (cells.length < 2) continue;
    var label = cells[0].toLowerCase(), price = parseFloat(String(cells[1]).replace(/[^0-9.]/g, ''));
    if (!(price > 0)) continue;
    var key = /fire/.test(label) ? 'fire_assay' : /sample/.test(label) ? 'sample' : /90/.test(label) ? 'sg90' : /85/.test(label) ? 'sg85' : /80/.test(label) ? 'sg80' : /75/.test(label) ? 'sg75' : null;
    if (key && out[key] === undefined) out[key] = price;
  }
  return out.sg90 === undefined ? null : out;
}

// ---------- Generic sheet helpers ----------

function readRows_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
    return o;
  });
}

function addRow_(name, obj, headers) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!obj.id) obj.id = Utilities.getUuid();
  if (!obj.status && name === 'Lots') obj.status = 'in stock';
  sh.appendRow(headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
  return obj;
}

function findRow_(sh, id) {
  var ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function updateRow_(name, obj) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = findRow_(sh, obj.id);
  if (row < 0) throw new Error('Not found: ' + obj.id);
  var current = sh.getRange(row, 1, 1, headers.length).getValues()[0];
  var next = headers.map(function (h, i) { return obj[h] === undefined ? current[i] : obj[h]; });
  sh.getRange(row, 1, 1, headers.length).setValues([next]);
  return obj;
}

function deleteRow_(name, id) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  var row = findRow_(sh, id);
  if (row < 0) throw new Error('Not found: ' + id);
  sh.deleteRow(row);
  return { id: id };
}

// ---------- Sales (reduces lot weight, records profit) ----------

function addSale_(sale) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var lots = ss.getSheetByName('Lots');
    var row = findRow_(lots, sale.lot_id);
    if (row < 0) throw new Error('Lot not found');
    var headers = lots.getRange(1, 1, 1, lots.getLastColumn()).getValues()[0];
    var lot = {};
    lots.getRange(row, 1, 1, headers.length).getValues()[0].forEach(function (v, i) { lot[headers[i]] = v; });

    var w = Number(sale.weight_g);
    if (w <= 0 || w > Number(lot.weight_g) + 1e-9) throw new Error('Weight exceeds lot balance (' + lot.weight_g + ' g)');

    // Cost basis in USD per gram (convert if lot was bought in ZiG)
    var settings = getSettings_();
    var zig = Number(settings.ZIG_PER_USD) || 1;
    var costUsd = lot.currency === 'ZiG' ? Number(lot.buy_price_per_g) / zig : Number(lot.buy_price_per_g);
    var sellUsd = sale.currency === 'ZiG' ? Number(sale.sell_price_per_g) / zig : Number(sale.sell_price_per_g);
    var profit = (sellUsd - costUsd) * w;

    sale.id = Utilities.getUuid();
    sale.purity_k = lot.purity_k;
    sale.cost_per_g = costUsd;
    sale.profit_usd = profit;
    ss.getSheetByName('Sales').appendRow(['id','date','lot_id','weight_g','purity_k','sell_price_per_g','currency','buyer','notes','cost_per_g','profit_usd']
      .map(function (h) { return sale[h] === undefined ? '' : sale[h]; }));

    var remaining = Number(lot.weight_g) - w;
    lots.getRange(row, headers.indexOf('weight_g') + 1).setValue(remaining);
    lots.getRange(row, headers.indexOf('status') + 1).setValue(remaining < 0.001 ? 'sold' : 'in stock');
    return sale;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Settings ----------

function getSettings_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  if (!sh) return {};
  var out = {};
  sh.getDataRange().getValues().slice(1).forEach(function (r) { if (r[0] !== '') out[r[0]] = r[1]; });
  return out;
}

function saveSettings_(obj) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  var values = sh.getDataRange().getValues();
  Object.keys(obj).forEach(function (k) {
    var found = false;
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === k) { sh.getRange(i + 1, 2).setValue(obj[k]); found = true; break; }
    }
    if (!found) sh.appendRow([k, obj[k]]);
  });
  CacheService.getScriptCache().remove('spot');
  return getSettings_();
}
