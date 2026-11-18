import { parseTireSize, tireDimensions, compareTires, suggestPlusSizes, formatTireSize, STANDARD_WIDTHS, STANDARD_ASPECTS, STANDARD_RIMS } from './tire.js';
import { LANGS, messages, detectLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = { lang: detectLang(location.search, navigator.language), imperial: false };

const t = (k) => messages[state.lang][k] ?? messages.en[k] ?? k;
const num = (v, d = 1) => v.toLocaleString(state.lang, { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), d);
const len = (mm) => (state.imperial ? `${num(mm / 25.4, 2)} ${t('inch')}` : `${num(mm, 1)} ${t('mm')}`);
const dlen = (mm) => (state.imperial ? `${signed(mm / 25.4, 2)} ${t('inch')}` : `${signed(mm, 1)} ${t('mm')}`);

const sides = {
  old: { q: $('old-q'), w: $('old-w'), a: $('old-a'), r: $('old-r'), err: $('old-err'), res: $('old-res') },
  new: { q: $('new-q'), w: $('new-w'), a: $('new-a'), r: $('new-r'), err: $('new-err'), res: $('new-res') },
};

function fillSelect(sel, values, current) {
  const list = values.includes(current) ? values : [...values, current].filter((v) => v != null).sort((x, y) => x - y);
  sel.innerHTML = '<option value="">—</option>' + list.map((v) => `<option value="${v}">${v}</option>`).join('');
  sel.value = current == null ? '' : String(current);
}

function syncSelects(side, parsed) {
  const s = sides[side];
  if (parsed && parsed.type === 'metric') {
    fillSelect(s.w, STANDARD_WIDTHS, parsed.width);
    fillSelect(s.a, STANDARD_ASPECTS, parsed.aspect);
    fillSelect(s.r, STANDARD_RIMS, parsed.rim);
  } else if (parsed) {
    fillSelect(s.w, STANDARD_WIDTHS, null);
    fillSelect(s.a, STANDARD_ASPECTS, null);
    fillSelect(s.r, STANDARD_RIMS, parsed.rim);
  }
}

function setQuick(side, text) {
  sides[side].q.value = text;
  syncSelects(side, parseTireSize(text));
}

function readSide(side) {
  const s = sides[side];
  const parsed = parseTireSize(s.q.value);
  const bad = s.q.value.trim() !== '' && !parsed;
  s.err.hidden = !bad;
  s.err.textContent = bad ? t('invalid') : '';
  s.q.setAttribute('aria-invalid', bad ? 'true' : 'false');
  return parsed;
}

function renderDims(side, d) {
  const el = sides[side].res;
  if (!d) { el.innerHTML = ''; return; }
  const rows = [
    ['diameter', len(d.diameterMm)],
    ['sidewall', len(d.sidewallMm)],
    ['tireWidth', len(d.widthMm)],
    ['circumference', len(d.circumferenceMm)],
    ['revsKm', num(d.revsPerKm, 1)],
    ['revsMile', num(d.revsPerMile, 1)],
    ['rimDia', len(d.rimMm)],
  ];
  el.innerHTML = rows.map(([k, v]) => `<div><dt>${t(k)}</dt><dd>${v}</dd></div>`).join('');
}

function renderCompare(a, b) {
  const body = $('cmp-body');
  if (!a || !b) { body.innerHTML = ''; return null; }
  const unit = state.imperial ? 'mph' : 'kmh';
  const c = compareTires(a, b, { unit });
  const pct = `${signed(c.diameterDiffPct, 2)}%`;
  const verdict = c.exceedsTolerance ? `<p class="note warn" role="alert">${t('warnOver')}</p>` : `<p class="note ok">${t('okUnder')}</p>`;
  const speedoMsg = c.speedometerReads === 'low' ? t('speedoLow') : c.speedometerReads === 'high' ? t('speedoHigh') : t('speedoOk');
  const u = t(unit);
  body.innerHTML = `
    <dl class="res cmpres">
      <div><dt>${t('diffDiameter')}</dt><dd class="${c.exceedsTolerance ? 'bad' : ''}">${dlen(c.diameterDiffMm)} (${pct})</dd></div>
      <div><dt>${t('diffSidewall')}</dt><dd>${dlen(c.sidewallDiffMm)}</dd></div>
      <div><dt>${t('diffWidth')}</dt><dd>${dlen(c.widthDiffMm)}</dd></div>
      <div><dt>${t('diffCirc')}</dt><dd>${dlen(c.circumferenceDiffMm)}</dd></div>
    </dl>
    ${verdict}
    <h3>${t('speedoTable')}</h3>
    <p class="note">${speedoMsg}</p>
    <div class="tw"><table>
      <thead><tr><th scope="col">${t('indicated')}, ${u}</th><th scope="col">${t('actual')}, ${u}</th><th scope="col">${t('difference')}</th></tr></thead>
      <tbody>${c.speedometer.map((r) => `<tr><th scope="row">${r.indicated}</th><td>${num(r.actual, 1)}</td><td>${signed(r.diff, 1)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  return c;
}

function renderPlus(a) {
  const body = $('plus-body');
  if (!a) { body.innerHTML = ''; return; }
  const list = suggestPlusSizes(a);
  if (!list.length) { body.innerHTML = `<p class="note">${t('plusNone')}</p>`; return; }
  body.innerHTML = `<div class="tw"><table>
    <thead><tr><th scope="col">${t('newTire')}</th><th scope="col">${t('diameter')}</th><th scope="col">${t('diffDiameter')}</th><th scope="col"><span class="sr">${t('use')}</span></th></tr></thead>
    <tbody>${list.map((s) => `<tr><th scope="row">${s.size}</th><td>${len(s.diameterMm)}</td><td>${dlen(s.diffMm)} (${signed(s.diffPct, 2)}%)</td>
      <td><button type="button" class="use" data-size="${s.size}">${t('use')}</button></td></tr>`).join('')}</tbody></table></div>`;
}

function update() {
  const a = readSide('old');
  const b = readSide('new');
  renderDims('old', tireDimensions(a));
  renderDims('new', tireDimensions(b));
  renderCompare(a, b);
  renderPlus(a);
  const p = new URLSearchParams();
  if (state.lang !== 'en') p.set('lang', state.lang);
  p.set('old', sides.old.q.value.trim());
  p.set('new', sides.new.q.value.trim());
  history.replaceState(null, '', `?${p}`);
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.title = `${t('title')} — ${t('subtitle')}`;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('u-mm').setAttribute('aria-pressed', String(!state.imperial));
  $('u-in').setAttribute('aria-pressed', String(state.imperial));
  for (const el of document.querySelectorAll('.l-width')) el.textContent = t('width');
}

function bindSide(side) {
  const s = sides[side];
  s.q.addEventListener('input', () => { syncSelects(side, parseTireSize(s.q.value)); update(); });
  const fromSelects = () => {
    if (s.w.value && s.a.value && s.r.value) setQuick(side, `${s.w.value}/${s.a.value} R${s.r.value}`);
    update();
  };
  [s.w, s.a, s.r].forEach((el) => el.addEventListener('change', fromSelects));
}

function init() {
  $('lang').innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
  $('lang').value = state.lang;
  $('lang').addEventListener('change', (e) => { state.lang = e.target.value; applyI18n(); update(); });
  const setUnits = (imp) => { state.imperial = imp; applyI18n(); update(); };
  $('u-mm').addEventListener('click', () => setUnits(false));
  $('u-in').addEventListener('click', () => setUnits(true));
  $('plus-body').addEventListener('click', (e) => {
    const b = e.target.closest('button.use');
    if (b) { setQuick('new', b.dataset.size); update(); }
  });
  bindSide('old');
  bindSide('new');
  setQuick('old', params.get('old') || '205/55R16');
  setQuick('new', params.get('new') || '225/45R17');
  applyI18n();
  update();
}

init();
