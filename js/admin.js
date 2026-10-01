/* ==========================================================================
   admin.js — логика админки
   1. Вход по паролю
   2. Загрузка контента и заполнение полей формы
   3. Сохранение
   4. Загрузка фото (сжатие в браузере до WebP)
   5. Автосохранение черновика в localStorage
   6. Предпросмотр и сброс
   ========================================================================== */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var STATE = {
    content: null,        // рабочая копия контента
    defaultContent: null, // исходный контент для отката
    dirty: false,
    userTouched: false
  };

  var DRAFT_KEY = 'math_admin_draft_v1';

  /* ======================================================================
     Показ сообщений
     ====================================================================== */
  var toastTimer = null;
  function toast(msg, kind) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast toast--' + (kind || 'info');
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-shown'); }, 3600);
  }

  /* ======================================================================
     1. Вход
     ====================================================================== */
  function showApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    document.body.classList.add('is-app');
    loadContent();
  }

  function showLogin(message) {
    $('#app').hidden = true;
    $('#login').hidden = false;
    document.body.classList.remove('is-app');
    if (message) {
      var err = $('#login-error');
      err.textContent = message;
      err.hidden = false;
    }
  }

  (function initLogin() {
    var form = $('#login-form');
    var input = $('#login-pass');
    var btn = $('#login-btn');

    // Уже есть живая сессия?
    fetch('api/session', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (s.defaultPassword) {
          $('#warn-default').hidden = false;
        }
        if (s.auth) showApp();
      })
      .catch(function () {});

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      $('#login-error').hidden = true;
      btn.disabled = true;
      btn.textContent = 'Проверяю…';

      fetch('api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.value })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.error || 'Не удалось войти');
          if (res.j.defaultPassword) $('#warn-default').hidden = false;
          input.value = '';
          showApp();
        })
        .catch(function (err) {
          var errBox = $('#login-error');
          errBox.textContent = err.message;
          errBox.hidden = false;
          input.select();
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Войти';
        });
    });
  })();

  /* ======================================================================
     2. Загрузка контента
     ====================================================================== */
  function loadContent() {
    Promise.all([
      fetch('api/content', { credentials: 'same-origin' }).then(function (r) { return r.json(); }),
      fetch('api/content.default', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ])
      .then(function (res) {
        STATE.defaultContent = res[1];
        STATE.content = res[0];

        // Черновик: предупреждаем, если есть несохранённые правки
        var draft = readDraft();
        if (draft && JSON.stringify(draft) !== JSON.stringify(STATE.content)) {
          $('#draft-bar').hidden = false;
        }

        renderAll();
        updateMeta();
        fillImages();
      })
      .catch(function (err) {
        toast('Не удалось загрузить контент: ' + err.message, 'err');
      });
  }

  function updateMeta() {
    var u = STATE.content && STATE.content.updatedAt;
    $('#saved-at').textContent = u
      ? 'Сохранено ' + new Date(u).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'Ещё не сохранялось';
  }

  /* ======================================================================
     3. Форма: сбор значений по data-path
     ====================================================================== */
  function getByPath(obj, path) {
    return String(path).split('.').reduce(function (o, k) {
      return (o === null || o === undefined) ? undefined : o[k];
    }, obj);
  }

  function setByPath(obj, path, value) {
    var keys = String(path).split('.');
    var last = keys.pop();
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur[keys[i]] === null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      cur = cur[keys[i]];
    }
    cur[last] = value;
  }

  function renderAll() {
    $$('#app [data-path]').forEach(function (el) {
      var v = getByPath(STATE.content, el.getAttribute('data-path'));
      if (v === undefined || v === null) v = '';
      el.value = v;
    });
    STATE.dirty = false;
    updateDirty();
  }

  function collect() {
    $$('#app [data-path]').forEach(function (el) {
      setByPath(STATE.content, el.getAttribute('data-path'), el.value);
    });
    return STATE.content;
  }

  function updateDirty() {
    var bar = $('#save-bar');
    bar.classList.toggle('is-dirty', STATE.dirty);
    $('#save-btn').disabled = !STATE.dirty;
    if (STATE.dirty) saveDraft();
    else clearDraft();
  }

  /* Ввод → обновляем состояние и черновик */
  $('#app').addEventListener('input', function (e) {
    if (!e.target.matches('[data-path]')) return;
    STATE.userTouched = true;
    STATE.dirty = true;
    setByPath(STATE.content, e.target.getAttribute('data-path'), e.target.value);
    updateDirty();
  });

  /* --- Черновик в localStorage --- */
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(collect())); } catch (err) { /* переполнено */ }
  }
  function readDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (err) { return null; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (err) {}
  }

  /* ======================================================================
     4. Сохранение
     ====================================================================== */
  $('#save-btn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Сохраняю…';

    fetch('api/content', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect())
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j.error || 'Ошибка сохранения');
        STATE.content.updatedAt = res.j.updatedAt;
        STATE.dirty = false;
        clearDraft();
        updateDirty();
        updateMeta();
        toast('Сохранено. Изменения уже на сайте.', 'ok');
      })
      .catch(function (err) {
        toast('Не сохранено: ' + err.message, 'err');
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Сохранить';
      });
  });

  /* Предупреждение о несохранённых правках при закрытии */
  window.addEventListener('beforeunload', function (e) {
    if (STATE.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ======================================================================
     5. Фотографии
     ====================================================================== */
  var IMG_SLOTS = [
    { key: 'hero',  label: 'Первый экран',  w: 800,  h: 1000, hint: 'Портрет 4:5, лицо в верхней трети' },
    { key: 'about', label: 'Блок «Обо мне»', w: 720, h: 720, hint: 'Квадрат 1:1' }
  ];

  function fillImages() {
    IMG_SLOTS.forEach(function (slot) {
      var url = getByPath(STATE.content, 'images.' + slot.key) || '';
      var img = $('#img-' + slot.key);
      var box = $('#preview-' + slot.key);
      if (img) img.src = url;
      if (box) box.classList.toggle('is-empty', !url);
    });
  }

  /* --- Сжатие картинки в браузере до WebP ---
     Это снимает необходимость ставить imagemagick/sharp на сервере. */
  function processImage(file, slot) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('Это не изображение'));

      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Не удалось прочитать файл')); };
      reader.onload = function () {
        var im = new Image();
        im.onerror = function () { reject(new Error('Файл повреждён или не поддерживается')); };
        im.onload = function () {
          // Режем по центру под нужное соотношение сторон
          var targetRatio = slot.w / slot.h;
          var sw = im.width, sh = im.height;
          var srcRatio = sw / sh;
          var cx = 0, cy = 0, cw = sw, ch = sh;

          if (srcRatio > targetRatio) {          // слишком широкая
            cw = sh * targetRatio;
            cx = (sw - cw) / 2;
          } else {                               // слишком высокая
            ch = sw / targetRatio;
            cy = (sh - ch) / 2;
          }

          // Не увеличиваем: маленькое фото оставляем как есть
          var scale = Math.min(1, slot.w / cw);
          var outW = Math.max(1, Math.round(cw * scale));
          var outH = Math.max(1, Math.round(ch * scale));

          var canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          var ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(im, cx, cy, cw, ch, 0, 0, outW, outH);

          var type = 'image/webp';
          var quality = 0.84;
          canvas.toBlob(function (blob) {
            if (!blob) {
              // Редкий случай: браузер без WebP — отдаём JPEG
              type = 'image/jpeg';
              return canvas.toBlob(function (jblob) {
                if (jblob) resolve({ blob: jblob, type: type, w: outW, h: outH });
                else reject(new Error('Не удалось обработать изображение'));
              }, 'image/jpeg', quality);
            }
            resolve({ blob: blob, type: type, w: outW, h: outH });
          }, type, quality);
        };
        im.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function uploadTo(slot, file) {
    var status = $('#status-' + slot.key);
    setStatus(status, 'Обрабатываю…', 'busy');

    processImage(file, slot)
      .then(function (res) {
        setStatus(status, 'Сжимаю до ' + res.w + '×' + res.h + '…', 'busy');
        return fetch('api/upload', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': res.type,
            'X-Name': slot.key,
            'X-Slot': slot.key
          },
          body: res.blob
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (r) {
            if (!r.ok) throw new Error(r.j.error || 'Ошибка загрузки');
            return r.j;
          })
          .then(function (info) {
            // Префикс кэша: новая картинка не должна браться из кэша браузера
            var url = info.url + '?v=' + Date.now();
            setByPath(STATE.content, 'images.' + slot.key, info.url);
            var img = $('#img-' + slot.key);
            img.src = url;
            $('#preview-' + slot.key).classList.remove('is-empty');
            STATE.dirty = true;
            updateDirty();
            setStatus(status, 'Загружено, ' + Math.round(info.bytes / 1024) + ' КБ', 'ok');
            toast('Фото «' + slot.label + '» загружено. Не забудьте нажать «Сохранить».', 'ok');
          });
      })
      .catch(function (err) {
        setStatus(status, err.message, 'err');
      });
  }

  function setStatus(el, text, kind) {
    el.textContent = text;
    el.className = 'imgbox__status' + (kind ? ' is-' + kind : '');
  }

  function initImages() {
    IMG_SLOTS.forEach(function (slot) {
      var input = $('#file-' + slot.key);
      var drop = $('#drop-' + slot.key);
      var reset = $('#reset-' + slot.key);

      input.addEventListener('change', function () {
        if (input.files && input.files[0]) uploadTo(slot, input.files[0]);
        input.value = '';
      });

      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
      });
      drop.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) uploadTo(slot, f);
      });

      reset.addEventListener('click', function () {
        if (!STATE.content.images) STATE.content.images = {};
        STATE.content.images[slot.key] = 'images/' + (slot.key === 'hero' ? 'teacher-1.svg' : 'teacher-2.svg');
        var img = $('#img-' + slot.key);
        img.src = STATE.content.images[slot.key] + '?v=' + Date.now();
        $('#preview-' + slot.key).classList.remove('is-empty');
        setStatus($('#status-' + slot.key), 'Возвращена заглушка', 'ok');
        STATE.dirty = true;
        updateDirty();
      });
    });
  }

  /* ======================================================================
     6. Черновик, предпросмотр, сброс, выход
     ====================================================================== */
  $('#discard-btn').addEventListener('click', function () {
    if (!confirm('Отменить все несохранённые правки?')) return;
    clearDraft();
    STATE.dirty = false;
    renderAll();
    fillImages();
    $('#draft-bar').hidden = true;
    toast('Правки отменены', 'info');
  });

  $('#draft-apply').addEventListener('click', function () {
    var draft = readDraft();
    if (!draft) return;
    STATE.content = draft;
    renderAll();
    $('#draft-bar').hidden = true;
    STATE.dirty = true;
    updateDirty();
    toast('Черновик восстановлен', 'ok');
  });

  $('#draft-drop').addEventListener('click', function () {
    clearDraft();
    $('#draft-bar').hidden = true;
    toast('Черновик удалён', 'info');
  });

  $('#preview-btn').addEventListener('click', function () {
    if (STATE.dirty && !confirm('Есть несохранённые правки. Открыть предпросмотр без них?')) return;
    window.open('../index.html?_preview=' + Date.now(), '_blank');
  });

  $('#logout-btn').addEventListener('click', function () {
    fetch('api/logout', { method: 'POST', credentials: 'same-origin' })
      .finally(function () { showLogin(); });
  });

  /* --- Навигация по разделам --- */
  (function initNav() {
    var links = $$('.nav__link');
    var sections = $$('.block');

    function activate() {
      var top = window.scrollY + 120;
      var current = sections[0];
      sections.forEach(function (s) { if (s.offsetTop <= top) current = s; });
      links.forEach(function (l) {
        l.classList.toggle('is-active', l.getAttribute('href') === '#' + current.id);
      });
    }

    window.addEventListener('scroll', activate, { passive: true });
    activate();

    links.forEach(function (l) {
      l.addEventListener('click', function (e) {
        e.preventDefault();
        var t = document.querySelector(l.getAttribute('href'));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  })();

  /* --- Разворачивание/сворачивание всех блоков --- */
  $('#expand-all').addEventListener('click', function () {
    $$('.block').forEach(function (b) { b.open = true; });
  });
  $('#collapse-all').addEventListener('click', function () {
    $$('.block').forEach(function (b) { b.open = false; });
  });

  /* --- Ctrl+S --- */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (STATE.dirty) $('#save-btn').click();
      else toast('Изменений нет', 'info');
    }
  });

  initImages();
})();
