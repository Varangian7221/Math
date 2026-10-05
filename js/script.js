/* ==========================================================================
   script.js — логика лендинга
   1. Подстановка контактов из config.js
   2. Появление блоков при прокрутке
   3. Маска телефона + валидация
   4. Отправка заявки в Telegram-бота (с безопасным запасным вариантом)
   5. Липкая мобильная кнопка, год в подвале, плавная навигация
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.SITE || {};
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ======================================================================
     1. Контакты
     ----------------------------------------------------------------------
     В режиме сервера тексты и ссылки приходят из data/content.json
     (скрипт js/content.js в <head>). Здесь остаётся запасной вариант:
     если контент не загрузился — подставляем значения из js/config.js,
     чтобы контакты работали и при открытии файла напрямую с диска.
     ====================================================================== */
  (function applyConfigFallback() {
    // Не мешаем контенту, если он уже применён
    if (window.__CONTENT__) return;

    var map = {
      'teacher.full': CFG.teacher && CFG.teacher.full,
      'phone':        CFG.contacts && CFG.contacts.phone,
      'telegram':     CFG.contacts && CFG.contacts.telegram,
      'whatsapp':     CFG.contacts && CFG.contacts.whatsapp
    };

    $$('[data-fallback]').forEach(function (el) {
      var val = map[el.getAttribute('data-fallback')];
      if (val) el.textContent = val;
    });

    var tg = CFG.contacts && CFG.contacts.telegram;
    var wa = CFG.contacts && CFG.contacts.whatsapp;
    $$('a[href^="https://t.me/"]').forEach(function (a) { if (tg) a.href = tg; });
    $$('a[href^="https://wa.me/"]').forEach(function (a) { if (wa) a.href = wa; });

    var telHref = CFG.contacts && CFG.contacts.phoneHref;
    if (telHref) {
      $$('a[href^="tel:"]').forEach(function (a) { a.href = 'tel:' + telHref; });
    }

  })();

  /* ======================================================================
     2. Появление блоков при прокрутке
     ====================================================================== */
  (function revealOnScroll() {
    var items = $$('.reveal');
    if (!items.length) return;

    // Подставляем задержки из data-reveal-delay
    items.forEach(function (el) {
      var d = el.getAttribute('data-reveal-delay');
      if (d) el.style.setProperty('--reveal-delay', d + 'ms');
    });

    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    items.forEach(function (el) { io.observe(el); });

    // Страховка: если наблюдатель по какой-то причине не сработал
    // (например, вкладка была свёрнута при загрузке) — показываем всё.
    setTimeout(function () {
      items.forEach(function (el) { el.classList.add('is-in'); });
    }, 4000);
  })();

  /* ======================================================================
     3. Маска телефона и валидация формы
     ====================================================================== */
  var ERRORS = {
    name:    'Как к вам обращаться?',
    phone:   'Укажите телефон полностью',
    grade:   'Укажите класс ученика',
    goal:    'Выберите цель занятий',
    consent: 'Нужно согласие на обработку данных'
  };

  function showError(form, name, message) {
    var input = form.querySelector('[name="' + name + '"]');
    var box   = form.querySelector('[data-error-for="' + name + '"]');
    if (input) input.classList.toggle('is-invalid', !!message);
    if (box) {
      box.textContent = message || '';
      box.classList.toggle('is-shown', !!message);
    }
  }

  function clearError(form, name) { showError(form, name, ''); }

  /* --- Маска +7 (___) ___-__-__ --- */
  function maskPhone(value) {
    var d = value.replace(/\D/g, '');
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);

    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }

  function countDigits(v) { return v.replace(/\D/g, '').length; }

  (function initForm() {
    var form = $('#lead-form');
    if (!form) return;

    var phone = $('#phone');
    var status = $('#form-status');

    // маска
    if (phone) {
      phone.addEventListener('input', function () {
        phone.value = maskPhone(phone.value);
        if (phone.classList.contains('is-invalid') && countDigits(phone.value) === 11) {
          clearError(form, 'phone');
        }
      });
      phone.addEventListener('focus', function () {
        if (!phone.value) phone.value = '+7 (';
      });
      phone.addEventListener('blur', function () {
        if (countDigits(phone.value) < 4) phone.value = '';
      });
    }

    // снимаем ошибку при правке
    ['name', 'grade'].forEach(function (n) {
      var el = form.querySelector('[name="' + n + '"]');
      if (el) el.addEventListener('input', function () { clearError(form, n); });
    });
    var goal = $('#goal');
    if (goal) goal.addEventListener('change', function () { clearError(form, 'goal'); });
    var consent = $('#consent');
    if (consent) consent.addEventListener('change', function () {
      if (consent.checked) clearError(form, 'consent');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (status) { status.textContent = ''; status.classList.remove('is-ok'); }

      var ok = true;
      ['name', 'phone', 'grade', 'goal'].forEach(function (n) {
        var el = form.querySelector('[name="' + n + '"]');
        var val = el ? String(el.value || '').trim() : '';
        var bad = !val;
        if (n === 'phone' && countDigits(val) !== 11) bad = true;
        if (bad) { showError(form, n, ERRORS[n]); ok = false; }
        else clearError(form, n);
      });

      if (consent && !consent.checked) { showError(form, 'consent', ERRORS.consent); ok = false; }
      else clearError(form, 'consent');

      if (!ok) {
        var firstBad = $('.is-invalid', form) || (consent && !consent.checked ? consent : null);
        if (firstBad) firstBad.focus();
        return;
      }

      var data = {
        name:    form.name.value.trim(),
        phone:   form.phone.value.trim(),
        grade:   form.grade.value.trim(),
        goal:    form.goal.value,
        page:    location.href
      };

      submitLead(data, form, status);
    });
  })();

  /* ======================================================================
     4. Отправка заявки
     ====================================================================== */
  /* Показ экрана «Заявка отправлена».
     Экран чисто информационный: ни календаря, ни кнопки отправки в мессенджер.
     Ссылку на календарь и подтверждение репетитор присылает сам. */
  function showDone(form) {
    var done = $('#form-done');
    if (!done) return;

    if (form) form.hidden = true;
    done.hidden = false;

    var again = $('#form-reset', done);
    if (again) again.focus({ preventScroll: true });
  }

  function submitLead(data, form, status) {
    var btn = $('#submit-btn');
    var initialText = btn ? btn.textContent : '';

    if (btn) { btn.disabled = true; btn.textContent = 'Отправляю…'; }

    var endpoint = (window.SITE && window.SITE.leadsEndpoint) || '';

    /* Запасного пути через мессенджер больше нет: если Worker недоступен,
       заявка в базу не попала. Показывать «Заявка отправлена» в этом случае
       нельзя — посетитель будет ждать звонка, которого не будет. */
    if (!endpoint) {
      submitFailed(form, status, btn, initialText,
                   'Форма сейчас не работает. Позвоните или напишите — контакты внизу страницы.');
      return;
    }

    var payload = {
      name:  data.name,
      phone: data.phone,
      grade: data.grade,
      goal:  data.goal,
      page:  data.page,
      // honeypot: человек сюда не попадёт, бот заполнит
      website: (function () {
        var hp = document.getElementById('website');
        return hp ? hp.value : '';
      })()
    };

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, body: j }; },
                              function () { return { ok: false, body: {} }; });
      })
      .then(function (res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'Ошибка отправки');

        if (btn) { btn.disabled = false; btn.textContent = initialText; }

        // Экран «Заявка отправлена». Без кнопок: заявка уже в базе,
        // ссылку на календарь репетитор пришлёт в Telegram.
        // Текст подтверждения подставлен через data-field из админки.
        showDone(form);
      })
      .catch(function (err) {
        // Worker недоступен, сеть подвела или он ответил ошибкой.
        // Заявки в базе нет, поэтому экран успеха не показываем —
        // форма остаётся заполненной, чтобы можно было повторить.
        submitFailed(form, status, btn, initialText,
          'Не получилось отправить заявку. Проверьте интернет и попробуйте ещё раз' +
          ' или позвоните по номеру внизу страницы.');
      });
  }

  /* Откат после неудачной отправки: разблокируем кнопку, оставляем
     заполненную форму и показываем текст ошибки под полями. */
  function submitFailed(form, status, btn, initialText, message) {
    if (btn) { btn.disabled = false; btn.textContent = initialText; }
    if (status) {
      status.classList.remove('is-ok');
      status.textContent = message;
    }
    var phone = $('#phone');
    if (phone) phone.focus({ preventScroll: true });
  }

  // Кнопка «Отправить ещё одну заявку»
  (function resetForm() {
    var btn = $('#form-reset');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var form = $('#lead-form');
      var done = $('#form-done');
      if (form) {
        form.reset();
        form.hidden = false;
        var ph = $('#phone'); if (ph) ph.value = '';
        $$('.is-invalid', form).forEach(function (el) { el.classList.remove('is-invalid'); });
        var st = $('#form-status'); if (st) { st.textContent = ''; st.classList.remove('is-ok'); }
        var s = $('#submit-btn'); if (s) s.disabled = false;
        var n = $('#name'); if (n) n.focus();
      }
      if (done) done.hidden = true;
    });
  })();

  /* ======================================================================
     5. Мелочи
     ====================================================================== */
  // год в подвале
  (function year() {
    var el = $('#year');
    if (el) el.textContent = String(new Date().getFullYear());
  })();

  // липкая мобильная кнопка: показываем после первого экрана
  (function stickyBar() {
    var bar = $('#stickybar');
    if (!bar) return;
    var hero = $('#hero');
    if (!hero || !('IntersectionObserver' in window)) { bar.classList.add('is-visible'); return; }

    new IntersectionObserver(function (entries) {
      bar.classList.toggle('is-visible', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(hero);
  })();

  // плавный переход по якорям с учётом шапки
  (function smoothAnchors() {
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (!id || id === '#') return;
        var target = document.getElementById(id.slice(1));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start'
        });
        history.replaceState(null, '', id);
      });
    });
  })();
})();
