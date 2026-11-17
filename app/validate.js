/* Kiểm tra dữ liệu đăng ký — dùng chung cho trình duyệt (game) và server (Node.js).
   Quy tắc theo docs/04-quy-tac-du-lieu.html: R-19 (họ tên), R-20 (email), R-21 (SĐT), R-22 (đồng ý). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DapChuotValidate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NAME_RE = /^[\p{L}\p{M}' .-]+$/u;
  var EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  var PHONE_RE = /^0(3|5|7|8|9)\d{8}$/;

  function normalizeName(v) {
    return String(v == null ? '' : v).normalize('NFC').trim().replace(/\s+/g, ' ');
  }

  function normalizeEmail(v) {
    return String(v == null ? '' : v).trim().toLowerCase();
  }

  function normalizePhone(v) {
    var s = String(v == null ? '' : v).replace(/[\s.\-()]/g, '');
    if (s.indexOf('+84') === 0) s = '0' + s.slice(3);
    else if (s.indexOf('84') === 0 && s.length === 11) s = '0' + s.slice(2);
    return s;
  }

  /** Bỏ dấu tiếng Việt, chữ thường — dùng cho tìm kiếm (R-30). */
  function foldText(v) {
    return String(v == null ? '' : v)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase();
  }

  /** Tên gọi trên lời chào: từ cuối của họ tên, tối đa 20 ký tự. */
  function displayName(fullName) {
    var parts = normalizeName(fullName).split(' ');
    return parts[parts.length - 1].slice(0, 20);
  }

  /**
   * Kiểm tra form đăng ký.
   * @returns {{ ok: boolean, value: object, errors: object }}
   */
  function validateRegistration(input) {
    input = input || {};
    var errors = {};
    var fullName = normalizeName(input.fullName);
    var email = normalizeEmail(input.email);
    var phone = normalizePhone(input.phone);

    if (!fullName) errors.fullName = 'Vui lòng nhập họ tên';
    else if (fullName.length < 2 || fullName.length > 60) errors.fullName = 'Họ tên dài từ 2 đến 60 ký tự';
    else if (!NAME_RE.test(fullName)) errors.fullName = 'Họ tên chỉ gồm chữ cái, khoảng trắng và dấu \' - .';

    if (!email) errors.email = 'Vui lòng nhập email';
    else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'Email chưa đúng định dạng';

    if (!phone) errors.phone = 'Vui lòng nhập số điện thoại';
    else if (!PHONE_RE.test(phone)) errors.phone = 'Số điện thoại gồm 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09';

    if (input.consent !== true) errors.consent = 'Bạn cần đồng ý để đăng ký';

    return {
      ok: Object.keys(errors).length === 0,
      value: { fullName: fullName, email: email, phone: phone },
      errors: errors
    };
  }

  return {
    validateRegistration: validateRegistration,
    normalizeName: normalizeName,
    normalizeEmail: normalizeEmail,
    normalizePhone: normalizePhone,
    foldText: foldText,
    displayName: displayName
  };
});
