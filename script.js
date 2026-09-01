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
    minuteOptions: [1, 5, 10, 60],
    customMinutesMax: 1440,  // сутки — верхняя граница для «выбрать время»
    countUpMs: 2000
  };

  /* Состояние пользователя */
  var state = {
    birth: null,     // Date
    pulse: null,     // ударов в минуту
    beats: null,     // ударов за жизнь
    minutes: 1,      // выбрано минут для пожертвования
    customTime: false, // выбран режим «выбрать время», а не готовая плитка
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

  /* Кратные 60 показываем в часах: 60 → «1 час», 120 → «2 часа».
     Именительный падеж — для плитки варианта («1 минута»),
     винительный — для надписи «Подарить …» («1 минуту»). */
  function durationText(n, nominative) {
    if (n >= 60 && n % 60 === 0) {
      var h = n / 60;
      return h + NBSP + plural(h, ['час', 'часа', 'часов']);
    }
    var forms = nominative
      ? ['минута', 'минуты', 'минут']
      : ['минуту', 'минуты', 'минут'];
    return n + NBSP + plural(n, forms);
  }

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
    var ringEl = $('.step__ring-progress', display);
    var valueEl = $('.step__ring-value', display);
    var ringCircumference = ringEl ? 2 * Math.PI * ringEl.r.baseVal.value : 0;

    function render() {
      if (valueEl) valueEl.textContent = String(left);
      if (ringEl) {
        var fraction = left / CONFIG.timerSeconds;
        ringEl.style.strokeDashoffset = String(ringCircumference * (1 - fraction));
      }
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

  /* Маска dd.mm.yyyy: подчёркивания стоят на месте ещё не введённых цифр,
     сама маска — значение поля, а не placeholder, поэтому во время ввода
     видно, что уже набрано: __.__.____ → 3_.__.____ → 31.__.____ ... */
  var DATE_MASK = '__.__.____';
  var DATE_DIGIT_POS = [0, 1, 3, 4, 6, 7, 8, 9]; /* позиции цифр в маске */

  function buildMaskedDate(digits) {
    var chars = DATE_MASK.split('');
    for (var i = 0; i < DATE_DIGIT_POS.length; i++) {
      chars[DATE_DIGIT_POS[i]] = digits[i] || '_';
    }
    return chars.join('');
  }

  function digitsFromValue(value) {
    var d = (value || '').replace(/\D/g, '').slice(0, 8);
    return d.split('');
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
    if (value.indexOf('_') !== -1) return 'Введите дату полностью в формате дд.мм.гггг';

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

    /* Цифры уже введённой даты (0-8 символов), маска строится из них */
    var birthdayDigits = digitsFromValue(birthday.value);

    function renderBirthday(caretDigitIndex) {
      birthday.value = buildMaskedDate(birthdayDigits);
      var pos = caretDigitIndex >= DATE_DIGIT_POS.length
        ? DATE_MASK.length
        : DATE_DIGIT_POS[caretDigitIndex];
      birthday.setSelectionRange(pos, pos);
    }

    function firstEmptyDigitIndex() {
      for (var i = 0; i < 8; i++) {
        if (!birthdayDigits[i]) return i;
      }
      return 8;
    }

    function lastFilledDigitIndex() {
      for (var i = 7; i >= 0; i--) {
        if (birthdayDigits[i]) return i;
      }
      return -1;
    }

    function hasAnyDigit() {
      return lastFilledDigitIndex() >= 0;
    }

    /* Курсор всегда стоит сразу за последней введённой цифрой —
       редактирование «в середине» кликом или стрелками не предусмотрено */
    function caretToEnd() {
      renderBirthday(firstEmptyDigitIndex());
    }

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
        birthdayDigits = digitsFromValue(birthday.value);
        setError(birthday, validateBirthday(birthday));
      });
    }

    birthday.addEventListener('focus', caretToEnd);

    /* Клик/выделение не должны переставлять курсор в середину маски —
       после того как браузер расставит выделение сами, возвращаем его в конец */
    birthday.addEventListener('mouseup', function (e) {
      e.preventDefault();
      caretToEnd();
    });

    birthday.addEventListener('keydown', function (e) {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        var idx = firstEmptyDigitIndex();
        if (idx >= 8) return;
        birthdayDigits[idx] = e.key;
        renderBirthday(idx + 1);
        if (birthday.getAttribute('aria-invalid') === 'true') {
          setError(birthday, validateBirthday(birthday));
        }
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        var lastIdx = lastFilledDigitIndex();
        if (lastIdx < 0) return;
        birthdayDigits[lastIdx] = '';
        renderBirthday(lastIdx);
        if (birthday.getAttribute('aria-invalid') === 'true') {
          setError(birthday, validateBirthday(birthday));
        }
        return;
      }
      /* Стрелки, Home/End и т.п. не должны сдвигать курсор с конца */
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
      }
    });

    birthday.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text');
      var pasted = digitsFromValue(text);
      birthdayDigits = pasted.concat(new Array(8 - pasted.length).fill(''));
      renderBirthday(pasted.length);
      if (birthday.getAttribute('aria-invalid') === 'true') {
        setError(birthday, validateBirthday(birthday));
      }
    });

    birthday.addEventListener('blur', function () {
      if (!hasAnyDigit()) {
        birthday.value = '';
      }
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
     растянутый толчок сливался бы в непрерывное дрожание.
     Толкается только сама цифра (.counter__value), не звёздочка —
     иначе на пике толчка звёздочка тоже подрастала бы и «прыгала». */
  function beat(el, duration) {
    if (reduceMotion || !el || !el.animate) return;
    var box = el.querySelector('.counter__value') || el;
    box.animate([
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
    if (el) el.textContent = durationText(state.minutes, false);
  }

  /* Шаг ограничен списком вариантов — на краях кнопки гаснут.
     Произвольное значение из «выбрать время» в список не попадает,
     поэтому границы считаем по крайним вариантам, а не по индексу. */
  function updateSteppers() {
    var options = CONFIG.minuteOptions;
    $$('[data-minutes-step]').forEach(function (btn) {
      var dir = Number(btn.dataset.minutesStep);
      btn.disabled = dir < 0
        ? state.minutes <= options[0]
        : state.minutes >= options[options.length - 1];
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

    var customInput = $('#custom-minutes');
    var customWrap = $('#custom-time');

    /* Готовые варианты: 1 минута, 5 минут, 10 минут, 1 час */
    CONFIG.minuteOptions.forEach(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'minutes__item';
      btn.dataset.minutes = m;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.innerHTML =
        '<span class="minutes__count">' + durationText(m, true) + '</span>' +
        '<span class="minutes__sum"></span>';
      box.appendChild(btn);
    });

    /* Последняя плитка — «выбрать время»: раскрывает поле для своего значения */
    var customBtn = document.createElement('button');
    customBtn.type = 'button';
    customBtn.className = 'minutes__item minutes__item--custom';
    customBtn.dataset.custom = '';
    customBtn.setAttribute('role', 'radio');
    customBtn.setAttribute('aria-checked', 'false');
    customBtn.setAttribute('aria-controls', 'custom-time');
    customBtn.innerHTML = '<span class="minutes__count">Выбрать<br>время</span>';
    box.appendChild(customBtn);

    function renderOptions() {
      var pulse = state.pulse || 72;
      var custom = state.customTime;

      $$('.minutes__item[data-minutes]', box).forEach(function (btn) {
        var m = +btn.dataset.minutes;
        btn.querySelector('.minutes__sum').textContent = formatNumber(m * pulse) + NBSP + '₽';
        var active = !custom && m === state.minutes;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
      });

      customBtn.classList.toggle('is-active', custom);
      customBtn.setAttribute('aria-checked', custom ? 'true' : 'false');
      customBtn.setAttribute('aria-expanded', custom ? 'true' : 'false');
      if (customWrap) customWrap.hidden = !custom;
      if (custom && customInput && +customInput.value !== state.minutes) {
        customInput.value = state.minutes;
      }

      $('#modal-pulse').textContent = pulse;
      $('#modal-rate').textContent = formatNumber(pulse) + NBSP + '₽';
      /* Сумма = количество минут × пульс пользователя */
      $('#donate-sum').textContent = formatNumber(state.minutes * pulse) + NBSP + '₽';
    }

    function setMinutes(m, custom) {
      state.minutes = m;
      state.customTime = !!custom;
      updateMinutesLabel();
      renderOptions();
      updateSteppers();
    }

    box.addEventListener('click', function (e) {
      var btn = e.target.closest('.minutes__item');
      if (!btn) return;

      if (btn === customBtn) {
        if (!state.customTime) {
          setMinutes(customInput ? Math.max(1, Math.round(+customInput.value) || 1) : 1, true);
        }
        if (customInput) customInput.focus();
        return;
      }
      setMinutes(+btn.dataset.minutes, false);
    });

    if (customInput) {
      customInput.max = CONFIG.customMinutesMax;
      customInput.addEventListener('input', function () {
        var m = Math.round(+customInput.value);
        if (!isFinite(m) || m < 1) return;
        setMinutes(Math.min(m, CONFIG.customMinutesMax), true);
      });
      /* На blur возвращаем корректное значение, если поле пустое или обрезано */
      customInput.addEventListener('blur', function () {
        customInput.value = state.minutes;
      });
    }

    /* «−» и «+» только меняют количество минут, не открывая поп-ап.
       Для произвольного значения шагаем к ближайшему готовому варианту. */
    document.addEventListener('click', function (e) {
      var step = e.target.closest('[data-minutes-step]');
      if (!step) return;

      var options = CONFIG.minuteOptions;
      var dir = Number(step.dataset.minutesStep);
      var i = options.indexOf(state.minutes);

      if (i === -1) {
        /* Ближайший вариант в нужную сторону */
        var next = dir < 0
          ? options.filter(function (m) { return m < state.minutes; }).pop()
          : options.filter(function (m) { return m > state.minutes; })[0];
        setMinutes(next === undefined ? state.minutes : next);
        return;
      }

      i = Math.max(0, Math.min(options.length - 1, i + dir));
      setMinutes(options[i]);
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
  /* Карусель фактов: стрелки, свайп                                      */
  /* ------------------------------------------------------------------ */
  (function initFacts() {
    var track = $('#facts-track');
    if (!track) return;

    var cards = Array.prototype.slice.call(track.children);
    var prev = $('.nav-btn--prev');
    var next = $('.nav-btn--next');
    var current = 0;

    /* Точки-индикаторы: по одной на карточку, поэтому строим их из самих
       карточек, а не держим фиксированный список в разметке */
    var dotsBox = $('#facts-dots');
    var dots = cards.map(function (card, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'facts__dot';
      dot.setAttribute('aria-label', 'Факт ' + (i + 1));
      dot.addEventListener('click', function () { goTo(i); });
      if (dotsBox) dotsBox.appendChild(dot);
      return dot;
    });

    /* Целевой scrollLeft для карточки — по её реальному offsetLeft, а не
       умножением условного «шага»: так не накапливается субпиксельная
       погрешность и последняя карточка не улетает за реальный предел скролла. */
    function targetFor(index) {
      var max = track.scrollWidth - track.clientWidth;
      var raw = cards[index].offsetLeft - cards[0].offsetLeft;
      return Math.max(0, Math.min(max, raw));
    }

    function setCurrent(index) {
      current = index;
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index === cards.length - 1;
      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i === index);
        dot.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
    }

    function goTo(index) {
      index = Math.max(0, Math.min(cards.length - 1, index));
      track.scrollTo({ left: targetFor(index), behavior: reduceMotion ? 'auto' : 'smooth' });
      setCurrent(index);
    }

    function sync() {
      var pos = track.scrollLeft;
      var index = 0;
      var minDist = Infinity;
      cards.forEach(function (card, i) {
        var dist = Math.abs(targetFor(i) - pos);
        if (dist < minDist) { minDist = dist; index = i; }
      });
      if (index !== current) setCurrent(index);
    }

    [prev, next].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        goTo(current + Number(btn.dataset.dir));
      });
    });

    /* Стрелки клавиатуры внутри карусели */
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { goTo(current + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { goTo(current - 1); e.preventDefault(); }
    });

    /* Синк — только после того как скролл реально остановился: если дёргать
       его на каждом кадре скролла (в т.ч. во время анимированного goTo),
       current мелькает через промежуточные карточки, дёргая disabled у стрелок. */
    var syncTimer;
    track.addEventListener('scroll', function () {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(sync, 120);
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
      durationText(minutes, true) + ' — ' + formatNumber(amount) + NBSP + '₽.</p>';
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
