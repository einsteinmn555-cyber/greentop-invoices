(() => {
  'use strict';

  const SOURCE_LABELS = Object.freeze({
    google: 'بحث Google',
    website: 'الموقع الإلكتروني',
    social: 'وسائل التواصل',
    referral: 'ترشيح شخص',
    returning: 'عميل سابق',
    other: 'أخرى',
  });

  const ANSWER_LABELS = Object.freeze({ yes: 'نعم', maybe: 'ربما', no: 'لا' });

  class ReviewsAdmin {
    constructor() {
      this.content = document.getElementById('reviews-admin-content');
      this.loading = document.getElementById('app-loading');
      this.reviews = [];
      this.filtered = [];
      this.supabase = null;
      this.user = null;
      this.config = window.GREENTOP_CONFIG;
      this.init();
    }

    async init() {
      try {
        if (!this.config?.SUPABASE_URL || !this.config?.SUPABASE_ANON_KEY || !window.supabase?.createClient) {
          throw new Error('missing_configuration');
        }
        this.supabase = window.supabase.createClient(this.config.SUPABASE_URL, this.config.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        });

        const { data, error } = await this.supabase.auth.getSession();
        if (error) throw error;
        const session = data?.session;
        if (!session || !this.isAuthorized(session.user)) {
          if (session) await this.supabase.auth.signOut();
          this.showLogin();
          return;
        }

        this.user = session.user;
        this.showDashboard();
        await this.loadReviews();
      } catch (error) {
        console.error('Reviews admin initialization failed:', error);
        this.showFatalError();
      }
    }

    isAuthorized(user) {
      return String(user?.email || '').toLowerCase() === String(this.config?.ADMIN_EMAIL || '').toLowerCase();
    }

    hideLoader() { this.loading?.classList.add('hidden'); }

    showLogin(message = '') {
      this.hideLoader();
      this.content.innerHTML = `
        <section class="login-page">
          <div class="login-card">
            <div class="login-brand">
              <img src="/assets/green-top-logo.webp" width="720" height="720" alt="Green Top Taxi & Limousine">
              <h1>تقييمات العملاء</h1>
              <p>دخول خاص بإدارة جرين توب</p>
            </div>
            <form id="reviews-login-form" novalidate>
              <div class="field">
                <label for="reviews-email">البريد الإلكتروني</label>
                <input id="reviews-email" type="email" autocomplete="username" required dir="ltr">
              </div>
              <div class="field">
                <label for="reviews-password">كلمة المرور</label>
                <input id="reviews-password" type="password" autocomplete="current-password" required dir="ltr">
              </div>
              <button id="reviews-login-button" class="primary-button" type="submit">دخول</button>
              <p id="reviews-login-error" class="inline-error ${message ? '' : 'hidden'}" role="alert">${this.escape(message)}</p>
            </form>
          </div>
        </section>`;

      const email = document.getElementById('reviews-email');
      if (email) email.value = this.config.ADMIN_EMAIL || '';
      document.getElementById('reviews-login-form')?.addEventListener('submit', (event) => this.handleLogin(event));
      window.setTimeout(() => document.getElementById('reviews-password')?.focus(), 50);
    }

    async handleLogin(event) {
      event.preventDefault();
      const email = document.getElementById('reviews-email')?.value.trim().toLowerCase() || '';
      const password = document.getElementById('reviews-password')?.value || '';
      const button = document.getElementById('reviews-login-button');
      const errorElement = document.getElementById('reviews-login-error');
      errorElement?.classList.add('hidden');

      if (!email || !password || email !== String(this.config.ADMIN_EMAIL).toLowerCase()) {
        this.showLoginError('راجع البريد الإلكتروني وكلمة المرور.');
        return;
      }

      button.disabled = true;
      button.textContent = 'جارٍ الدخول…';
      try {
        const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!this.isAuthorized(data?.user)) throw new Error('not_authorized');
        this.user = data.user;
        this.showDashboard();
        await this.loadReviews();
      } catch (error) {
        console.error('Reviews login failed:', error);
        this.showLoginError('تعذّر تسجيل الدخول. راجع البيانات وحاول مرة أخرى.');
      } finally {
        if (document.body.contains(button)) {
          button.disabled = false;
          button.textContent = 'دخول';
        }
      }
    }

    showLoginError(message) {
      const element = document.getElementById('reviews-login-error');
      if (!element) return;
      element.textContent = message;
      element.classList.remove('hidden');
    }

    showDashboard() {
      this.hideLoader();
      document.body.classList.add('dashboard-body');
      this.content.innerHTML = `
        <div class="dashboard">
          <header class="topbar">
            <div class="topbar-inner">
              <div class="topbar-brand">
                <img src="/assets/green-top-logo.webp" width="720" height="720" alt="">
                <div><h1>تقييمات عملاء جرين توب</h1><p dir="ltr">${this.escape(this.user?.email || '')}</p></div>
              </div>
              <div class="admin-nav-actions">
                <a class="admin-nav-link" href="/admin">إدارة الفواتير</a>
                <button id="reviews-logout" class="logout-button" type="button"><span>خروج</span></button>
              </div>
            </div>
          </header>

          <div class="reviews-dashboard-main">
            <section class="page-intro">
              <div><h2>آراء العملاء</h2><p>متابعة التقييمات والملاحظات والتنبيهات التشغيلية.</p></div>
            </section>

            <section class="reviews-summary" aria-label="ملخص التقييمات">
              <div class="summary-card"><strong id="reviews-total">0</strong><span>إجمالي التقييمات</span></div>
              <div class="summary-card"><strong id="reviews-average">—</strong><span>متوسط التقييم</span></div>
              <div class="summary-card"><strong id="reviews-recommend">0%</strong><span>يرشحون الخدمة</span></div>
              <div class="summary-card"><strong id="reviews-alerts">0</strong><span>تنبيهات تحتاج مراجعة</span></div>
            </section>

            <section class="reviews-panel">
              <div class="reviews-toolbar">
                <input id="reviews-search" class="search-input" type="search" placeholder="بحث برقم الهاتف أو الملاحظة">
                <button id="reviews-refresh" class="refresh-button" type="button" aria-label="تحديث">↻</button>
              </div>
              <div id="reviews-list" class="reviews-list"><div class="reviews-empty">جارٍ تحميل التقييمات…</div></div>
            </section>
          </div>
        </div>`;

      document.getElementById('reviews-logout')?.addEventListener('click', () => this.logout());
      document.getElementById('reviews-refresh')?.addEventListener('click', () => this.loadReviews());
      document.getElementById('reviews-search')?.addEventListener('input', (event) => this.filterReviews(event.target.value));
    }

    async loadReviews() {
      const list = document.getElementById('reviews-list');
      if (list) list.innerHTML = '<div class="reviews-empty">جارٍ تحميل التقييمات…</div>';

      try {
        const { data, error } = await this.supabase
          .from('customer_reviews')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        this.reviews = data || [];
        this.filtered = [...this.reviews];
        this.updateSummary();
        this.renderReviews();
      } catch (error) {
        console.error('Loading reviews failed:', error);
        if (list) list.innerHTML = '<div class="reviews-error">تعذّر تحميل التقييمات. حاول التحديث.</div>';
      }
    }

    filterReviews(term) {
      const query = String(term || '').trim().toLowerCase();
      this.filtered = !query ? [...this.reviews] : this.reviews.filter((review) => [
        review.phone,
        review.notes,
        review.extra_charge_details,
        review.off_platform_details,
        SOURCE_LABELS[review.discovery_source],
      ].some((value) => String(value || '').toLowerCase().includes(query)));
      this.renderReviews();
    }

    updateSummary() {
      const total = this.reviews.length;
      const average = total ? this.reviews.reduce((sum, review) => sum + Number(review.overall_rating || 0), 0) / total : 0;
      const recommended = total ? this.reviews.filter((review) => review.recommend === 'yes').length / total * 100 : 0;
      const alerts = this.reviews.filter((review) => review.extra_charge || review.off_platform_offer).length;
      document.getElementById('reviews-total').textContent = String(total);
      document.getElementById('reviews-average').textContent = total ? `${average.toFixed(1)} ★` : '—';
      document.getElementById('reviews-recommend').textContent = `${Math.round(recommended)}%`;
      document.getElementById('reviews-alerts').textContent = String(alerts);
    }

    renderReviews() {
      const list = document.getElementById('reviews-list');
      if (!list) return;
      if (!this.filtered.length) {
        list.innerHTML = '<div class="reviews-empty">لا توجد تقييمات مطابقة حتى الآن.</div>';
        return;
      }
      list.innerHTML = this.filtered.map((review) => this.reviewCard(review)).join('');
    }

    reviewCard(review) {
      const alert = review.extra_charge || review.off_platform_offer;
      const notes = review.notes ? `<p class="review-text">${this.escape(review.notes)}</p>` : '';
      const extra = review.extra_charge
        ? `<p class="review-text review-alert-text"><strong>طلب مبلغًا إضافيًا:</strong> ${this.escape(review.extra_charge_details || 'لم يكتب العميل تفاصيل.')}</p>` : '';
      const outside = review.off_platform_offer
        ? `<p class="review-text review-alert-text"><strong>عرض التعامل خارج جرين توب:</strong> ${this.escape(review.off_platform_details || 'لم يكتب العميل تفاصيل.')}</p>` : '';
      const source = SOURCE_LABELS[review.discovery_source] || 'غير محدد';

      return `
        <article class="review-admin-card ${alert ? 'has-alert' : ''}">
          <div class="review-admin-top">
            <div><h3 class="review-phone">${this.escape(review.phone)}</h3><p class="review-date">${this.escape(this.formatDate(review.created_at))}</p></div>
            <div class="review-overall" aria-label="${review.overall_rating} من 5">${this.stars(review.overall_rating)}</div>
          </div>
          <div class="rating-details">
            ${this.ratingDetail('عام', review.overall_rating)}
            ${this.ratingDetail('الموعد', review.punctuality_rating)}
            ${this.ratingDetail('الكابتن', review.captain_rating)}
            ${this.ratingDetail('السيارة', review.car_rating)}
            ${this.ratingDetail('الحجز', review.booking_rating)}
          </div>
          <div class="answer-row">
            <span class="answer-chip">يطلب الخدمة: ${ANSWER_LABELS[review.use_again] || '—'}</span>
            <span class="answer-chip">يرشحنا: ${ANSWER_LABELS[review.recommend] || '—'}</span>
            <span class="answer-chip">وصل إلينا: ${this.escape(source)}</span>
            ${review.extra_charge ? '<span class="answer-chip alert">مبلغ إضافي</span>' : ''}
            ${review.off_platform_offer ? '<span class="answer-chip alert">تعامل خارج الشركة</span>' : ''}
          </div>
          ${extra}${outside}${notes}
        </article>`;
    }

    ratingDetail(label, value) {
      return `<div class="rating-detail"><strong>${Number(value || 0)}/5</strong><span>${label}</span></div>`;
    }

    stars(value) {
      const count = Math.max(0, Math.min(5, Number(value || 0)));
      return '★'.repeat(count) + '☆'.repeat(5 - count);
    }

    formatDate(value) {
      try {
        return new Intl.DateTimeFormat('ar-KW', {
          dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuwait',
        }).format(new Date(value));
      } catch { return String(value || ''); }
    }

    async logout() {
      await this.supabase.auth.signOut();
      this.user = null;
      document.body.classList.remove('dashboard-body');
      this.showLogin();
    }

    showFatalError() {
      this.hideLoader();
      this.content.innerHTML = '<section class="login-page"><div class="login-card"><div class="login-brand"><img src="/assets/green-top-logo.webp" alt=""><h1>تعذّر فتح اللوحة</h1><p>أعد تحميل الصفحة وحاول مرة أخرى.</p></div></div></section>';
    }

    escape(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }
  }

  new ReviewsAdmin();
})();
