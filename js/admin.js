/* Varauskalenterin ylläpito
 * Varaukset tallennetaan tiedostoon data/varaukset.json GitHub-repositoriossa GitHubin API:n kautta.
 * GitHub-avain on tallennettu tiedostoon data/admin-config.json ylläpidon salasanalla salattuna
 * (PBKDF2-SHA256 600 000 kierrosta + AES-GCM 256). Salasanaa tai avainta ei tallenneta selaimeen.
 */
(function () {
  'use strict';

  var DEFAULT_OWNER = 'JariPeltola';
  var DEFAULT_REPO = 'astiavuokraus-lahti';
  var CONFIG_PATH = 'data/admin-config.json';
  var DATA_PATH = 'data/varaukset.json';
  var ITER = 600000;

  var $ = function (id) { return document.getElementById(id); };
  var session = null;     // { token, owner, repo, branch }
  var encConfig = null;   // salattu konfiguraatio
  var data = { updated: null, bookings: [] };
  var dataSha = null;
  var cal = null;

  /* ---------- apurit ---------- */
  function show(view) {
    ['login', 'setup', 'editor'].forEach(function (v) { $('view-' + v).hidden = v !== view; });
    $('logout').hidden = view !== 'editor';
  }
  function msg(text, type) {
    var m = $('msg');
    if (!text) { m.hidden = true; return; }
    m.textContent = text; m.className = 'msg' + (type ? ' msg-' + type : ''); m.hidden = false;
    if (type === 'ok') setTimeout(function () { if (m.textContent === text) m.hidden = true; }, 7000);
  }
  function b64FromBytes(bytes) {
    var s = ''; var arr = new Uint8Array(bytes);
    for (var i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function bytesFromB64(b64) {
    var s = atob(b64.replace(/\s/g, '')); var a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function utf8ToB64(str) { return b64FromBytes(new TextEncoder().encode(str)); }
  function b64ToUtf8(b64) { return new TextDecoder().decode(bytesFromB64(b64)); }
  function todayIso() { var t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
  var fiDate = window.Varauskalenteri.fiDate;

  /* ---------- salaus ---------- */
  async function deriveKey(password, salt) {
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(obj, password) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(password, salt);
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64FromBytes(salt), iv: b64FromBytes(iv), data: b64FromBytes(ct) };
  }
  async function decrypt(conf, password) {
    var key = await deriveKey(password, bytesFromB64(conf.salt));
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesFromB64(conf.iv) }, key, bytesFromB64(conf.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  /* ---------- GitHub API ---------- */
  function gh(s, method, path, body) {
    return fetch('https://api.github.com/repos/' + s.owner + '/' + s.repo + path, {
      method: method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + s.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  async function getFile(s, path) {
    var r = await gh(s, 'GET', '/contents/' + path + '?ref=' + encodeURIComponent(s.branch) + '&t=' + Date.now());
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GitHub ' + r.status);
    var j = await r.json();
    return { sha: j.sha, text: b64ToUtf8(j.content) };
  }
  async function putFile(s, path, text, sha, message) {
    var body = { message: message, content: utf8ToB64(text), branch: s.branch };
    if (sha) body.sha = sha;
    var r = await gh(s, 'PUT', '/contents/' + path, body);
    if (r.status === 409 || r.status === 422) throw new Error('conflict');
    if (!r.ok) throw new Error('GitHub ' + r.status);
    var j = await r.json();
    return j.content.sha;
  }

  /* ---------- käynnistys ---------- */
  async function init() {
    try {
      var r = await fetch(CONFIG_PATH + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) { encConfig = await r.json(); show('login'); return; }
    } catch (e) { /* ei konfiguraatiota */ }
    // käyttöönotto
    var host = location.hostname, owner = DEFAULT_OWNER, repo = DEFAULT_REPO;
    if (/\.github\.io$/.test(host)) {
      owner = host.split('.')[0];
      var seg = location.pathname.split('/').filter(Boolean)[0];
      if (seg && !/\.html$/.test(seg)) repo = seg;
    }
    $('s-owner').value = owner; $('s-repo').value = repo;
    show('setup');
  }

  $('setup-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var pw = $('s-pw').value;
    if (pw !== $('s-pw2').value) { msg('Salasanat eivät täsmää.', 'err'); return; }
    var s = { token: $('s-token').value.trim(), owner: $('s-owner').value.trim(), repo: $('s-repo').value.trim(), branch: $('s-branch').value.trim() };
    var btn = e.submitter; btn.disabled = true; msg('Tarkistetaan GitHub-yhteyttä…');
    try {
      var r = await gh(s, 'GET', '');
      if (!r.ok) throw new Error(r.status === 404 || r.status === 401 ? 'Avain tai repositorio ei kelpaa (' + r.status + ').' : 'GitHub ' + r.status);
      var repoInfo = await r.json();
      if (repoInfo.permissions && !repoInfo.permissions.push) throw new Error('Avaimella ei ole kirjoitusoikeutta repositorioon.');
      msg('Salataan avainta…');
      var conf = await encrypt(s, pw);
      var existing = await getFile(s, CONFIG_PATH);
      await putFile(s, CONFIG_PATH, JSON.stringify(conf, null, 2) + '\n', existing && existing.sha, 'Ylläpidon käyttöönotto');
      encConfig = conf; session = s;
      e.target.reset();
      await openEditor();
      msg('Käyttöönotto valmis. Jatkossa kirjaudu pelkällä salasanalla.', 'ok');
    } catch (err) {
      msg('Käyttöönotto epäonnistui: ' + err.message, 'err');
    } finally { btn.disabled = false; }
  });

  $('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = e.submitter; btn.disabled = true; msg('Kirjaudutaan…');
    try {
      session = await decrypt(encConfig, $('login-pw').value);
    } catch (err) {
      msg('Väärä salasana.', 'err'); btn.disabled = false; return;
    }
    $('login-pw').value = '';
    try { await openEditor(); msg(''); }
    catch (err) { msg('Varauksia ei voitu ladata: ' + err.message, 'err'); }
    btn.disabled = false;
  });

  $('logout').addEventListener('click', function () {
    session = null; data = { bookings: [] }; dataSha = null; resetForm(); show('login'); msg('Kirjauduttu ulos.', 'ok');
  });

  async function loadData() {
    var f = await getFile(session, DATA_PATH);
    if (f) { data = JSON.parse(f.text); dataSha = f.sha; }
    else { data = { updated: null, bookings: [] }; dataSha = null; }
    if (!Array.isArray(data.bookings)) data.bookings = [];
  }

  async function openEditor() {
    await loadData();
    show('editor');
    if (!cal) cal = window.Varauskalenteri.create($('admin-calendar'));
    refresh();
  }

  async function save(message) {
    data.bookings.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    data.updated = new Date().toISOString();
    try {
      dataSha = await putFile(session, DATA_PATH, JSON.stringify(data, null, 2) + '\n', dataSha, message);
      refresh();
      msg('Tallennettu. Julkinen kalenteri päivittyy noin minuutin kuluessa.', 'ok');
      return true;
    } catch (err) {
      if (err.message === 'conflict') {
        await loadData(); refresh();
        msg('Varauksia oli muutettu toisaalla samaan aikaan. Tiedot ladattiin uudelleen – tarkista ja tee muutos uudestaan.', 'err');
        return 'conflict';
      }
      msg('Tallennus epäonnistui: ' + err.message, 'err');
      return false;
    }
  }

  /* ---------- lista ja esikatselu ---------- */
  function refresh() {
    cal.setBookings(data.bookings);
    var list = $('booking-list'); list.innerHTML = '';
    var today = todayIso(), showPast = $('show-past').checked;
    var items = data.bookings.filter(function (b) { return showPast || (b.end || b.start) >= today; });
    if (!items.length) {
      var p = document.createElement('p'); p.className = 'empty-list';
      p.textContent = data.bookings.length ? 'Ei tulevia varauksia.' : 'Ei varauksia vielä.';
      list.appendChild(p); return;
    }
    items.forEach(function (b) {
      var row = document.createElement('div'); row.className = 'bk' + ((b.end || b.start) < today ? ' past' : '');
      var bar = document.createElement('span'); bar.className = 'bar s' + b.sets;
      var mid = document.createElement('div');
      var dt = document.createElement('div'); dt.className = 'bk-dates';
      dt.textContent = fiDate(b.start) + (b.end !== b.start ? ' – ' + fiDate(b.end) : '') + ' · ' + b.sets;
      mid.appendChild(dt);
      if (b.note) { var n = document.createElement('div'); n.className = 'bk-note'; n.textContent = b.note; mid.appendChild(n); }
      var act = document.createElement('div'); act.className = 'bk-actions';
      var ed = document.createElement('button'); ed.type = 'button'; ed.textContent = 'Muokkaa';
      ed.onclick = function () { editBooking(b.id); };
      var del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = 'Poista';
      del.onclick = function () { deleteBooking(b.id, del); };
      act.appendChild(ed); act.appendChild(del);
      row.appendChild(bar); row.appendChild(mid); row.appendChild(act);
      list.appendChild(row);
    });
  }
  $('show-past').addEventListener('change', refresh);

  /* ---------- lomake ---------- */
  function resetForm() {
    $('booking-form').reset(); $('b-id').value = ''; $('b-count').textContent = '0';
    $('form-title').textContent = 'Uusi varaus'; $('b-save').textContent = 'Tallenna varaus';
    $('b-cancel').hidden = true; $('overlap-warn').hidden = true;
  }
  function editBooking(id) {
    var b = data.bookings.find(function (x) { return x.id === id; }); if (!b) return;
    $('b-id').value = b.id; $('b-start').value = b.start; $('b-end').value = b.end || b.start;
    document.querySelector('input[name=sets][value="' + b.sets + '"]').checked = true;
    $('b-note').value = b.note || ''; $('b-count').textContent = (b.note || '').length;
    $('form-title').textContent = 'Muokkaa varausta'; $('b-save').textContent = 'Tallenna muutokset';
    $('b-cancel').hidden = false;
    var p = b.start.split('-'); cal.goTo(+p[0], +p[1] - 1);
    checkOverlap();
    $('booking-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function deleteBooking(id, btn) {
    var b = data.bookings.find(function (x) { return x.id === id; }); if (!b) return;
    if (!confirm('Poistetaanko varaus ' + fiDate(b.start) + (b.end !== b.start ? '–' + fiDate(b.end) : '') + ' (' + b.sets + ')?')) return;
    btn.disabled = true;
    var backup = data.bookings.slice();
    data.bookings = data.bookings.filter(function (x) { return x.id !== id; });
    if ((await save('Poistettu varaus ' + b.start)) === false) { data.bookings = backup; refresh(); }
    if ($('b-id').value === id) resetForm();
  }
  $('b-cancel').addEventListener('click', resetForm);
  $('b-note').addEventListener('input', function () { $('b-count').textContent = this.value.length; });
  $('b-start').addEventListener('change', function () {
    if (!$('b-end').value || $('b-end').value < this.value) $('b-end').value = this.value;
    var p = this.value.split('-'); if (p.length === 3) cal.goTo(+p[0], +p[1] - 1);
    checkOverlap();
  });
  $('b-end').addEventListener('change', checkOverlap);
  document.querySelectorAll('input[name=sets]').forEach(function (r) { r.addEventListener('change', checkOverlap); });

  function checkOverlap() {
    var w = $('overlap-warn'); w.hidden = true;
    var s = $('b-start').value, e = $('b-end').value || s, id = $('b-id').value;
    var setsEl = document.querySelector('input[name=sets]:checked');
    if (!s || !setsEl) return;
    var sets = +setsEl.value, over = [];
    var d = new Date(s + 'T12:00:00'), end = new Date(e + 'T12:00:00');
    while (d <= end) {
      var key = d.toISOString().slice(0, 10);
      var total = sets + data.bookings.filter(function (b) { return b.id !== id && b.start <= key && key <= b.end; })
        .reduce(function (t, b) { return t + b.sets; }, 0);
      if (total > 90) over.push(fiDate(key) + ' (' + total + ')');
      d.setDate(d.getDate() + 1);
    }
    if (over.length) {
      w.textContent = 'Huom: astiasto ylivarattu – yhteensä yli 90: ' + over.join(', ');
      w.hidden = false;
    }
  }

  $('booking-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var start = $('b-start').value, end = $('b-end').value || start;
    if (end < start) { msg('Päättymispäivä ei voi olla ennen alkamispäivää.', 'err'); return; }
    var sets = +document.querySelector('input[name=sets]:checked').value;
    var note = $('b-note').value.trim().slice(0, 200);
    var id = $('b-id').value;
    var btn = $('b-save'); btn.disabled = true; msg('Tallennetaan…');
    var backup = data.bookings.map(function (b) { return Object.assign({}, b); });
    if (id) {
      var b = data.bookings.find(function (x) { return x.id === id; });
      Object.assign(b, { start: start, end: end, sets: sets, note: note });
    } else {
      data.bookings.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), start: start, end: end, sets: sets, note: note });
    }
    var ok = await save((id ? 'Muokattu' : 'Uusi') + ' varaus ' + start + '–' + end + ' (' + sets + ')');
    if (ok === true) resetForm();
    else if (ok === false) { data.bookings = backup; refresh(); }
    // ok === 'conflict': tiedot on jo ladattu uudelleen
    btn.disabled = false;
  });

  /* ---------- salasanan vaihto ---------- */
  $('pw-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var pw = $('n-pw').value;
    if (pw !== $('n-pw2').value) { msg('Salasanat eivät täsmää.', 'err'); return; }
    var btn = e.submitter; btn.disabled = true; msg('Vaihdetaan salasanaa…');
    try {
      var conf = await encrypt(session, pw);
      var existing = await getFile(session, CONFIG_PATH);
      await putFile(session, CONFIG_PATH, JSON.stringify(conf, null, 2) + '\n', existing && existing.sha, 'Ylläpidon salasana vaihdettu');
      encConfig = conf; e.target.reset();
      msg('Salasana vaihdettu.', 'ok');
    } catch (err) { msg('Salasanan vaihto epäonnistui: ' + err.message, 'err'); }
    btn.disabled = false;
  });

  init();
})();
