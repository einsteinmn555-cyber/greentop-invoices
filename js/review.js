(() => {
  'use strict';

  const RATING_LABELS = Object.freeze(['ضعيف', 'مقبول', 'جيد', 'جيد جدًا', 'ممتاز']);
  const RATING_FIELDS = Object.freeze([
    'overall_rating',
    'punctuality_rating',
    'captain_rating',
    'car_rating',
    'booking_rating',
  ]);

  class CustomerReviewForm {
    constructor() {
      this.form = document.getElementById('review-form');
      this.panel = document.getElementById('review-panel');
      this.successPanel = document.getElementById('success-panel');
      this.submitButton = document.getElementById('submit-review');
      this.formError = document.getElementById('form-error');
      this.ratings = Object.fromEntries(RATING_FIELDS.map((field) => [field, 0]));
      this.supabase = null;
      this.readyAt = Date.now();
      this.init();
    }

    init() {
      this.buildStars();
      this.bindEvents();

      try {
        const config = window.GREENTOP_CONFIG;
        if (!config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY || !window.supabase?.createClient) {
          throw new Error('missing_configuration');
        }
        this.supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
      } catch (error) {
        console.error('Review form initialization failed:', error);
        this.showFormError('تعذّر تجهيز نموذج التقييم الآن. حاول مرة أخرى بعد قليل.');
        this.submitButton.disabled = true;
      } finally {
        this.hideSplash();
      }
    }

    hideSplash() {
      const splash = document.getElementById('review-splash');
      const elapsed = Date.now() - this.readyAt;
      const delay = Math.max(0, 1050 - elapsed);
      window.setTimeout(() => {
        splash?.classList.add('is-hidden');
        document.body.classList.remove('splash-visible');
      }, delay);
    }

    buildStars() {
      document.querySelectorAll('[data-rating]').forEach((card) => {
        const field = card.dataset.rating;
        const group = card.querySelector('.stars');
        if (!field || !group) return;

        for (let value = 1; value <= 5; value += 1) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'star-button';
          button.dataset.value = String(value);
          button.setAttribute('role', 'radio');
          button.setAttribute('aria-checked', 'false');
          button.setAttribute('aria-label', `${value} من 5 - ${RATING_LABELS[value - 1]}`);
          button.textContent = '★';
          button.addEventListener('click', () => this.setRating(field, value, card));
          group.appendChild(button);
        }
      });
    }

    setRating(field, value, card) {
      this.ratings[field] = value;
      card.querySelectorAll('.star-button').forEach((button) => {
        const active = Number(button.dataset.value) <= value;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-checked', String(Number(button.dataset.value) === value));
      });

      const caption = card.querySelector('.rating-caption');
      if (caption) {
        caption.textContent = `${value} من 5 — ${RATING_LABELS[value - 1]}`;
        caption.classList.add('is-selected');
      }
      this.clearFieldError(field);
    }

    bindEvents() {
      this.form?.addEventListener('submit', (event) => this.handleSubmit(event));
      document.getElementById('phone')?.addEventListener('input', () => this.clearFieldError('phone'));

      document.querySelectorAll('input[type="radio"]').forEach((input) => {
        input.addEventListener('change', () => {
          this.clearFieldError(input.name);
          if (input.name === 'extra_charge') {
            document.getElementById('extra-charge-details-wrap')?.classList.toggle('hidden', input.value !== 'true');
          }
          if (input.name === 'off_platform_offer') {
            document.getElementById('off-platform-details-wrap')?.classList.toggle('hidden', input.value !== 'true');
          }
        });
      });
    }

    normalizePhone(value) {
      const western = String(value || '')
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
      return western.replace(/\D/g, '');
    }

    selectedValue(name) {
      return this.form?.querySelector(`input[name="${name}"]:checked`)?.value || '';
    }

    validate() {
      this.clearAllErrors();
      const phone = this.normalizePhone(document.getElementById('phone')?.value);
      const errors = [];

      if (phone.length < 8 || phone.length > 15) {
        errors.push(['phone', 'أدخل رقم الهاتف المستخدم أثناء الحجز بصورة صحيحة.']);
      }

      RATING_FIELDS.forEach((field) => {
        if (!this.ratings[field]) errors.push([field, 'اختر عدد النجوم.']);
      });

      ['extra_charge', 'off_platform_offer', 'use_again', 'recommend'].forEach((field) => {
        if (!this.selectedValue(field)) errors.push([field, 'اختر إجابة.']);
      });

      errors.forEach(([field, message]) => this.setFieldError(field, message));
      if (errors.length) {
        const firstCard = document.querySelector(`[data-field-card="${errors[0][0]}"]`);
        firstCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return { valid: errors.length === 0, phone };
    }

    setFieldError(field, message) {
      const error = document.querySelector(`[data-error-for="${field}"]`);
      const card = document.querySelector(`[data-field-card="${field}"]`);
      if (error) error.textContent = message;
      card?.classList.add('has-error');
    }

    clearFieldError(field) {
      const error = document.querySelector(`[data-error-for="${field}"]`);
      const card = document.querySelector(`[data-field-card="${field}"]`);
      if (error) error.textContent = '';
      card?.classList.remove('has-error');
    }

    clearAllErrors() {
      document.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
      document.querySelectorAll('.question-card.has-error').forEach((card) => card.classList.remove('has-error'));
      this.formError?.classList.add('hidden');
    }

    async handleSubmit(event) {
      event.preventDefault();
      if (!this.supabase) return;

      const validation = this.validate();
      if (!validation.valid) return;

      const extraCharge = this.selectedValue('extra_charge') === 'true';
      const offPlatformOffer = this.selectedValue('off_platform_offer') === 'true';
      const payload = {
        p_phone: validation.phone,
        p_overall_rating: this.ratings.overall_rating,
        p_punctuality_rating: this.ratings.punctuality_rating,
        p_captain_rating: this.ratings.captain_rating,
        p_car_rating: this.ratings.car_rating,
        p_booking_rating: this.ratings.booking_rating,
        p_extra_charge: extraCharge,
        p_extra_charge_details: extraCharge ? document.getElementById('extra-charge-details')?.value.trim() || null : null,
        p_off_platform_offer: offPlatformOffer,
        p_off_platform_details: offPlatformOffer ? document.getElementById('off-platform-details')?.value.trim() || null : null,
        p_use_again: this.selectedValue('use_again'),
        p_recommend: this.selectedValue('recommend'),
        p_discovery_source: document.getElementById('discovery-source')?.value || null,
        p_notes: document.getElementById('notes')?.value.trim() || null,
      };

      this.setBusy(true);
      try {
        const { error } = await this.supabase.rpc('submit_customer_review', payload);
        if (error) throw error;

        this.panel.classList.add('hidden');
        this.successPanel.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        console.error('Review submission failed:', error);
        this.showFormError('تعذّر إرسال التقييم. تأكد من الاتصال وحاول مرة أخرى.');
      } finally {
        this.setBusy(false);
      }
    }

    setBusy(busy) {
      this.submitButton.disabled = busy;
      this.submitButton.classList.toggle('is-busy', busy);
      const label = this.submitButton.querySelector('span');
      if (label) label.textContent = busy ? 'جارٍ إرسال التقييم' : 'إرسال التقييم';
    }

    showFormError(message) {
      if (!this.formError) return;
      this.formError.textContent = message;
      this.formError.classList.remove('hidden');
    }
  }

  new CustomerReviewForm();
})();
