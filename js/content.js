/* ==========================================================================
   content.js — применяет сохранённый контент из data/content.json к странице.
   --------------------------------------------------------------------------
   Работает в трёх режимах:

   1) СЕРВЕРНЫЙ (основной). node server.js подставляет window.__CONTENT__
      прямо в HTML ДО отрисовки → нет мигания старых текстов и полный
      готовый текст в HTML для поисковиков.

   2) СТАТИКА / ХОСТИНГ. Контент подтягивается запросом к data/content.json.

   3) ФАЙЛОВЫЙ (index.html с диска). Запрос невозможен — остаются тексты,
      вписанные в HTML, и контакты из js/config.js.

   ПРАВИЛА РАЗМЕТКИ (три варианта, всё через data-field):

     <p data-field="hero.lead">                    → заменится ТЕКСТ
     <p data-field="hero.title" class="pre">       → текст, переносы \n сохранятся
     <a data-attr="href" data-field="site.telegram"> → заменится ТОЛЬКО АТРИБУТ
     <img data-field="images.hero">                → заменится src
     <span data-field="prices.items.0.flag" data-hide-empty> → если пусто, скроется

   Для <a> с data-attr подпись живёт во вложенном <span> со своим data-field.
   ========================================================================== */
(function () {
  'use strict';

  var CONTENT = null;

  function get(obj, path) {
    return String(path).split('.').reduce(function (o, k) {
      return (o === null || o === undefined) ? undefined : o[k];
    }, obj);
  }

  /* ---- Подстановка ---- */
  function applyAll() {
    if (!CONTENT) return;
    var nodes = document.querySelectorAll('[data-field]');
    var i, el, val, attr;

    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      val = get(CONTENT, el.getAttribute('data-field'));
      if (val === undefined || val === null) continue;   // нет значения — оставляем текст из HTML

      val = String(val);

      // 1) картинка
      if (el.tagName === 'IMG') {
        el.setAttribute('src', val);
        continue;
      }

      // 2) атрибут (href, placeholder, title…) — текст не трогаем
      attr = el.getAttribute('data-attr');
      if (attr) {
        el.setAttribute(attr, val);
        continue;
      }

      // 3) текст
      el.textContent = val;

      // пустое значение у «плашки» → прячем элемент целиком
      if (el.hasAttribute('data-hide-empty')) el.hidden = !val;
    }

    // Кликабельная ссылка телефона
    var phoneHref = get(CONTENT, 'site.phoneHref');
    if (phoneHref) {
      var links = document.querySelectorAll('a[href^="tel:"]');
      for (i = 0; i < links.length; i++) links[i].setAttribute('href', 'tel:' + phoneHref);
    }
  }

  /* ---- Schema.org: собираем из живого DOM, чтобы не расходилось с текстом ---- */
  function buildStructuredData() {
    if (!CONTENT) return;

    var siteUrl = String(get(CONTENT, 'site.siteUrl') || '').replace(/\/$/, '');
    var teacher = get(CONTENT, 'site.teacherFull');
    var role = get(CONTENT, 'site.teacherRole');
    var heroImg = get(CONTENT, 'images.hero');
    var edu = get(CONTENT, 'about.edu');

    var person = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': siteUrl + '/#teacher',
      name: teacher,
      jobTitle: 'Реподаватель математики, репетитор',
      description: role + '. ' + get(CONTENT, 'about.lead'),
      url: siteUrl + '/'
    };
    if (heroImg) person.image = siteUrl + String(heroImg).replace(/^\//, '');
    if (edu) person.alumniOf = { '@type': 'CollegeOrUniversity', name: edu };
    person.knowsAbout = ['Математика', 'ОГЭ', 'ЕГЭ', 'ВПР', 'Олимпиадная математика'];

    var prices = get(CONTENT, 'prices.items') || [];
    if (prices.length) {
      var first = prices[0];
      person.offers = {
        '@type': 'Offer',
        priceCurrency: 'RUB',
        price: String(first.value || '').replace(/[^\d]/g, '') || '0',
        description: first.name
      };
    }

    // FAQPage — берём вопросы прямо из разметки
    var items = document.querySelectorAll('#faq .faq__item');
    var qa = [];
    for (var i = 0; i < items.length; i++) {
      var q = items[i].querySelector('.faq__q');
      var a = items[i].querySelector('.faq__a p');
      if (q && a) {
        qa.push({
          '@type': 'Question',
          name: (q.childNodes[0] ? q.childNodes[0].textContent : q.textContent).replace(/\s+/g, ' ').trim(),
          acceptedAnswer: { '@type': 'Answer', text: a.textContent.replace(/\s+/g, ' ').trim() }
        });
      }
    }

    var blocks = document.querySelectorAll('script[data-ld]');
    for (var j = 0; j < blocks.length; j++) {
      var kind = blocks[j].getAttribute('data-ld');
      var data = kind === 'faq' ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa } : person;
      blocks[j].textContent = JSON.stringify(data);
    }
  }

  /* ---- Запуск ---- */
  function ready() {
    if (CONTENT) { applyAll(); buildStructuredData(); return; }

    if (location.protocol === 'file:') return;   // файл с диска — используем тексты из HTML

    fetch('data/content.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) {
        if (json) { CONTENT = json; applyAll(); buildStructuredData(); }
      })
      .catch(function () { /* остаются тексты из HTML */ });
  }

  CONTENT = window.__CONTENT__ || null;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

  // Доступ из консоли и из админки (для предпросмотра)
  window.__applyContent = function (json) { CONTENT = json; applyAll(); buildStructuredData(); };
})();
