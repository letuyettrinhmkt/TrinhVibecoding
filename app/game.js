/* Đập Chuột — logic game theo docs/04-quy-tac-du-lieu.html */
(function () {
  'use strict';

  // ---------- Hằng số cấu hình ----------
  var ROUND_MS = 30000;
  var COUNTDOWN_STEPS = 3;
  var COUNTDOWN_STEP_MS = 1000;
  var UP_MIN_MS = 800;
  var UP_MAX_MS = 1200;
  var GAP_MS = 300;
  var WARN_SECONDS = 5;
  var HOLES = 9;
  var STORAGE_KEY = 'dap-chuot.best';
  var SOUND_KEY = 'dap-chuot.sound';
  var BLACK_CHANCE = 1 / 6;   // tỉ lệ mèo đen
  var FLOAT_MS = 750;         // thời gian hiện "+1 Úi da!" / "−1 Nà ní!"

  var HIT_EFFECT_MS = 200;   // hình "bị đập" trước khi biến mất
  var END_BUTTON_LOCK_MS = 600; // tránh cú chạm cuối lượt rơi trúng nút "Chơi lại"

  // ---------- Trạng thái ----------
  var state = {
    phase: 'START',     // START | COUNTDOWN | PLAYING | PAUSED | ENDED
    score: 0,
    hits: 0,
    misses: 0,
    blackHits: 0,
    moleKind: 'pink',   // pink | black
    remainingMs: ROUND_MS,
    startedAt: 0,
    activeHole: null,
    moleState: 'none', // none | up | hit | down
    lastHole: null,
    best: 0,
    isNewBest: false
  };

  var timers = [];
  var moleTimer = null;
  var tickTimer = null;

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }
  var el = {
    screenStart: $('screen-start'),
    screenPlay: $('screen-play'),
    screenEnd: $('screen-end'),
    startBest: $('start-best'),
    startBestValue: $('start-best-value'),
    btnStart: $('btn-start'),
    hudScore: $('hud-score'),
    hudTime: $('hud-time'),
    hudTimeWrap: $('hud-time-wrap'),
    board: $('board'),
    overlayCountdown: $('overlay-countdown'),
    countdownNum: $('countdown-num'),
    overlayPaused: $('overlay-paused'),
    pausedTime: $('paused-time'),
    pausedScore: $('paused-score'),
    btnResume: $('btn-resume'),
    playHint: $('play-hint'),
    endScore: $('end-score'),
    endNewBest: $('end-new-best'),
    endBest: $('end-best'),
    endHits: $('end-hits'),
    endMisses: $('end-misses'),
    endAccuracy: $('end-accuracy'),
    endBlack: $('end-black'),
    btnSound: $('btn-sound'),
    btnReplay: $('btn-replay'),
    btnHome: $('btn-home'),
    // v1.1: đăng ký người chơi
    screenRegister: $('screen-register'),
    startGreeting: $('start-greeting'),
    startPlayerName: $('start-player-name'),
    btnNotMe: $('btn-not-me'),
    startServerAlert: $('start-server-alert'),
    startServerMsg: $('start-server-msg'),
    btnRetryServer: $('btn-retry-server'),
    regForm: $('reg-form'),
    regAlert: $('reg-alert'),
    regName: $('reg-name'),
    regEmail: $('reg-email'),
    regPhone: $('reg-phone'),
    regConsent: $('reg-consent'),
    btnRegister: $('btn-register'),
    btnRegisterBack: $('btn-register-back'),
    saveText: $('save-text'),
    saveStatus: $('save-status'),
    btnSaveRetry: $('btn-save-retry')
  };

  var holes = [];

  function buildBoard() {
    for (var i = 0; i < HOLES; i++) {
      var hole = document.createElement('div');
      hole.className = 'hole';
      hole.dataset.index = String(i);
      hole.setAttribute('aria-label', 'Ô ' + (i + 1));
      hole.innerHTML =
        '<div class="pit"></div>' +
        '<div class="mole-clip"><div class="mole">' +
        '<svg class="mole-normal kind-pink" viewBox="0 0 64 56" aria-hidden="true"><use href="#cat"/></svg>' +
        '<svg class="mole-hit kind-pink" viewBox="0 0 64 56" aria-hidden="true"><use href="#cat-hit"/></svg>' +
        '<svg class="mole-normal kind-black" viewBox="0 0 64 56" aria-hidden="true"><use href="#bcat"/></svg>' +
        '<svg class="mole-hit kind-black" viewBox="0 0 64 56" aria-hidden="true"><use href="#bcat-hit"/></svg>' +
        '</div></div>' +
        '<div class="lip"></div>';
      el.board.appendChild(hole);
      holes.push(hole);
    }
  }

  // ---------- Lưu trữ (R-16 → R-18, F-10) ----------
  function readBest() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      if (v !== null && /^\d+$/.test(v)) return parseInt(v, 10);
    } catch (e) { /* bị chặn: coi như chưa có kỷ lục */ }
    return 0;
  }

  function writeBest(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (e) { /* ẩn danh / hết dung lượng: chỉ giữ trong bộ nhớ */ }
  }

  // ---------- Hẹn giờ ----------
  function schedule(fn, ms) {
    var id = setTimeout(function () {
      var idx = timers.indexOf(id);
      if (idx !== -1) timers.splice(idx, 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  }

  function clearTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
    if (moleTimer !== null) { clearTimeout(moleTimer); moleTimer = null; }
    if (tickTimer !== null) { clearInterval(tickTimer); tickTimer = null; }
  }

  // ---------- Thời gian (R-01 → R-04) ----------
  function getRemaining() {
    if (state.phase !== 'PLAYING') return state.remainingMs;
    return Math.max(0, state.remainingMs - (performance.now() - state.startedAt));
  }

  function renderTime(ms) {
    var seconds = Math.max(0, Math.ceil(ms / 1000));
    el.hudTime.textContent = String(seconds);
    el.hudTimeWrap.classList.toggle('is-warning', seconds <= WARN_SECONDS);
  }

  function renderScore() {
    el.hudScore.textContent = String(state.score);
  }

  function tick() {
    if (state.phase !== 'PLAYING') return;
    var remaining = getRemaining();
    renderTime(remaining);
    if (remaining <= 0) endRound();
  }

  // ---------- Màn hình ----------
  function showScreen(name) {
    el.screenStart.hidden = name !== 'start';
    el.screenRegister.hidden = name !== 'register';
    el.screenPlay.hidden = name !== 'play';
    el.screenEnd.hidden = name !== 'end';
  }

  function renderStart() {
    el.startBest.hidden = !(state.best > 0);
    el.startBestValue.textContent = String(state.best);
    // v1.1: lời chào / báo lỗi máy chủ / trạng thái nút Bắt đầu (F-15, F-16)
    var up = net.server === 'ok';
    el.startGreeting.hidden = !(up && net.player);
    if (net.player) el.startPlayerName.textContent = net.player.displayName;
    el.startServerAlert.hidden = net.server !== 'down';
    el.btnStart.disabled = !up;
    el.btnStart.textContent = net.server === 'checking' ? 'Đang kết nối…' : 'Bắt đầu';
  }

  // ---------- Chuột (R-05 → R-09) ----------
  function pickHole() {
    var choices = [];
    for (var i = 0; i < HOLES; i++) if (i !== state.lastHole) choices.push(i);
    return choices[Math.floor(Math.random() * choices.length)];
  }

  function spawnMole() {
    moleTimer = null;
    if (state.phase !== 'PLAYING' || getRemaining() <= 0) return;
    var i = pickHole();
    state.activeHole = i;
    state.lastHole = i;
    state.moleState = 'up';
    state.moleKind = Math.random() < BLACK_CHANCE ? 'black' : 'pink';
    holes[i].classList.toggle('is-black', state.moleKind === 'black');
    holes[i].classList.add('is-up');
    var upMs = UP_MIN_MS + Math.random() * (UP_MAX_MS - UP_MIN_MS);
    moleTimer = setTimeout(retreatMole, upMs);
  }

  function retreatMole() {
    moleTimer = null;
    if (state.phase !== 'PLAYING' || state.moleState !== 'up') return;
    var i = state.activeHole;
    state.moleState = 'down';
    holes[i].classList.remove('is-up'); // trượt xuống ~150 ms
    // Con tiếp theo sau GAP_MS (lớn hơn thời gian lặn nên vẫn chỉ 1 chuột/lúc)
    moleTimer = setTimeout(function () {
      state.activeHole = null;
      state.moleState = 'none';
      spawnMole();
    }, GAP_MS);
  }

  function hideMoleInstantly(i) {
    var hole = holes[i];
    hole.classList.add('is-instant');
    hole.classList.remove('is-up', 'is-hit');
    void hole.offsetWidth; // áp dụng ngay, không chạy hiệu ứng lặn
    hole.classList.remove('is-instant');
  }

  function clearBoard() {
    for (var i = 0; i < HOLES; i++) {
      hideMoleInstantly(i);
      holes[i].classList.remove('is-miss');
      var plus = holes[i].querySelectorAll('.plus');
      for (var p = 0; p < plus.length; p++) plus[p].remove();
    }
    state.activeHole = null;
    state.moleState = 'none';
  }

  // ---------- Đập (R-10 → R-14) ----------
  function onBoardPointerDown(event) {
    var hole = event.target.closest('.hole');
    if (!hole) return;                         // ngoài ô: bỏ qua
    if (event.cancelable) event.preventDefault();
    if (state.phase !== 'PLAYING') return;     // R-10
    if (getRemaining() <= 0) { endRound(); return; }

    var i = Number(hole.dataset.index);
    if (i === state.activeHole) {
      if (state.moleState === 'up') whack(i);  // R-11
      return;                                   // R-13: đã bị đập / đang lặn
    }
    // R-12: ô trống
    state.misses += 1;
    hole.classList.remove('is-miss');
    void hole.offsetWidth;
    hole.classList.add('is-miss');
  }

  function whack(i) {
    if (moleTimer !== null) { clearTimeout(moleTimer); moleTimer = null; }
    var isBlack = state.moleKind === 'black';
    if (isBlack) {
      state.score -= 1;          // mèo đen: −1, cho phép điểm âm
      state.blackHits += 1;
    } else {
      state.score += 1;
      state.hits += 1;
    }
    state.moleState = 'hit';
    renderScore();

    var hole = holes[i];
    hole.classList.add('is-hit');
    var plus = document.createElement('span');
    plus.className = 'plus' + (isBlack ? ' is-minus' : '');
    plus.innerHTML = (isBlack ? '−1' : '+1') + '<small>' + (isBlack ? 'Nà ní!' : 'Úi da!') + '</small>';
    hole.appendChild(plus);
    schedule(function () { plus.remove(); }, FLOAT_MS + 50);
    say(isBlack ? 'Nà ní' : 'Úi da');

    schedule(function () {
      if (state.activeHole !== i || state.moleState !== 'hit') return;
      hideMoleInstantly(i);
      state.activeHole = null;
      state.moleState = 'none';
    }, HIT_EFFECT_MS);

    moleTimer = setTimeout(spawnMole, GAP_MS);  // R-08
  }

  // ---------- Giọng đọc "Úi da" / "Nà ní" ----------
  // Dùng giọng đọc tiếng Việt có sẵn trên máy (ưu tiên giọng nữ).
  // Máy không có giọng Việt thì im lặng (tránh giọng tiếng Anh đọc sai), chữ "+1 Úi da!" vẫn hiện.
  var hasSpeech = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  var soundOn = readSound();
  var viVoice = null;

  function readSound() {
    try { return window.localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; }
  }

  function pickVoice() {
    if (!hasSpeech) return;
    var voices = window.speechSynthesis.getVoices();
    var vi = voices.filter(function (v) { return /^vi(-|_|$)/i.test(v.lang); });
    // Ưu tiên giọng nữ nếu có (HoaiMy, Linh, …)
    var female = vi.filter(function (v) { return /hoaimy|hoài my|linh|female|nữ/i.test(v.name); });
    viVoice = female[0] || vi[0] || null;
  }

  function say(text) {
    if (!soundOn || !hasSpeech || !viVoice) return;
    try {
      window.speechSynthesis.cancel(); // đập liên tục thì câu mới thay câu cũ
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'vi-VN';
      if (viVoice) u.voice = viVoice;
      u.rate = 1.15;
      u.pitch = 1.3;
      window.speechSynthesis.speak(u);
    } catch (e) { /* trình duyệt không hỗ trợ: chỉ hiện chữ */ }
  }

  function renderSound() {
    el.btnSound.textContent = soundOn ? '🔊' : '🔇';
    el.btnSound.setAttribute('aria-pressed', String(soundOn));
    el.btnSound.setAttribute('aria-label', soundOn ? 'Tắt tiếng' : 'Bật tiếng');
  }

  function toggleSound() {
    soundOn = !soundOn;
    try { window.localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) { /* bỏ qua */ }
    if (!soundOn) stopSpeech();
    renderSound();
  }

  function stopSpeech() {
    if (!hasSpeech) return;
    try { window.speechSynthesis.cancel(); } catch (e) { /* bỏ qua */ }
  }

  // ---------- v1.1: máy chủ, người chơi, đăng ký, lưu điểm (F-14 → F-17) ----------
  var PLAYER_KEY = 'dap-chuot.player';
  var V = window.DapChuotValidate;
  var net = {
    server: 'checking',   // checking | ok | down
    player: null,         // { token, displayName }
    pendingResult: null   // kết quả lượt chưa lưu được
  };

  function readPlayer() {
    try {
      var p = JSON.parse(window.localStorage.getItem(PLAYER_KEY) || 'null');
      if (p && typeof p.token === 'string' && /^[0-9a-f]{64}$/.test(p.token)) {
        return { token: p.token, displayName: String(p.displayName || '').slice(0, 20) };
      }
    } catch (e) { /* bị chặn hoặc dữ liệu hỏng */ }
    return null;
  }

  function savePlayer(p) {
    net.player = p;
    try { window.localStorage.setItem(PLAYER_KEY, JSON.stringify(p)); } catch (e) { /* ẩn danh: chỉ giữ trong phiên */ }
  }

  function clearPlayer() {
    net.player = null;
    try { window.localStorage.removeItem(PLAYER_KEY); } catch (e) { /* bỏ qua */ }
  }

  /** Gọi API, trả về { status, data }. Lỗi mạng → status 0. */
  function api(method, path, body, withToken) {
    // ngrok bản miễn phí chặn bằng trang cảnh báo HTML nếu thiếu header này
    var headers = { 'Accept': 'application/json', 'ngrok-skip-browser-warning': '1' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (withToken && net.player) headers['Authorization'] = 'Bearer ' + net.player.token;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    return fetch(path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    }).catch(function () {
      return { status: 0, data: {} };
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  function checkServer() {
    net.server = 'checking';
    renderStart();
    return api('GET', '/api/health').then(function (r) {
      if (r.status !== 200 || !r.data || r.data.ok !== true) {
        net.server = 'down';
        return;
      }
      net.server = 'ok';
      net.player = readPlayer() || net.player;
      if (!net.player) return;
      // Xác nhận mã thiết bị còn hợp lệ (R-26)
      return api('GET', '/api/players/me', undefined, true).then(function (me) {
        if (me.status === 200) {
          net.player.displayName = me.data.displayName || net.player.displayName;
          savePlayer(net.player);
        } else if (me.status === 401) {
          clearPlayer();
        }
      });
    }).then(function () {
      if (state.phase === 'START') renderStart();
    });
  }

  function onStartClick() {
    if (state.phase !== 'START' || net.server !== 'ok') return;
    if (net.player) startRound();
    else showRegister();
  }

  function onNotMe() {
    if (state.phase !== 'START') return;
    clearPlayer();
    showRegister();
  }

  // ----- Form đăng ký -----
  var FIELDS = ['fullName', 'email', 'phone', 'consent'];
  var INPUTS = { fullName: 'regName', email: 'regEmail', phone: 'regPhone', consent: 'regConsent' };

  function formValue() {
    return {
      fullName: el.regName.value,
      email: el.regEmail.value,
      phone: el.regPhone.value,
      consent: el.regConsent.checked
    };
  }

  function setFieldError(name, msg) {
    var input = el[INPUTS[name]];
    var box = $('err-' + name);
    box.textContent = msg || '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.closest('.field').classList.toggle('has-error', !!msg);
  }

  function showErrors(errors) {
    FIELDS.forEach(function (f) { setFieldError(f, errors[f]); });
    for (var i = 0; i < FIELDS.length; i++) {
      if (errors[FIELDS[i]]) { el[INPUTS[FIELDS[i]]].focus(); break; }
    }
  }

  function showRegister() {
    state.phase = 'REGISTER';
    el.regForm.reset();
    FIELDS.forEach(function (f) { setFieldError(f, ''); });
    el.regAlert.hidden = true;
    el.btnRegister.disabled = false;
    el.btnRegister.textContent = 'Đăng ký & chơi';
    showScreen('register');
    el.regName.focus();
  }

  function onFieldBlur(name) {
    // Chỉ báo lỗi khi đã nhập gì đó, tránh báo đỏ ngay lúc vừa chạm vào ô
    var input = el[INPUTS[name]];
    if (name !== 'consent' && !input.value.trim()) { setFieldError(name, ''); return; }
    var check = V.validateRegistration(formValue());
    setFieldError(name, check.errors[name]);
  }

  function onRegisterSubmit(e) {
    e.preventDefault();
    if (state.phase !== 'REGISTER' || el.btnRegister.disabled) return;
    el.regAlert.hidden = true;
    var check = V.validateRegistration(formValue());
    if (!check.ok) { showErrors(check.errors); return; }
    FIELDS.forEach(function (f) { setFieldError(f, ''); });

    el.btnRegister.disabled = true;
    el.btnRegister.textContent = 'Đang gửi…';
    var body = {
      fullName: check.value.fullName,
      email: check.value.email,
      phone: check.value.phone,
      consent: true
    };
    api('POST', '/api/players', body).then(function (r) {
      if (state.phase !== 'REGISTER') return;
      if ((r.status === 200 || r.status === 201) && r.data.token) {
        savePlayer({ token: r.data.token, displayName: r.data.displayName });
        startRound();
        return;
      }
      el.btnRegister.disabled = false;
      el.btnRegister.textContent = 'Đăng ký & chơi';
      if (r.status === 400 && r.data.fields) { showErrors(r.data.fields); return; }
      el.regAlert.textContent = r.status === 0
        ? 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
        : (r.data.error || 'Đăng ký chưa thành công, thử lại sau.');
      el.regAlert.hidden = false;
    });
  }

  function onRegisterBack() {
    if (state.phase !== 'REGISTER') return;
    state.phase = 'START';
    renderStart();
    showScreen('start');
  }

  // ----- Lưu kết quả lượt (F-17) -----
  function setSaveStatus(kind, text) {
    el.saveStatus.className = 'save-status' + (kind ? ' is-' + kind : '');
    el.saveText.textContent = text || '';
    el.btnSaveRetry.hidden = kind !== 'error';
  }

  function submitResult() {
    var result = net.pendingResult;
    if (!result) return;
    if (!net.player) { setSaveStatus('error-final', 'Chưa lưu được kết quả: bạn cần đăng ký lại.'); return; }
    setSaveStatus('saving', 'Đang lưu…');
    api('POST', '/api/rounds', result, true).then(function (r) {
      if (net.pendingResult !== result) return; // đã sang lượt khác
      if (r.status === 201) {
        net.pendingResult = null;
        setSaveStatus('ok', '✓ Đã lưu kết quả');
      } else if (r.status === 401) {
        clearPlayer();
        net.pendingResult = null;
        setSaveStatus('error-final', 'Chưa lưu được kết quả: bạn cần đăng ký lại.');
      } else if (r.status === 400 || r.status === 429) {
        net.pendingResult = null;
        setSaveStatus('error-final', 'Chưa lưu được kết quả' + (r.data.error ? ': ' + r.data.error.toLowerCase() : '') + '.');
      } else {
        setSaveStatus('error', 'Chưa lưu được kết quả.');
      }
    });
  }

  // ---------- Vòng đời lượt ----------
  function startRound() {
    if (state.phase !== 'START' && state.phase !== 'ENDED' && state.phase !== 'REGISTER') return; // chống bấm 2 lần
    if (!net.player) { showRegister(); return; }   // bị xoá / chưa đăng ký → đăng ký trước
    net.pendingResult = null;
    setSaveStatus('', '');
    clearTimers();
    clearBoard();
    state.score = 0;
    state.hits = 0;
    state.misses = 0;
    state.blackHits = 0;
    state.remainingMs = ROUND_MS;
    state.lastHole = null;
    state.isNewBest = false;
    renderScore();
    renderTime(ROUND_MS);
    showScreen('play');
    startCountdown();
  }

  function startCountdown() {
    state.phase = 'COUNTDOWN';
    el.overlayPaused.hidden = true;
    el.overlayCountdown.hidden = false;
    el.playHint.textContent = 'Chuẩn bị…';
    renderTime(state.remainingMs);

    var step = COUNTDOWN_STEPS;
    function show() {
      el.countdownNum.textContent = String(step);
      el.countdownNum.classList.remove('is-pop');
      void el.countdownNum.offsetWidth;
      el.countdownNum.classList.add('is-pop');
    }
    show();
    for (var k = 1; k <= COUNTDOWN_STEPS; k++) {
      (function (k) {
        schedule(function () {
          if (state.phase !== 'COUNTDOWN') return;
          if (k < COUNTDOWN_STEPS) { step = COUNTDOWN_STEPS - k; show(); }
          else beginPlaying();
        }, k * COUNTDOWN_STEP_MS);
      })(k);
    }
  }

  function beginPlaying() {
    el.overlayCountdown.hidden = true;
    el.playHint.textContent = '';
    state.phase = 'PLAYING';
    state.startedAt = performance.now();
    renderTime(state.remainingMs);
    spawnMole();
    // Cập nhật hiển thị mỗi 100 ms; thời gian thật vẫn tính theo performance.now() (R-01)
    tickTimer = setInterval(tick, 100);
    // Kết thúc đúng lúc, không phụ thuộc nhịp cập nhật hiển thị
    schedule(function () { if (state.phase === 'PLAYING' && getRemaining() <= 0) endRound(); }, state.remainingMs + 5);
  }

  function pauseGame() {
    if (state.phase !== 'PLAYING' && state.phase !== 'COUNTDOWN') return;
    if (state.phase === 'PLAYING') state.remainingMs = getRemaining(); // R-03
    state.phase = 'PAUSED';
    clearTimers();
    stopSpeech();
    clearBoard(); // chuột đang hiện bị rút, không tính điểm/trượt
    renderTime(state.remainingMs);
    el.overlayCountdown.hidden = true;
    el.pausedTime.textContent = String(Math.max(0, Math.ceil(state.remainingMs / 1000)));
    el.pausedScore.textContent = String(state.score);
    el.playHint.textContent = '';
    el.overlayPaused.hidden = false;
  }

  function resumeGame() {
    if (state.phase !== 'PAUSED') return;
    startCountdown();
  }

  function endRound() {
    if (state.phase !== 'PLAYING') return;
    state.phase = 'ENDED';
    state.remainingMs = 0;
    clearTimers();
    stopSpeech();
    clearBoard();
    renderTime(0);

    // R-16, R-17
    if (state.score > state.best) {
      state.best = state.score;
      state.isNewBest = true;
      writeBest(state.best);
    } else {
      state.isNewBest = false;
    }

    renderEnd();
    showScreen('end');

    // v1.1: gửi kết quả lên server (R-27)
    net.pendingResult = { score: state.score, hits: state.hits, misses: state.misses, blackHits: state.blackHits };
    submitResult();

    el.btnReplay.disabled = true;
    el.btnHome.disabled = true;
    schedule(function () {
      el.btnReplay.disabled = false;
      el.btnHome.disabled = false;
    }, END_BUTTON_LOCK_MS);
  }

  function renderEnd() {
    el.endScore.textContent = String(state.score);
    el.endNewBest.hidden = !state.isNewBest;
    el.endBest.textContent = String(state.best);
    el.endHits.textContent = String(state.hits);
    el.endMisses.textContent = String(state.misses);
    el.endBlack.textContent = String(state.blackHits);
    // Chính xác = mèo hồng trúng ÷ mọi cú bấm được tính (hồng + trượt + mèo đen)
    var total = state.hits + state.misses + state.blackHits;
    el.endAccuracy.textContent = total === 0 ? '—' : Math.round(state.hits / total * 100) + '%'; // R-15
  }

  function goHome() {
    if (state.phase !== 'ENDED') return;
    clearTimers();
    state.phase = 'START';
    renderStart();
    showScreen('start');
    el.btnStart.focus();
  }

  // ---------- Khởi động ----------
  function init() {
    buildBoard();
    state.best = readBest();
    renderStart();
    showScreen('start');

    el.btnStart.addEventListener('click', onStartClick);
    el.btnReplay.addEventListener('click', startRound);
    // v1.1
    el.btnNotMe.addEventListener('click', onNotMe);
    el.btnRetryServer.addEventListener('click', checkServer);
    el.regForm.addEventListener('submit', onRegisterSubmit);
    el.btnRegisterBack.addEventListener('click', onRegisterBack);
    el.btnSaveRetry.addEventListener('click', submitResult);
    ['fullName', 'email', 'phone'].forEach(function (f) {
      el[INPUTS[f]].addEventListener('blur', function () { onFieldBlur(f); });
    });
    el.regConsent.addEventListener('change', function () { if (el.regConsent.checked) setFieldError('consent', ''); });
    checkServer();
    el.btnHome.addEventListener('click', goHome);
    el.btnResume.addEventListener('click', resumeGame);

    renderSound();
    el.btnSound.addEventListener('click', toggleSound);
    if (hasSpeech) {
      pickVoice();
      window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    }

    el.board.addEventListener('pointerdown', onBoardPointerDown);
    el.board.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') pauseGame();
    });
  }

  init();
})();
