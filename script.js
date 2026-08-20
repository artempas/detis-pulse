/* #пульсуй — логика лендинга.
   Реализовано по ТЗ: отсчёт минуты, форма с валидацией, расчёт ударов,
   анимированный результат, share-карточки, поп-ап пожертвования,
   карусель фактов, экран благодарности.
   Платёжный сценарий не реализован — см. блок PAYMENT в конце файла. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Настройки (согласовываются с фондом)                                */
  /* ------------------------------------------------------------------ */
  var CONFIG = {
    timerSeconds: 60,
    pulseMin: 30,            // нижняя граница допустимого пульса
    pulseMax: 220,           // верхняя граница допустимого пульса
    minYear: 1900,
    minuteOptions: [1, 2, 3, 5, 10],
    countUpMs: 2000
  };

  /* Состояние пользователя */
  var state = {
    birth: null,     // Date
    pulse: null,     // ударов в минуту
    beats: null,     // ударов за жизнь
    minutes: 1,      // выбрано минут для пожертвования
    donated: false
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ */
  /* Утилиты                                                             */
  /* ------------------------------------------------------------------ */
  var NBSP = ' ';

  /* Разделение на разряды неразрывным пробелом, чтобы число не переносилось */
  function formatNumber(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  /* Русское склонение: plural(2, ['удар','удара','ударов']) → 'удара' */
  function plural(n, forms) {
    n = Math.abs(n) % 100;
    var n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  function beatsWord(n) { return plural(n, ['удар', 'удара', 'ударов']); }
  function minutesWord(n) { return plural(n, ['минуту', 'минуты', 'минут']); }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function scrollToEl(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /* ------------------------------------------------------------------ */
  /* Экран 2 — отсчёт минуты                                             */
  /* ------------------------------------------------------------------ */
  (function initTimer() {
    var btn = $('#timer-btn');
    var reset = $('#timer-reset');
    var display = $('#timer-display');
    var status = $('#timer-status');
    if (!btn || !display) return;

    var left = CONFIG.timerSeconds;
    var tick = null;

    function render() {
      var text = String(left).length < 2 ? '0' + left : String(left);
      var cells = display.children;
      cells[0].textContent = text.charAt(0);
      cells[1].textContent = text.charAt(1);
    }

    function stop() {
      clearInterval(tick);
      tick = null;
      display.classList.remove('is-running');
    }

    function finish() {
      stop();
      btn.dataset.state = 'done';
      btn.textContent = 'Начать заново';
      btn.disabled = false;
      reset.hidden = true;
      status.textContent = 'Минута прошла. Введите получившееся число в поле «Пульс».';
      var pulseInput = $('#pulse');
      if (pulseInput) pulseInput.focus({ preventScroll: true });
    }

    function start() {
      stop();
      left = CONFIG.timerSeconds;
      render();
      btn.dataset.state = 'running';
      btn.textContent = 'Идет отсчет…';
      btn.disabled = true;
      /* Пока идёт отсчёт, основная кнопка заблокирована —
         перезапуск вынесен в отдельную кнопку (можно сбиться со счёта) */
      reset.hidden = false;
      status.textContent = 'Считайте пульсации, пока идет отсчет.';
      display.classList.add('is-running');
      tick = setInterval(function () {
        left -= 1;
        if (left <= 0) { left = 0; render(); finish(); return; }
        render();
      }, 1000);
    }

    btn.addEventListener('click', function () {
      if (tick) return;
      start();
    });

    reset.addEventListener('click', function () {
      start();
      reset.focus({ preventScroll: true });
    });

    render();
  })();

  /* ------------------------------------------------------------------ */
  /* Экран 2 — форма и валидация                                         */
  /* ------------------------------------------------------------------ */

  /* Маска dd.mm.yyyy */
  function maskDate(value) {
    var d = value.replace(/\D/g, '').slice(0, 8);
    var out = d.slice(0, 2);
    if (d.length > 2) out += '.' + d.slice(2, 4);
    if (d.length > 4) out += '.' + d.slice(4, 8);
    return out;
  }

  /* Разбор даты с проверкой существования (31.02.2000 → null) */
  function parseDate(value) {
    var m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
    if (!m) return null;
    var day = +m[1], month = +m[2], year = +m[3];
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  function setError(input, message) {
    var wrap = input.closest('.field-wrap');
    var field = input.closest('.field');
    var box = wrap && wrap.querySelector('.field__error');
    if (field) field.classList.toggle('is-invalid', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (box) box.textContent = message || '';
  }

  function validateBirthday(input) {
    var value = input.value.trim();
    if (!value) return 'Укажите дату рождения';
    if (value.length < 10) return 'Введите дату полностью в формате дд.мм.гггг';

    var date = parseDate(value);
    if (!date) return 'Такой даты не существует. Формат: дд.мм.гггг';

    var today = new Date();
    today.setHours(23, 59, 59, 999);
    if (date.getTime() > today.getTime()) return 'Дата рождения не может быть в будущем';
    if (date.getFullYear() < CONFIG.minYear) return 'Проверьте год рождения';
    return '';
  }

  function validatePulse(input) {
    var value = input.value.trim();
    if (!value) return 'Укажите свой пульс';
    if (!/^\d+$/.test(value)) return 'Пульс — это число, например 72';

    var n = +value;
    if (n < CONFIG.pulseMin || n > CONFIG.pulseMax) {
      return 'Пульс должен быть от ' + CONFIG.pulseMin + ' до ' + CONFIG.pulseMax + ' ударов в минуту';
    }
    return '';
  }

  (function initForm() {
    var form = $('#pulse-form');
    if (!form) return;

    var birthday = $('#birthday');
    var native = $('#birthday-native');
    var pulse = $('#pulse');

    /* Ограничения нативного календаря */
    if (native) {
      var now = new Date();
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      native.max = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
      native.min = CONFIG.minYear + '-01-01';
      native.addEventListener('change', function () {
        if (!native.value) return;
        var parts = native.value.split('-');
        birthday.value = parts[2] + '.' + parts[1] + '.' + parts[0];
        setError(birthday, validateBirthday(birthday));
      });
    }

    birthday.addEventListener('input', function () {
      var pos = birthday.selectionStart;
      var before = birthday.value;
      birthday.value = maskDate(before);
      /* курсор не «прыгает» в конец при правке внутри строки */
      if (pos !== null && pos < before.length) {
        birthday.setSelectionRange(pos, pos);
      }
      if (birthday.getAttribute('aria-invalid') === 'true') {
        setError(birthday, validateBirthday(birthday));
      }
    });
    birthday.addEventListener('blur', function () {
      if (birthday.value) setError(birthday, validateBirthday(birthday));
    });

    pulse.addEventListener('input', function () {
      pulse.value = pulse.value.replace(/\D/g, '').slice(0, 3);
      if (pulse.getAttribute('aria-invalid') === 'true') {
        setError(pulse, validatePulse(pulse));
      }
    });
    pulse.addEventListener('blur', function () {
      if (pulse.value) setError(pulse, validatePulse(pulse));
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var birthdayError = validateBirthday(birthday);
      var pulseError = validatePulse(pulse);
      setError(birthday, birthdayError);
      setError(pulse, pulseError);

      if (birthdayError || pulseError) {
        var first = birthdayError ? birthday : pulse;
        first.focus({ preventScroll: true });
        first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        return;
      }

      state.birth = parseDate(birthday.value);
      state.pulse = +pulse.value;
      state.beats = calcBeats(state.birth, state.pulse);
      showResult();
    });
  })();

  /* ------------------------------------------------------------------ */
  /* Экран 3 — расчёт и результат                                        */
  /* ------------------------------------------------------------------ */

  /* Формула: минут жизни × пульс в покое.
     Минуты считаются от даты рождения (00:00) до момента `at`,
     результат округляется вниз до целого удара.
     Минуты специально не округляются до целых: иначе число росло бы
     скачком раз в минуту, а не в темпе пульса. */
  function calcBeats(birth, pulse, at) {
    var ms = (at || Date.now()) - birth.getTime();
    return Math.max(0, Math.floor(ms / 60000 * pulse));
  }

  /* Число всегда в одну строку: подбираем размер под ширину контейнера */
  function fitNumber(el) {
    el.style.fontSize = '';
    var parent = el.parentElement;
    var available = parent.clientWidth -
      parseFloat(getComputedStyle(parent).paddingLeft) -
      parseFloat(getComputedStyle(parent).paddingRight);
    if (available <= 0) return;

    var size = parseFloat(getComputedStyle(el).fontSize);
    for (var i = 0; i < 6 && el.scrollWidth > available + 1; i++) {
      size = size * Math.max(0.5, (available / el.scrollWidth)) * 0.99;
      el.style.fontSize = size + 'px';
    }
  }

  function countUp(el, target, done) {
    var value = el.querySelector('.counter__value');
    if (!value) return;

    if (reduceMotion || target === 0) {
      value.textContent = formatNumber(target);
      fitNumber(el);
      if (done) done();
      return;
    }

    /* Резервируем ширину финальным числом, чтобы блок не «дёргался» */
    value.textContent = formatNumber(target);
    fitNumber(el);

    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var p = Math.min(1, (now - start) / CONFIG.countUpMs);
      var eased = 1 - Math.pow(1 - p, 3);
      value.textContent = formatNumber(target * eased);
      if (p < 1) requestAnimationFrame(frame);
      else if (done) done();
    }
    requestAnimationFrame(frame);
  }

  /* Обновление числа без перезапуска подгонки кегля:
     пересчитываем размер, только если число прибавило разряд */
  function setNumber(el, value) {
    if (!el) return;
    var box = el.querySelector('.counter__value');
    if (!box) return;

    var text = formatNumber(value);
    if (box.textContent === text) return;
    var widthChanged = text.length !== box.textContent.length;
    box.textContent = text;
    if (widthChanged) fitNumber(el);
  }

  /* Живой счётчик: число продолжает расти в темпе введённого пульса.
     Значение каждый раз пересчитывается от системных часов, поэтому
     счётчик не «уплывает» при троттлинге вкладки и после сна устройства. */
  var liveTimer = null;

  /* Короткий «толчок» числа в такт удару.
     Длительность фиксированная, а не доля периода: на высоком пульсе
     растянутый толчок сливался бы в непрерывное дрожание. */
  function beat(el, duration) {
    if (reduceMotion || !el || !el.animate) return;
    el.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.02)', offset: 0.35 },
      { transform: 'scale(1)' }
    ], { duration: duration, easing: 'ease-out' });
  }

  function startLiveCounter() {
    stopLiveCounter();
    if (!state.birth || !state.pulse) return;

    /* Один удар = 60000 / пульс мс (при пульсе 72 — примерно 833 мс) */
    var period = Math.max(50, 60000 / state.pulse);
    var thump = Math.min(160, period * 0.5);

    liveTimer = setInterval(function () {
      state.beats = calcBeats(state.birth, state.pulse);
      var result = $('#result-number');
      var personal = $('#personal-number');
      setNumber(result, state.beats);
      setNumber(personal, state.beats);
      beat(result, thump);
      beat(personal, thump);
    }, period);
  }

  function stopLiveCounter() {
    clearInterval(liveTimer);
    liveTimer = null;
  }

  function unlock(el) {
    if (!el) return;
    el.hidden = false;
    el.classList.remove('is-locked');
  }

  function showResult() {
    var result = $('#result');
    var donate = $('#donate');
    var personal = $('#personal-card');

    unlock(result);
    unlock(donate);
    unlock(personal);

    /* Персонализация блока пожертвования */
    $('#donate-pulse').textContent = state.pulse + ' ' + beatsWord(state.pulse);
    updateMinutesLabel();
    updateSteppers();

    scrollToEl(result);
    /* Сначала анимация подсчёта до текущего значения, затем живой счётчик */
    countUp($('#result-number'), state.beats, startLiveCounter);
    countUp($('#personal-number'), state.beats);
  }

  function updateMinutesLabel() {
    var el = $('#donate-minutes');
    if (el) el.textContent = state.minutes + ' ' + minutesWord(state.minutes);
  }

  /* Шаг ограничен списком вариантов — на краях кнопки гаснут */
  function updateSteppers() {
    var options = CONFIG.minuteOptions;
    var i = options.indexOf(state.minutes);
    $$('[data-minutes-step]').forEach(function (btn) {
      var dir = Number(btn.dataset.minutesStep);
      btn.disabled = dir < 0 ? i <= 0 : i >= options.length - 1;
    });
  }

  /* Пересчёт размера числа при смене ориентации/ширины окна */
  var resizeRaf;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(function () {
      $$('#result-number, #personal-number').forEach(function (el) {
        if (!el.closest('section').hidden) fitNumber(el);
      });
    });
  });

  /* Кнопка «Помочь» в шапке: пока расчёт не сделан, блока пожертвования
     ещё нет — ведём пользователя к форме замера пульса */
  (function initHeaderHelp() {
    var link = $('.header__help');
    if (!link) return;
    link.addEventListener('click', function (e) {
      var donate = $('#donate');
      if (!donate || !donate.hidden) return;
      e.preventDefault();
      scrollToEl($('#measure'));
      var birthday = $('#birthday');
      if (birthday) birthday.focus({ preventScroll: true });
    });
  })();

  /* ------------------------------------------------------------------ */
  /* Модальные окна                                                      */
  /* ------------------------------------------------------------------ */
  var lastFocused = null;

  function openModal(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-modal-open');
    var dialog = modal.querySelector('.modal__dialog');
    var focusable = dialog.querySelector('button, [href], input, select, textarea');
    if (focusable) focusable.focus({ preventScroll: true });
  }

  function closeModal(modal) {
    modal.hidden = true;
    if (!$('.modal:not([hidden])')) document.body.classList.remove('is-modal-open');
    if (lastFocused) lastFocused.focus({ preventScroll: true });
  }

  document.addEventListener('click', function (e) {
    var closer = e.target.closest('[data-close-modal]');
    if (closer) closeModal(closer.closest('.modal'));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = $('.modal:not([hidden])');
    if (open) closeModal(open);
  });

  /* ------------------------------------------------------------------ */
  /* Поп-ап пожертвования                                                */
  /* ------------------------------------------------------------------ */
  (function initDonate() {
    var box = $('#minutes-options');
    if (!box) return;

    /* Кнопки вариантов: 1 минута — 72 ₽, 2 минуты — 144 ₽, 3, 5, 10 минут */
    CONFIG.minuteOptions.forEach(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'minutes__item';
      btn.dataset.minutes = m;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.innerHTML =
        '<span class="minutes__count">' + m + ' ' + minutesWord(m) + '</span>' +
        '<span class="minutes__sum"></span>';
      box.appendChild(btn);
    });

    function renderOptions() {
      var pulse = state.pulse || 72;
      $$('.minutes__item', box).forEach(function (btn) {
        var m = +btn.dataset.minutes;
        btn.querySelector('.minutes__sum').textContent = formatNumber(m * pulse) + NBSP + '₽';
        var active = m === state.minutes;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      $('#modal-pulse').textContent = pulse;
      $('#modal-rate').textContent = formatNumber(pulse) + NBSP + '₽';
      /* Сумма = количество минут × пульс пользователя */
      $('#donate-sum').textContent = formatNumber(state.minutes * pulse) + NBSP + '₽';
    }

    box.addEventListener('click', function (e) {
      var btn = e.target.closest('.minutes__item');
      if (!btn) return;
      state.minutes = +btn.dataset.minutes;
      updateMinutesLabel();
      renderOptions();
    });

    /* «−» и «+» только меняют количество минут, не открывая поп-ап */
    document.addEventListener('click', function (e) {
      var step = e.target.closest('[data-minutes-step]');
      if (!step) return;

      var options = CONFIG.minuteOptions;
      var i = options.indexOf(state.minutes);
      if (i === -1) i = 0;
      i = Math.max(0, Math.min(options.length - 1, i + Number(step.dataset.minutesStep)));
      state.minutes = options[i];
      updateMinutesLabel();
      renderOptions();
      updateSteppers();
    });

    /* Поп-ап открывается по центральной надписи «Подарить N минут…» */
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-open-donate]')) return;
      renderOptions();
      openModal('donate-modal');
    });

    $('#donate-submit').addEventListener('click', function () {
      /* PAYMENT: здесь будет вызов платежной формы сервиса фонда. */
      startPayment(state.minutes, state.minutes * (state.pulse || 72));
    });

    /* Демонстрация экрана благодарности, пока платежная форма не подключена */
    var demo = $('#demo-success');
    if (demo) {
      demo.addEventListener('click', function () {
        closeModal($('#donate-modal'));
        onPaymentSuccess();
      });
    }

    renderOptions();
  })();

  /* ------------------------------------------------------------------ */
  /* Экран благодарности                                                 */
  /* ------------------------------------------------------------------ */

  /* Показывается ТОЛЬКО после успешной оплаты.
     Если пользователь закрыл или пропустил платеж — экран остаётся скрытым,
     и он просто скроллит дальше к карточкам с фактами. */
  function onPaymentSuccess() {
    state.donated = true;
    var thanks = $('#thanks');
    unlock(thanks);
    scrollToEl(thanks);
  }

  /* ------------------------------------------------------------------ */
  /* Share-карточки                                                      */
  /* ------------------------------------------------------------------ */
  var imageCache = {};

  function loadImage(src) {
    if (imageCache[src]) return imageCache[src];
    imageCache[src] = new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
    return imageCache[src];
  }

  function shareText(variant) {
    var num = formatNumber(state.beats || 0).replace(/ /g, ' ');
    if (variant === 'result') {
      return num + ' ' + beatsWord(state.beats) + ' за всю жизнь мое сердце сделало. #пульсуй';
    }
    return 'За всю жизнь мое сердце сделало ' + num + ' ' + beatsWord(state.beats) +
      '. Сегодня я подарил минуту его ритма ребенку с пороком сердца. ' +
      'Подари минуту сердцу #Пульсуй';
  }

  /* Перенос по словам: возвращает массив строк, помещающихся в maxWidth */
  function splitLines(ctx, text, maxWidth) {
    var words = text.split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /* Подбор кегля, чтобы строка целиком помещалась в maxWidth */
  function fitFont(ctx, text, maxWidth, startSize, weight, family) {
    var size = startSize;
    do {
      ctx.font = weight + ' ' + size + 'px ' + family;
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 4;
    } while (size > 20);
    return size;
  }

  function buildCard(variant) {
    return Promise.all([
      loadImage('assets/ds_logo.png'),
      loadImage('assets/heart8.png'),
      document.fonts ? document.fonts.ready : Promise.resolve()
    ]).then(function (res) {
      var logo = res[0];
      var heart = res[1];

      var W = 1080, H = 1350, PAD = 80;
      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');
      var FAMILY = 'Intro, Inter, sans-serif';

      /* Фон */
      ctx.fillStyle = '#BF2C23';
      ctx.fillRect(0, 0, W, H);

      /* Декоративные сердца по краям.
         У heart8.png непрозрачный белый фон, поэтому режим multiply —
         как mix-blend-mode на самой странице: белое исчезает, остаётся сердце */
      var hw = 84;
      var hh = hw * (heart.height / heart.width);
      ctx.globalCompositeOperation = 'multiply';
      [0.10, 0.30, 0.50, 0.70].forEach(function (t, i) {
        var hy = H * t;
        ctx.drawImage(heart, i % 2 ? 26 : 66, hy, hw, hh);
        ctx.drawImage(heart, W - hw - (i % 2 ? 26 : 66), hy + 16, hw, hh);
      });
      ctx.globalCompositeOperation = 'source-over';

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var cx = W / 2;
      var maxW = W - PAD * 2;
      var top = 110;

      /* Логотип фонда на белой плашке (лого красное — на красном не читается) */
      var lw = 440;
      var lh = lw * (logo.height / logo.width);
      ctx.fillStyle = '#fff';
      roundRect(ctx, cx - lw / 2 - 28, top - 22, lw + 56, lh + 44, 24);
      ctx.fill();
      ctx.drawImage(logo, cx - lw / 2, top, lw, lh);

      /* Содержимое карточки описывается блоками, чтобы его можно было
         измерить и отцентрировать между логотипом и нижней строкой */
      var num = formatNumber(state.beats || 0);
      var blocks;

      if (variant === 'result') {
        blocks = [
          { text: num, weight: '700', size: fitFont(ctx, num, maxW, 150, '700', FAMILY), lh: 1.2, gap: 44 },
          { text: beatsWord(state.beats) + ' за всю жизнь мое сердце сделало', weight: '700', size: 56, lh: 1.28, gap: 0 }
        ];
      } else {
        blocks = [
          { text: 'За всю жизнь мое сердце сделало', weight: '700', size: 52, lh: 1.3, gap: 30 },
          { text: num, weight: '700', size: fitFont(ctx, num, maxW, 138, '700', FAMILY), lh: 1.2, gap: 36 },
          { text: beatsWord(state.beats) + '. Сегодня я подарил минуту его ритма ребенку с пороком сердца.', weight: '400', size: 46, lh: 1.35, gap: 0 }
        ];
      }

      /* Замер: сколько строк займёт каждый блок */
      var total = 0;
      blocks.forEach(function (b) {
        ctx.font = b.weight + ' ' + b.size + 'px ' + FAMILY;
        b.lines = splitLines(ctx, b.text, maxW);
        b.height = b.lines.length * b.size * b.lh;
        total += b.height + b.gap;
      });

      var areaTop = top + lh + 60;
      var areaBottom = H - 250;
      var y = areaTop + Math.max(0, (areaBottom - areaTop - total) / 2);

      ctx.fillStyle = '#fff';
      blocks.forEach(function (b) {
        ctx.font = b.weight + ' ' + b.size + 'px ' + FAMILY;
        b.lines.forEach(function (line) {
          ctx.fillText(line, cx, y);
          y += b.size * b.lh;
        });
        y += b.gap;
      });

      /* Нижняя строка — хэштег акции */
      ctx.font = '700 56px ' + FAMILY;
      ctx.fillText('Подари минуту сердцу #пульсуй', cx, H - 190);

      ctx.font = '400 28px ' + FAMILY;
      ctx.globalAlpha = 0.8;
      ctx.fillText('Благотворительный фонд «Детские сердца»', cx, H - 100);
      ctx.globalAlpha = 1;

      return canvas;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  (function initShare() {
    var modal = $('#share-modal');
    if (!modal) return;

    var img = $('#share-image');
    var textBox = $('#share-text');
    var status = $('#share-status');
    var nativeBtn = $('#share-native');
    var downloadLink = $('#share-download');
    var copyBtn = $('#share-copy');
    var currentBlob = null;
    var currentUrl = null;

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-share]');
      if (!trigger) return;
      openShare(trigger.dataset.share);
    });

    function openShare(variant) {
      status.textContent = '';
      textBox.textContent = shareText(variant);
      openModal('share-modal');

      buildCard(variant).then(function (canvas) {
        canvas.toBlob(function (blob) {
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          currentBlob = blob;
          currentUrl = URL.createObjectURL(blob);
          img.src = currentUrl;
          downloadLink.href = currentUrl;

          var file = new File([blob], 'pulsuy.png', { type: 'image/png' });
          var canShareFile = navigator.canShare && navigator.canShare({ files: [file] });
          nativeBtn.hidden = !canShareFile;
          nativeBtn.onclick = function () {
            navigator.share({ text: textBox.textContent, files: [file] })
              .catch(function () { /* пользователь отменил — молча */ });
          };
        }, 'image/png');
      }).catch(function () {
        status.textContent = 'Не удалось собрать карточку. Попробуйте еще раз.';
      });
    }

    copyBtn.addEventListener('click', function () {
      var text = textBox.textContent;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          status.textContent = 'Текст скопирован';
        }, function () {
          status.textContent = 'Скопируйте текст вручную';
        });
      } else {
        status.textContent = 'Скопируйте текст вручную';
      }
    });
  })();

  /* ------------------------------------------------------------------ */
  /* Карусель фактов: стрелки, точки, свайп                              */
  /* ------------------------------------------------------------------ */
  (function initFacts() {
    var track = $('#facts-track');
    var dotsBox = $('#facts-dots');
    if (!track || !dotsBox) return;

    var cards = Array.prototype.slice.call(track.children);
    var dots = $$('button', dotsBox);
    var prev = $('.nav-btn--prev');
    var next = $('.nav-btn--next');
    var current = 0;

    function step() {
      if (cards.length < 2) return track.clientWidth;
      return cards[1].offsetLeft - cards[0].offsetLeft;
    }

    function setCurrent(index) {
      current = index;
      dots.forEach(function (dot, i) {
        dot.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index === cards.length - 1;
    }

    function goTo(index) {
      index = Math.max(0, Math.min(cards.length - 1, index));
      track.scrollTo({ left: index * step(), behavior: reduceMotion ? 'auto' : 'smooth' });
      setCurrent(index);
    }

    function sync() {
      var index = Math.round(track.scrollLeft / step());
      index = Math.max(0, Math.min(cards.length - 1, index));
      if (index !== current) setCurrent(index);
    }

    [prev, next].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        goTo(current + Number(btn.dataset.dir));
      });
    });

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { goTo(i); });
    });

    /* Стрелки клавиатуры внутри карусели */
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { goTo(current + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { goTo(current - 1); e.preventDefault(); }
    });

    var raf;
    track.addEventListener('scroll', function () {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    }, { passive: true });

    setCurrent(0);
  })();

  /* ------------------------------------------------------------------ */
  /* PAYMENT — платежный сценарий (подключается позже)                   */
  /* ------------------------------------------------------------------ */

  /* Точка интеграции с платежным сервисом фонда.
     Сейчас форма оплаты не подключена: показываем заглушку.
     После подключения здесь инициализируется виджет в контейнер #pay-slot,
     а по колбэку успешной оплаты вызывается Pulse.onPaymentSuccess(). */
  function startPayment(minutes, amount) {
    var slot = $('#pay-slot');
    if (!slot) return;
    slot.hidden = false;
    slot.innerHTML = '<p>Здесь будет платежная форма: ' +
      minutes + ' ' + minutesWord(minutes) + ' — ' + formatNumber(amount) + NBSP + '₽.</p>';
  }

  /* Публичный API для платежного модуля */
  window.Pulse = {
    onPaymentSuccess: onPaymentSuccess,
    getState: function () {
      return {
        pulse: state.pulse,
        beats: state.beats,
        minutes: state.minutes,
        amount: state.minutes * (state.pulse || 0)
      };
    },
    config: CONFIG
  };
})();
