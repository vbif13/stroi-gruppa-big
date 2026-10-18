// Появление: тихая роскошь. Медленно, мягко, без вспышек.
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var heads = [].slice.call(document.querySelectorAll('h1,h2'));
  var paras = [].slice.call(document.querySelectorAll('.sub,.big,.heroText p,.rows p'));
  function split(el) {
    var text = el.textContent.replace(/\s+/g, ' ').trim();
    el.setAttribute('aria-label', text); el.innerHTML = ''; el.style.visibility = 'visible';
    text.split(' ').forEach(function (w, i, arr) {
      var s = document.createElement('span'); s.className = 'wq'; s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--i', i); s.textContent = w; el.appendChild(s);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
  }
  function onView(el, fn, th) {
    var done = false, io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && !done) { done = true; io.disconnect(); fn(); } });
    }, { threshold: th || 0.25 });
    io.observe(el);
  }
  heads.forEach(function (el) {
    var hero = !!el.closest('.hero2'); split(el);
    if (reduce) { el.classList.add('in'); return; }
    if (hero) { setTimeout(function () { el.classList.add('in'); }, 900); return; }
    onView(el, function () { el.classList.add('in'); });
  });
  paras.forEach(function (el) {
    if (reduce) return; el.classList.add('fu');
    if (el.closest('.hero2')) { setTimeout(function () { el.classList.add('on'); }, 2300); return; }
    onView(el, function () { el.classList.add('on'); });
  });
  // карточки по очереди
  [].slice.call(document.querySelectorAll('.gcs,.cards,.steps')).forEach(function (g) {
    var items = [].slice.call(g.children);
    items.forEach(function (c, i) { c.style.setProperty('--i', i); if (!reduce) c.classList.add('rv'); });
    if (reduce) return;
    onView(g, function () { items.forEach(function (c) { c.classList.add('on'); }); }, 0.12);
  });
})();
