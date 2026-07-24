(() => {
  'use strict';

  const form = document.getElementById('booking-form');
  const bookingPanel = document.getElementById('booking-panel');
  const successPanel = document.getElementById('success-panel');
  const submitButton = document.getElementById('submit-booking');
  const formError = document.getElementById('form-error');
  const newBookingButton = document.getElementById('new-booking');

  function normalizePhone(value) {
    return String(value || '')
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/\D/g, '');
  }

  function cleanName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function setFieldError(field, message) {
    const wrapper = document.querySelector(`[data-field="${field}"]`);
    const error = document.querySelector(`[data-error="${field}"]`);
    wrapper?.classList.toggle('has-error', Boolean(message));
    if (error) error.textContent = message;
  }

  function clearErrors() {
    setFieldError('name', '');
    setFieldError('phone', '');
    formError?.classList.add('hidden');
    if (formError) formError.textContent = '';
  }

  function validate() {
    clearErrors();

    const name = cleanName(document.getElementById('customer-name')?.value);
    const phone = normalizePhone(document.getElementById('customer-phone')?.value);
    let valid = true;

    if (name.length < 2 || name.length > 80) {
      setFieldError('name', 'اكتب الاسم بصورة صحيحة.');
      valid = false;
    }

    if (phone.length < 8 || phone.length > 15) {
      setFieldError('phone', 'اكتب رقم الهاتف بصورة صحيحة.');
      valid = false;
    }

    return { valid, name, phone };
  }

  function setBusy(busy) {
    submitButton.disabled = busy;
    const label = submitButton.querySelector('span');
    if (label) label.textContent = busy ? 'جارٍ إرسال الطلب' : 'إرسال طلب الحجز';
  }

  function showFormError(message) {
    if (!formError) return;
    formError.textContent = message;
    formError.classList.remove('hidden');
  }

  async function submitBooking(event) {
    event.preventDefault();

    const validation = validate();
    if (!validation.valid) return;

    const endpoint = window.GREENTOP_CONFIG?.BOOKING_FUNCTION_URL;
    if (!endpoint) {
      showFormError('تعذّر تجهيز نموذج الحجز الآن. حاول مرة أخرى بعد قليل.');
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setBusy(true);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: validation.name,
          phone: validation.phone,
          website: document.getElementById('website')?.value || '',
        }),
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error || `request_failed_${response.status}`);
      }

      form.reset();
      bookingPanel.classList.add('hidden');
      successPanel.classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Booking submission failed:', error);
      showFormError(
        error?.name === 'AbortError'
          ? 'استغرق الإرسال وقتًا طويلًا. تأكد من الاتصال وحاول مرة أخرى.'
          : 'تعذّر إرسال الطلب الآن. تأكد من الاتصال وحاول مرة أخرى.'
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  form?.addEventListener('submit', submitBooking);
  document.getElementById('customer-name')?.addEventListener('input', () => setFieldError('name', ''));
  document.getElementById('customer-phone')?.addEventListener('input', () => setFieldError('phone', ''));

  newBookingButton?.addEventListener('click', () => {
    clearErrors();
    successPanel.classList.add('hidden');
    bookingPanel.classList.remove('hidden');
    document.getElementById('customer-name')?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
