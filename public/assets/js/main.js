// lerk.tech: тема, меню, вкладки ИИ, появление блоков, копирование почты, сборка задачи.
(function () {
  'use strict';

  var root = document.documentElement;
  var TG_USER = 'joulerkOFF';
  var MAIL = 'lerk@joulerk.ru';

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok;
  }

  // ---------- Тема ----------
  var themeBtn = document.querySelector('[data-theme-toggle]');
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function currentTheme() {
    return root.getAttribute('data-theme') || (media.matches ? 'dark' : 'light');
  }
  function syncThemeLabel() {
    if (!themeBtn) return;
    themeBtn.setAttribute('aria-label', currentTheme() === 'dark' ? 'Светлая тема' : 'Тёмная тема');
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store('theme', next);
      syncThemeLabel();
    });
    media.addEventListener('change', syncThemeLabel);
    syncThemeLabel();
  }

  // ---------- Шапка: линия снизу после начала прокрутки ----------
  var top = document.querySelector('[data-top]');
  if (top && 'IntersectionObserver' in window) {
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:8px;pointer-events:none';
    document.body.prepend(sentinel);
    new IntersectionObserver(function (entries) {
      top.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  // ---------- Мобильное меню ----------
  var nav = document.getElementById('nav');
  var navBtn = document.querySelector('.nav-toggle');
  function setNav(open) {
    if (!nav || !navBtn) return;
    nav.classList.toggle('is-open', open);
    navBtn.setAttribute('aria-expanded', String(open));
    navBtn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }
  if (nav && navBtn) {
    navBtn.addEventListener('click', function () {
      setNav(navBtn.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navBtn.getAttribute('aria-expanded') === 'true') {
        setNav(false);
        navBtn.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (navBtn.getAttribute('aria-expanded') === 'true' && !e.target.closest('.top')) setNav(false);
    });
  }

  // ---------- Появление блоков ----------
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  reveals.forEach(function (el) {
    var siblings = Array.prototype.filter.call(el.parentElement.children, function (c) { return c.classList.contains('reveal'); });
    el.style.setProperty('--i', String(Math.min(siblings.indexOf(el), 5)));
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  // ---------- Вкладки ИИ ----------
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    var tabs = Array.prototype.slice.call(box.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });

    function select(i, focus) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
        panels[j].classList.toggle('is-entering', on);
      });
      if (focus) tabs[i].focus();
      tabs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i, false); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length, k = e.key, next = null;
        if (k === 'ArrowRight' || k === 'ArrowDown') next = (i + 1) % n;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') next = (i - 1 + n) % n;
        else if (k === 'Home') next = 0;
        else if (k === 'End') next = n - 1;
        if (next !== null) { e.preventDefault(); select(next, true); }
      });
    });
    panels.forEach(function (p, j) { p.hidden = j !== 0; });
  });

  // ---------- Копирование почты ----------
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var label = btn.getAttribute('aria-label');
    btn.addEventListener('click', function () {
      copyText(btn.getAttribute('data-copy')).then(function (ok) {
        if (!ok) return;
        btn.classList.add('is-done');
        btn.setAttribute('aria-label', 'Адрес скопирован');
        setTimeout(function () {
          btn.classList.remove('is-done');
          btn.setAttribute('aria-label', label);
        }, 1800);
      });
    });
  });

  // ---------- Сборка задачи ----------
  var form = document.querySelector('[data-brief]');
  if (form) {
    var text = form.querySelector('textarea');
    var error = form.querySelector('.field__error');
    var status = form.querySelector('.brief__status');
    var lastButton = null;

    form.querySelectorAll('button[type="submit"]').forEach(function (b) {
      b.addEventListener('click', function () { lastButton = b; });
    });

    function setError(on) {
      error.hidden = !on;
      if (on) text.setAttribute('aria-invalid', 'true');
      else text.removeAttribute('aria-invalid');
    }
    text.addEventListener('input', function () {
      if (text.value.trim().length >= 3) setError(false);
    });

    function compose() {
      var kinds = Array.prototype.map.call(form.querySelectorAll('input[name="kind"]:checked'), function (i) { return i.value; });
      var when = form.querySelector('input[name="when"]:checked');
      var lines = ['Здравствуйте, Дмитрий!'];
      if (kinds.length) lines.push('Нужно: ' + kinds.join(', ') + '.');
      if (when) lines.push('Срок: ' + when.value.toLowerCase() + '.');
      lines.push('Задача: ' + text.value.trim());
      lines.push('', 'Пишу с сайта lerk.tech');
      return lines.join('\n');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.submitter || lastButton;
      var to = btn && btn.value === 'mail' ? 'mail' : 'tg';

      if (text.value.trim().length < 3) {
        setError(true);
        status.textContent = '';
        text.focus();
        return;
      }
      setError(false);

      var message = compose();
      copyText(message);

      if (to === 'tg') {
        var url = 'https://t.me/' + TG_USER + '?text=' + encodeURIComponent(message);
        // С флагом noopener window.open всегда возвращает null, поэтому отвязываем вручную.
        var win = window.open(url, '_blank');
        if (win) { try { win.opener = null; } catch (err) {} }
        else window.location.href = url;
        status.textContent = 'Открываю Telegram. Текст уже в поле ввода, осталось нажать «Отправить». На всякий случай он ещё и скопирован.';
      } else {
        var subject = 'Задача с lerk.tech';
        window.location.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(message);
        status.textContent = 'Открываю почтовую программу. Если она не открылась, напишите на ' + MAIL + ', текст уже скопирован.';
      }
    });
  }
})();
