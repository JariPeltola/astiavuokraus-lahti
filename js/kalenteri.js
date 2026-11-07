/* Varauskalenteri – Paimelan Martat astiavuokraus
 * Lukee varaukset tiedostosta data/varaukset.json ja näyttää ne kuukausinäkymänä.
 * Värit: 30 = vaalea punainen, 60 = keskipunainen, 90 = tumma punainen.
 * Jos samalle päivälle on useita varauksia, setit lasketaan yhteen (enintään 90).
 */
(function () {
  'use strict';

  var MONTHS = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
    'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
  var DOW = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function fiDate(s) { var p = s.split('-'); return +p[2] + '.' + +p[1] + '.' + p[0]; }
  function todayIso() { var t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); }

  function setsLabel(total) {
    if (total >= 90) return 'Varattu';
    return total + ' varattu';
  }

  function create(root, opts) {
    opts = opts || {};
    var grid = root.querySelector('.cal-grid');
    var title = root.querySelector('.cal-title');
    var status = root.querySelector('.cal-status');
    var tooltip = document.getElementById(opts.tooltipId || 'cal-tooltip');
    var now = new Date();
    var state = { y: now.getFullYear(), m: now.getMonth(), bookings: [] };

    function bookingsOn(day) {
      return state.bookings.filter(function (b) { return b.start <= day && day <= (b.end || b.start); });
    }

    function render() {
      title.textContent = MONTHS[state.m] + ' ' + state.y;
      grid.innerHTML = '';
      DOW.forEach(function (d) {
        var h = document.createElement('div');
        h.className = 'cal-dow'; h.setAttribute('role', 'columnheader'); h.textContent = d;
        grid.appendChild(h);
      });
      var first = new Date(state.y, state.m, 1);
      var offset = (first.getDay() + 6) % 7; // maanantai ensin
      var days = new Date(state.y, state.m + 1, 0).getDate();
      var today = todayIso();
      for (var i = 0; i < offset; i++) {
        var e = document.createElement('div'); e.className = 'cal-day empty'; grid.appendChild(e);
      }
      for (var d = 1; d <= days; d++) {
        var key = iso(state.y, state.m, d);
        var cell = document.createElement('div');
        cell.className = 'cal-day';
        cell.setAttribute('role', 'gridcell');
        if (key < today) cell.classList.add('past');
        if (key === today) cell.classList.add('today');
        var num = document.createElement('span'); num.className = 'd'; num.textContent = d;
        cell.appendChild(num);
        var list = bookingsOn(key);
        var dayTotal = Math.min(90, list.reduce(function (s, b) { return s + (+b.sets || 0); }, 0));
        cell.dataset.day = key;
        if (opts.onDayClick && key >= today && dayTotal < 90) {
          cell.classList.add('clickable');
          cell.tabIndex = 0;
          cell.title = 'Tee varaustiedustelu tälle päivälle';
        }
        if (list.length) {
          var total = Math.min(90, list.reduce(function (s, b) { return s + (+b.sets || 0); }, 0));
          var cls = total >= 90 ? 'b90' : total >= 60 ? 'b60' : 'b30';
          cell.classList.add('booked', cls);
          cell.tabIndex = 0;
          cell.setAttribute('aria-label', d + '. ' + MONTHS[state.m] + ': ' + total + ' hengen astiastoa varattu');
          var lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = setsLabel(total);
          cell.appendChild(lbl);
        } else {
          cell.setAttribute('aria-label', d + '. ' + MONTHS[state.m] + ': vapaa');
        }
        grid.appendChild(cell);
      }
      if (opts.onRender) opts.onRender(state);
    }

    function go(step) {
      var dt = new Date(state.y, state.m + step, 1);
      state.y = dt.getFullYear(); state.m = dt.getMonth();
      hideTip(); render();
    }

    root.querySelectorAll('.cal-nav').forEach(function (b) {
      b.addEventListener('click', function () { go(+b.dataset.step); });
    });
    var todayBtn = root.querySelector('.cal-today');
    if (todayBtn) todayBtn.addEventListener('click', function () {
      var n = new Date(); state.y = n.getFullYear(); state.m = n.getMonth(); hideTip(); render();
    });

    /* Tooltip */
    function showTip(cell) {
      if (!tooltip) return;
      var list = bookingsOn(cell.dataset.day);
      tooltip.innerHTML = '';
      list.forEach(function (b) {
        var item = document.createElement('div'); item.className = 'tt-item';
        var s = document.createElement('strong');
        s.textContent = b.sets + ' hengen astiasto · ' + fiDate(b.start) + (b.end && b.end !== b.start ? '–' + fiDate(b.end) : '');
        item.appendChild(s);
        if (b.note) { var p = document.createElement('div'); p.textContent = b.note; item.appendChild(p); }
        tooltip.appendChild(item);
      });
      tooltip.hidden = false;
      var r = cell.getBoundingClientRect();
      var tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
      var left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
      var top = r.top - th - 8;
      if (top < 8) top = r.bottom + 8;
      tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px';
    }
    function hideTip() { if (tooltip) tooltip.hidden = true; }

    grid.addEventListener('mouseover', function (e) {
      var c = e.target.closest('.cal-day.booked'); if (c) showTip(c);
    });
    grid.addEventListener('mouseout', function (e) {
      var c = e.target.closest('.cal-day.booked');
      if (c && !c.contains(e.relatedTarget)) hideTip();
    });
    grid.addEventListener('focusin', function (e) {
      var c = e.target.closest('.cal-day.booked'); if (c) showTip(c);
    });
    grid.addEventListener('focusout', hideTip);
    function free(c) { return 90 - Math.min(90, bookingsOn(c.dataset.day).reduce(function (s, b) { return s + (+b.sets || 0); }, 0)); }
    grid.addEventListener('click', function (e) {
      var c = e.target.closest('.cal-day.clickable');
      if (c) { hideTip(); opts.onDayClick(c.dataset.day, free(c)); return; }
      c = e.target.closest('.cal-day.booked'); if (c) showTip(c); else hideTip(); // kosketusnäytöt
    });
    grid.addEventListener('keydown', function (e) {
      var c = e.target.closest('.cal-day.clickable');
      if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); hideTip(); opts.onDayClick(c.dataset.day, free(c)); }
    });
    window.addEventListener('scroll', hideTip, { passive: true });

    var api = {
      setBookings: function (list) { state.bookings = Array.isArray(list) ? list : []; render(); },
      goTo: function (y, m) { state.y = y; state.m = m; render(); },
      setStatus: function (t) { if (status) status.textContent = t || ''; },
      render: render
    };
    render();
    return api;
  }

  window.Varauskalenteri = { create: create, fiDate: fiDate };

  /* Julkinen sivu: lataa varaukset automaattisesti */
  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('calendar');
    if (!root || root.dataset.manual) return;
    var cal = create(root, { onDayClick: function (day, freeSets) {
      var d = fiDate(day);
      var info = document.getElementById('valittu-paiva');
      if (info) {
        info.innerHTML = '';
        var strong = document.createElement('strong'); strong.textContent = 'Valittu päivä: ' + d;
        info.appendChild(strong);
        info.appendChild(document.createTextNode(freeSets >= 90 ? ' – koko 90 hengen astiasto vapaana.' : ' – vapaana vielä ' + freeSets + ' hengen astiasto.'));
        info.hidden = false;
      }
      var text = 'Hei! Haluaisin varata astiaston ' + d + ' alkaen (vuokra-aika to–ma). Henkilömäärä: ';
      var mail = document.getElementById('c-mail'), sms = document.getElementById('c-sms'), wa = document.getElementById('c-wa');
      if (mail) mail.href = 'mailto:paimelanmartat@gmail.com?subject=' + encodeURIComponent('Astiavuokraus – varaustiedustelu ' + d) + '&body=' + encodeURIComponent(text);
      if (sms) sms.href = 'sms:+358400420187?&body=' + encodeURIComponent(text);
      if (wa) wa.href = 'https://wa.me/358400420187?text=' + encodeURIComponent(text);
      var target = document.getElementById('yhteystiedot');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    } });
    cal.setStatus('Ladataan varauksia…');
    fetch('data/varaukset.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        cal.setBookings(data.bookings || []);
        cal.setStatus(data.updated ? 'Päivitetty ' + new Date(data.updated).toLocaleDateString('fi-FI') : '');
      })
      .catch(function () { cal.setStatus('Varauksia ei voitu ladata. Kysy vapaita päiviä suoraan yhteystiedoista.'); });
  });
})();
