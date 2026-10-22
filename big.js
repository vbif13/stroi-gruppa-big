(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var KEY = 'sg_extra_objects';
  function extras() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function allObjects() { return (window.OBJECTS || []).concat(extras()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var TYPES = window.TYPES || {};
  function thumb(o) { return o.thumb || o.photo; }
  function cardHTML(o) {
    return '<a class="card" href="object.html?id=' + encodeURIComponent(o.id) + '" data-c="' + esc(o.type) + '" data-s="' + esc(o.status) + '"><div class="ph"><img loading="lazy" decoding="async" src="' + esc(thumb(o)) + '" alt="' + esc(o.title) + '"></div><div class="in"><div class="meta"><span>' + esc(TYPES[o.type] || o.type) + '</span><span>' + esc(o.year) + '</span></div><h3>' + esc(o.title) + '</h3></div></a>';
  }

  /* ---------- первый экран: здание «раскрывается» при прокрутке ---------- */
  var hero = $('#hero');
  if (hero && !window.HERO3D) {
    var N = 90, set = matchMedia('(max-aspect-ratio: 1/1)').matches ? 'p' : 'l', cv = $('#cv'), ctx = cv.getContext('2d'), frames = new Array(N + 1), cur = -1;
    var pg = $('#pg'), sn = $('#sn'), st = $('#st'), ht = $('#ht');
    var STAGES = ['Проект', 'Фундамент', 'Каркас', 'Фасад и стекло', 'Объект сдан'];
    var src = function (i) { return 'f-' + set + '-f_' + ('00' + i).slice(-3) + '.webp'; };
    var find = function (i) { var im = frames[i]; if (im && im.naturalWidth) return im; for (var d = 1; d < N; d++) { var a = frames[i - d], b = frames[i + d]; if (a && a.naturalWidth) return a; if (b && b.naturalWidth) return b; } return null; };
    var draw = function (i) { var im = find(i); if (!im) return; if (cv.width !== im.naturalWidth) { cv.width = im.naturalWidth; cv.height = im.naturalHeight; } ctx.drawImage(im, 0, 0); };
    var load = function (i) { if (i < 1 || i > N || frames[i]) return; var im = new Image(); im.onload = function () { if (cur < 1 || Math.abs(i - cur) < 3) draw(cur < 1 ? 1 : cur); }; im.src = src(i); frames[i] = im; };
    var resize = function () { draw(cur < 1 ? 1 : cur); };
    load(1); load(N); var order = []; [8, 4, 2, 1].forEach(function (s) { for (var i = 1; i <= N; i += s) order.push(i); });
    var k = 0; (function pump() { var n = 0; while (k < order.length && n < 5) { load(order[k++]); n++; } if (k < order.length) setTimeout(pump, 25); })();
    var tk = false, top0 = 0, tot = 1, lastSi = -1, lastOp = -1;
    var measure = function () { var r = hero.getBoundingClientRect(); top0 = r.top + pageYOffset; tot = Math.max(1, hero.offsetHeight - innerHeight); };
    var upd = function () {
      tk = false;
      var p = Math.min(1, Math.max(0, (pageYOffset - top0) / tot));
      var i = Math.min(N, Math.max(1, 1 + Math.round(p * (N - 1)))); if (i !== cur) { cur = i; draw(i); }
      pg.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      var si = Math.min(4, Math.floor(p * 5 * .999)); if (si !== lastSi) { lastSi = si; sn.textContent = '0' + (si + 1); st.textContent = STAGES[si]; }
      var op = Math.max(0, 1 - p / 0.2); op = Math.round(op * 50) / 50; if (op !== lastOp) { lastOp = op; ht.style.opacity = op; ht.style.pointerEvents = op < 0.1 ? 'none' : 'auto'; }
    };
    addEventListener('scroll', function () { if (!tk) { tk = true; requestAnimationFrame(upd); } }, { passive: true });
    addEventListener('resize', function () { resize(); measure(); upd(); }); resize(); measure(); upd();
  }

  /* ---------- избранные объекты на главной и «примеры» на страницах услуг ---------- */
  var feat = $('#feat');
  if (feat) feat.innerHTML = allObjects().filter(function (o) { return o.featured; }).slice(0, 3).map(cardHTML).join('');
  var ex = $('#ex');
  if (ex) {
    var t = ex.getAttribute('data-type'), list = allObjects().filter(function (o) { return o.type === t; }).slice(0, 3);
    ex.innerHTML = list.map(cardHTML).join('');
  }

  /* ---------- портфолио: фильтры по типу и статусу ---------- */
  var grid = $('#grid');
  if (grid) {
    var ex2 = extras(); if (ex2.length) grid.insertAdjacentHTML('beforeend', ex2.map(cardHTML).join(''));
    var ft = 'all', fs = 'all', cnt = $('#cnt'), emp = $('#emp');
    var apply = function () {
      var n = 0;
      $$('.card', grid).forEach(function (c) {
        var ok = (ft === 'all' || c.getAttribute('data-c') === ft) && (fs === 'all' || c.getAttribute('data-s') === fs);
        c.classList.toggle('show-no', !ok); if (ok) n++;
      });
      if (cnt) cnt.textContent = 'Показано объектов: ' + n; if (emp) emp.style.display = n ? 'none' : 'block';
    };
    $$('#ftype button').forEach(function (b) { b.addEventListener('click', function () { ft = b.getAttribute('data-f'); $$('#ftype button').forEach(function (x) { x.classList.toggle('on', x === b); }); apply(); }); });
    $$('#fstat button').forEach(function (b) { b.addEventListener('click', function () { fs = b.getAttribute('data-f'); $$('#fstat button').forEach(function (x) { x.classList.toggle('on', x === b); }); apply(); }); });
    apply();
  }

  /* ---------- страница объекта (один шаблон, данные из списка) ---------- */
  var op = $('#objpage');
  if (op) {
    var id = new URLSearchParams(location.search).get('id'), o = allObjects().filter(function (x) { return x.id === id; })[0] || allObjects()[0];
    document.title = o.title + ': Строй-группа (макет)';
    var photos = (o.photos && o.photos.length) ? o.photos : [o.photo];
    var kv = function (a, b) { return '<div class="kv"><span>' + a + '</span><b style="font-weight:400">' + esc(b) + '</b></div>'; };
    var rel = allObjects().filter(function (x) { return x.type === o.type && x.id !== o.id; }).concat(allObjects().filter(function (x) { return x.type !== o.type; })).slice(0, 3);
    op.innerHTML =
      '<div class="pagehero"><img src="' + esc(o.photo) + '" alt="' + esc(o.title) + '"><div class="in"><div class="crumbs"><a href="index.html">Главная</a> / <a href="portfolio.html">Объекты</a> / ' + esc(o.title) + '</div><div class="tagm" style="margin-bottom:16px">' + esc(TYPES[o.type] || o.type) + ' · ' + esc(o.year) + '</div><h1>' + esc(o.title) + '</h1></div></div>' +
      '<section class="s"><div class="grid2 w"><div><div class="lab tagm">Об объекте</div><h2>Задача и результат</h2><p class="sub" style="margin-top:20px">' + esc(o.desc) + '</p>' +
      '<div class="gal" style="margin-top:34px">' + photos.map(function (p) { return '<img loading="lazy" decoding="async" src="' + esc(p) + '" alt="">'; }).join('') + '</div></div>' +
      '<div><div class="kvs">' + kv('Тип', TYPES[o.type] || o.type) + kv('Город', o.city) + kv('Площадь', o.area) + kv('Этажность', o.floors) + kv('Срок', o.term) + kv('Год', o.year) + kv('Статус', o.status) + '</div>' +
      '<p class="note">Название, цифры и фото в макете выдуманные, это пример шаблона. Для реального объекта эти поля заполняются из админки.</p></div></div></section>' +
      '<section class="s"><div class="lab tagm">Ход работ</div><h2>Как шёл объект</h2><div class="tline" style="margin-top:26px">' +
      '<div><b>Проект и согласования</b><span>[даты из данных объекта]</span></div><div><b>Фундамент и подземная часть</b><span>[даты]</span></div><div><b>Монолитный каркас</b><span>[даты]</span></div><div><b>Фасад и инженерия</b><span>[даты]</span></div><div><b>' + (o.status === 'Сдан' ? 'Сдача объекта' : 'Сдача (план)') + '</b><span>[дата]</span></div></div></section>' +
      '<section class="s"><div class="lab tagm">Ещё объекты</div><h2>Похожие работы</h2><div class="cards" style="margin-top:34px">' + rel.map(cardHTML).join('') + '</div></section>';
  }

  /* ---------- формы заявок ---------- */
  var ENDPOINT = window.LEAD_ENDPOINT || '';
  $$('form.lead').forEach(function (f) {
    var msg = $('.msg', f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var show = function (c, t) { msg.className = 'msg ' + c; msg.textContent = t; };
      if ($('.hp', f) && $('.hp', f).value) return;
      var name = f.elements.name.value.trim(), phone = f.elements.phone.value.replace(/[^\d+]/g, '');
      if (name.length < 2) return show('err', 'Укажите имя.');
      if (phone.replace(/\D/g, '').length < 10) return show('err', 'Укажите телефон: не меньше 10 цифр.');
      if (!f.elements.agree.checked) return show('err', 'Нужно согласие на обработку данных.');
      var data = { name: name, phone: phone, task: f.elements.task ? f.elements.task.value : '', service: f.elements.service ? f.elements.service.value : '', page: location.pathname };
      if (!ENDPOINT) { show('ok', 'Демо: заявка проверена, но никуда не ушла. В рабочей версии она приходит вам в Telegram и на почту за пару секунд.'); return; }
      show('ok', 'Отправляем…');
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw 0; show('ok', 'Спасибо! Заявка отправлена, мы свяжемся с вами.'); f.reset(); })
        .catch(function () { show('err', 'Не получилось отправить. Позвоните нам или напишите в Telegram.'); });
    });
  });

  /* ---------- меню на телефоне ---------- */
  $$('.mmenu a').forEach(function (a) { a.addEventListener('click', function () { document.body.classList.remove('mo'); }); });

  /* ---------- админка: добавление объектов (демо хранит данные в этом браузере) ---------- */
  var adm = $('#admform');
  if (adm) {
    var pend = [], pv = $('#pv'), listEl = $('#admlist'), am = $('#admmsg');
    var shrink = function (file, max, q) {
      return new Promise(function (res) {
        var r = new FileReader(); r.onload = function () { var im = new Image(); im.onload = function () { var s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)); }; im.src = r.result; }; r.readAsDataURL(file);
      });
    };
    $('#admfile').addEventListener('change', function (e) {
      var files = [].slice.call(e.target.files).slice(0, 4);
      Promise.all(files.map(function (f) { return shrink(f, 1400, .7); })).then(function (arr) { pend = arr; pv.innerHTML = arr.map(function (s) { return '<img src="' + s + '" alt="">'; }).join(''); });
    });
    var renderList = function () {
      var ex = extras();
      listEl.innerHTML = ex.length ? ex.map(function (o, i) { return '<div class="it"><img src="' + esc(o.photo) + '" alt=""><div><b style="font-weight:400">' + esc(o.title) + '</b><br><small style="color:#9b9384">' + esc(TYPES[o.type]) + ' · ' + esc(o.year) + ' · ' + esc(o.status) + '</small></div><div><a class="btn ghost" style="padding:8px 12px;font-size:11px" href="object.html?id=' + encodeURIComponent(o.id) + '">Открыть</a> <button data-i="' + i + '">Удалить</button></div></div>'; }).join('') : '<p class="sub">Пока вы ничего не добавляли. Добавьте объект выше: он сразу появится в портфолио.</p>';
      $$('button[data-i]', listEl).forEach(function (b) { b.addEventListener('click', function () { var ex = extras(); ex.splice(+b.getAttribute('data-i'), 1); localStorage.setItem(KEY, JSON.stringify(ex)); renderList(); }); });
    };
    adm.addEventListener('submit', function (e) {
      e.preventDefault(); var g = function (n) { return adm.elements[n].value.trim(); };
      if (!g('title') || !pend.length) { am.className = 'msg err'; am.textContent = 'Нужны название и хотя бы одно фото.'; return; }
      var ex = extras();
      ex.push({ id: 'new-' + Date.now(), title: g('title'), type: g('type'), year: g('year') || '2026', city: g('city') || '[город]', area: g('area') || '[данные]', floors: g('floors') || '[данные]', term: g('term') || '[данные]', status: g('status'), desc: g('desc') || 'Описание объекта.', photo: pend[0], photos: pend });
      try { localStorage.setItem(KEY, JSON.stringify(ex)); } catch (er) { am.className = 'msg err'; am.textContent = 'Фото слишком тяжёлые для демо. Возьмите меньше или меньше размером.'; return; }
      am.className = 'msg ok'; am.innerHTML = 'Добавлено. Откройте <a href="portfolio.html" style="color:#c9e0c2">портфолио</a>: объект уже там.'; adm.reset(); pend = []; pv.innerHTML = ''; renderList();
    });
    $('#admexport').addEventListener('click', function () { var b = new Blob([JSON.stringify(extras(), null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'objects.json'; a.click(); });
    renderList();
  }
})();
