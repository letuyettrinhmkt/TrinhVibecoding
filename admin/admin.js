/* Trang quản trị: F-18 → F-22 trong docs/02-chuc-nang.html */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  var views = ['view-loading', 'view-unconfigured', 'view-login', 'view-list'];
  var state = { q: '', page: 1, total: 0, pageSize: 20, pendingDelete: null };
  var searchTimer = null;
  var listSeq = 0;

  function show(view) {
    views.forEach(function (v) { $(v).hidden = v !== view; });
  }

  function api(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: { 'Accept': 'application/json' } };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    }).catch(function () { return { status: 0, data: {} }; });
  }

  function errorText(r, fallback) {
    if (r.status === 0) return 'Không kết nối được máy chủ.';
    return (r.data && r.data.error) || fallback;
  }

  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2500);
  }

  // ---------- Phiên đăng nhập ----------
  function boot() {
    show('view-loading');
    api('GET', '/api/admin/status').then(function (r) {
      if (r.status !== 200) { showLogin('Không kết nối được máy chủ.'); return; }
      if (!r.data.configured) { show('view-unconfigured'); return; }
      if (r.data.loggedIn) openList(); else showLogin();
    });
  }

  function showLogin(message) {
    show('view-login');
    var a = $('login-alert');
    a.textContent = message || '';
    a.hidden = !message;
    $('login-password').value = '';
    $('btn-login').disabled = false;
    $('login-username').focus();
  }

  function onLogin(e) {
    e.preventDefault();
    var btn = $('btn-login');
    if (btn.disabled) return;
    var username = $('login-username').value;
    var password = $('login-password').value;
    if (!username || !password) { showLogin('Nhập tên đăng nhập và mật khẩu.'); $('login-username').value = username; return; }
    btn.disabled = true;
    api('POST', '/api/admin/login', { username: username, password: password }).then(function (r) {
      btn.disabled = false;
      if (r.status === 204) { $('login-password').value = ''; openList(); return; }
      if (r.status === 503) { show('view-unconfigured'); return; }
      showLogin(errorText(r, 'Đăng nhập không thành công.'));
      $('login-username').value = username;
    });
  }

  function onLogout() {
    api('POST', '/api/admin/logout').then(function () { showLogin(); });
  }

  /** Mọi API trả 401 → về form đăng nhập (F-18). */
  function handleAuth(r) {
    if (r.status === 401) { showLogin('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'); return true; }
    if (r.status === 503) { show('view-unconfigured'); return true; }
    return false;
  }

  // ---------- Danh sách (F-19, F-20) ----------
  function openList() {
    show('view-list');
    state.page = 1;
    loadList();
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var parts = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
    var get = function (t) { var p = parts.find(function (x) { return x.type === t; }); return p ? p.value : ''; };
    return get('day') + '/' + get('month') + '/' + get('year') + ' ' + get('hour') + ':' + get('minute');
  }

  function cell(text, cls) {
    var td = document.createElement('td');
    td.textContent = text; // luôn hiển thị dạng chữ, không chèn HTML
    if (cls) td.className = cls;
    return td;
  }

  function renderRows(items) {
    var tbody = $('rows');
    tbody.textContent = '';
    items.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.appendChild(cell(p.fullName));
      tr.appendChild(cell(p.email));
      tr.appendChild(cell(p.phone));
      tr.appendChild(cell(fmtTime(p.createdAt), 'time'));
      tr.appendChild(cell(String(p.rounds), 'num'));
      tr.appendChild(cell(p.bestScore == null ? '—' : String(p.bestScore), 'num'));
      tr.appendChild(cell(fmtTime(p.lastPlayedAt), 'time'));
      var td = document.createElement('td');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'del';
      b.textContent = 'Xoá';
      b.setAttribute('aria-label', 'Xoá ' + p.fullName);
      b.addEventListener('click', function () { askDelete(p); });
      td.appendChild(b);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  }

  function loadList() {
    var seq = ++listSeq;
    var qs = '?page=' + state.page + (state.q ? '&q=' + encodeURIComponent(state.q) : '');
    $('btn-export').href = '/api/admin/players.csv' + (state.q ? '?q=' + encodeURIComponent(state.q) : '');
    api('GET', '/api/admin/players' + qs).then(function (r) {
      if (seq !== listSeq) return; // có yêu cầu mới hơn
      if (handleAuth(r)) return;
      var alert = $('list-alert');
      if (r.status !== 200) { alert.textContent = errorText(r, 'Không tải được danh sách.'); alert.hidden = false; return; }
      alert.hidden = true;
      var d = r.data;
      state.total = d.total;
      state.pageSize = d.pageSize;
      var pages = Math.max(1, Math.ceil(d.total / d.pageSize));
      if (state.page > pages && d.total > 0) { state.page = pages; loadList(); return; }

      $('total').textContent = '(' + d.total + ')';
      renderRows(d.items);
      var empty = $('empty');
      empty.hidden = d.items.length > 0;
      empty.textContent = state.q ? 'Không tìm thấy người chơi phù hợp' : 'Chưa có người chơi nào';
      var from = d.total ? (state.page - 1) * d.pageSize + 1 : 0;
      var to = Math.min(d.total, state.page * d.pageSize);
      $('range').textContent = 'Hiển thị ' + from + '–' + to + ' / ' + d.total;
      $('page-info').textContent = 'Trang ' + state.page + '/' + pages;
      $('btn-prev').disabled = state.page <= 1;
      $('btn-next').disabled = state.page >= pages;
      var exp = $('btn-export');
      exp.setAttribute('aria-disabled', d.total === 0 ? 'true' : 'false');
    });
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = $('search').value.trim();
      state.page = 1;
      loadList();
    }, 300);
  }

  // ---------- Xoá (F-21) ----------
  function askDelete(p) {
    state.pendingDelete = p;
    $('confirm-who').textContent = p.fullName + ' · ' + p.email;
    var dlg = $('confirm-dialog');
    dlg.returnValue = '';
    dlg.showModal();
    $('btn-cancel-delete').focus();
  }

  function onDialogClose() {
    var dlg = $('confirm-dialog');
    var p = state.pendingDelete;
    state.pendingDelete = null;
    if (dlg.returnValue !== 'confirm' || !p) return;
    api('DELETE', '/api/admin/players/' + encodeURIComponent(p.id)).then(function (r) {
      if (handleAuth(r)) return;
      if (r.status === 204 || r.status === 404) {
        toast(r.status === 204 ? 'Đã xoá' : 'Người chơi này đã bị xoá trước đó');
        loadList();
        return;
      }
      var alert = $('list-alert');
      alert.textContent = errorText(r, 'Xoá không thành công.');
      alert.hidden = false;
    });
  }

  // ---------- Xuất CSV (F-22): kiểm tra phiên trước khi tải ----------
  function onExport(e) {
    if ($('btn-export').getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    // Liên kết tải trực tiếp (cookie đi kèm); nếu phiên đã hết hạn thì báo đăng nhập lại
    e.preventDefault();
    var href = $('btn-export').href;
    api('GET', '/api/admin/status').then(function (r) {
      if (r.status === 200 && r.data.loggedIn) { window.location.href = href; }
      else showLogin('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    });
  }

  $('login-form').addEventListener('submit', onLogin);
  $('btn-logout').addEventListener('click', onLogout);
  $('search').addEventListener('input', onSearchInput);
  $('btn-prev').addEventListener('click', function () { if (state.page > 1) { state.page--; loadList(); } });
  $('btn-next').addEventListener('click', function () { state.page++; loadList(); });
  $('confirm-dialog').addEventListener('close', onDialogClose);
  $('btn-export').addEventListener('click', onExport);

  boot();
})();
