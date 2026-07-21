(() => {
  'use strict';

  const ICONS = Object.freeze({
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L8 8m4-4 4 4M5 14v5h14v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M18.5 9A7 7 0 0 0 6 7l-2 5m2 3a7 7 0 0 0 12.5 2l1.5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    view: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    toggle: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="12" r="2" fill="currentColor"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    empty: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19zM12 9v5m0 3h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  });

  class AdminDashboard {
    constructor() {
      this.config = null;
      this.supabase = null;
      this.user = null;
      this.invoices = [];
      this.filteredInvoices = [];
      this.uploadedFile = null;

      this.content = document.getElementById('admin-content');
      this.appLoading = document.getElementById('app-loading');
      this.toastRegion = document.getElementById('toast-region');
      this.modalRoot = document.getElementById('modal-root');

      this.init();
    }

    async init() {
      try {
        this.config = window.GREENTOP_CONFIG;

        if (!this.config?.SUPABASE_URL || !this.config?.SUPABASE_ANON_KEY || !window.supabase?.createClient) {
          throw new Error('missing_configuration');
        }

        this.supabase = window.supabase.createClient(
          this.config.SUPABASE_URL,
          this.config.SUPABASE_ANON_KEY,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: false,
            },
          }
        );

        const { data, error } = await this.supabase.auth.getSession();
        if (error) throw error;

        const session = data?.session;
        if (!session || !this.isAuthorized(session.user)) {
          if (session) await this.supabase.auth.signOut();
          this.showLogin();
          return;
        }

        this.user = session.user;
        if (this.mustChangePassword(this.user)) {
          this.showPasswordChange();
          return;
        }

        this.showDashboard();
        await this.loadInvoices();
      } catch (error) {
        console.error('Admin initialization failed:', error);
        this.showFatalError();
      }
    }

    isAuthorized(user) {
      const expectedEmail = String(this.config?.ADMIN_EMAIL || '').trim().toLowerCase();
      const userEmail = String(user?.email || '').trim().toLowerCase();
      return Boolean(expectedEmail && userEmail && expectedEmail === userEmail);
    }

    mustChangePassword(user) {
      return user?.user_metadata?.must_change_password === true;
    }

    hideInitialLoader() {
      this.appLoading?.classList.add('hidden');
    }

    showLogin(message = '') {
      this.hideInitialLoader();
      document.body.classList.remove('dashboard-body');

      this.content.innerHTML = `
        <section class="login-page">
          <div class="login-card">
            <div class="login-brand">
              <img src="assets/green-top-logo.webp" width="720" height="720" alt="Green Top Taxi & Limousine">
              <h1>إدارة الفواتير</h1>
              <p>دخول خاص بإدارة جرين توب</p>
            </div>

            <form id="login-form" novalidate>
              <div class="field">
                <label for="login-email">البريد الإلكتروني</label>
                <input id="login-email" name="email" type="email" inputmode="email" autocomplete="username" required dir="ltr">
              </div>

              <div class="field">
                <label for="login-password">كلمة المرور</label>
                <input id="login-password" name="password" type="password" autocomplete="current-password" required dir="ltr">
              </div>

              <button id="login-button" class="primary-button" type="submit">دخول</button>
              <p id="login-error" class="inline-error hidden" role="alert"></p>
            </form>
          </div>
        </section>
      `;

      const emailInput = document.getElementById('login-email');
      if (emailInput) emailInput.value = this.config?.ADMIN_EMAIL || '';

      const errorElement = document.getElementById('login-error');
      if (message && errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
      }

      document.getElementById('login-form')?.addEventListener('submit', (event) => this.handleLogin(event));
      window.setTimeout(() => document.getElementById('login-password')?.focus(), 50);
    }

    async handleLogin(event) {
      event.preventDefault();

      const emailInput = document.getElementById('login-email');
      const passwordInput = document.getElementById('login-password');
      const loginButton = document.getElementById('login-button');
      const errorElement = document.getElementById('login-error');
      const email = emailInput?.value.trim().toLowerCase() || '';
      const password = passwordInput?.value || '';

      errorElement?.classList.add('hidden');

      if (!email || !password) {
        this.showInlineLoginError('أدخل البريد الإلكتروني وكلمة المرور.');
        return;
      }

      if (email !== String(this.config.ADMIN_EMAIL).toLowerCase()) {
        this.showInlineLoginError('هذا الحساب غير مصرح له بالدخول.');
        return;
      }

      this.setButtonBusy(loginButton, true, 'جارٍ الدخول…', 'دخول');

      try {
        const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (!this.isAuthorized(data?.user)) {
          await this.supabase.auth.signOut();
          throw new Error('not_authorized');
        }

        this.user = data.user;
        if (this.mustChangePassword(this.user)) {
          this.showPasswordChange();
          return;
        }

        this.showDashboard();
        await this.loadInvoices();
      } catch (error) {
        console.error('Login failed:', error);
        this.showInlineLoginError(this.friendlyError(error, 'تعذّر تسجيل الدخول. راجع البيانات وحاول مرة أخرى.'));
      } finally {
        if (document.body.contains(loginButton)) {
          this.setButtonBusy(loginButton, false, 'جارٍ الدخول…', 'دخول');
        }
      }
    }

    showInlineLoginError(message) {
      const element = document.getElementById('login-error');
      if (!element) return;
      element.textContent = message;
      element.classList.remove('hidden');
    }

    showPasswordChange() {
      this.hideInitialLoader();
      document.body.classList.remove('dashboard-body');

      this.content.innerHTML = `
        <section class="login-page">
          <div class="login-card">
            <div class="login-brand">
              <img src="assets/green-top-logo.webp" width="720" height="720" alt="Green Top Taxi & Limousine">
              <h1>أنشئ كلمة مرور جديدة</h1>
              <p>يجب تغيير كلمة المرور المؤقتة قبل فتح لوحة الإدارة.</p>
            </div>

            <form id="password-change-form" novalidate>
              <div class="field">
                <label for="new-password">كلمة المرور الجديدة</label>
                <input id="new-password" name="newPassword" type="password" minlength="12" autocomplete="new-password" required dir="ltr">
                <p class="input-help">12 خانة على الأقل، وبها حرف كبير وصغير ورقم ورمز.</p>
              </div>

              <div class="field">
                <label for="confirm-password">تأكيد كلمة المرور</label>
                <input id="confirm-password" name="confirmPassword" type="password" minlength="12" autocomplete="new-password" required dir="ltr">
              </div>

              <button id="password-change-button" class="primary-button" type="submit">حفظ وفتح اللوحة</button>
              <p id="password-change-error" class="inline-error hidden" role="alert"></p>
            </form>
          </div>
        </section>
      `;

      document.getElementById('password-change-form')?.addEventListener('submit', (event) => this.handlePasswordChange(event));
      window.setTimeout(() => document.getElementById('new-password')?.focus(), 50);
    }

    async handlePasswordChange(event) {
      event.preventDefault();

      const passwordInput = document.getElementById('new-password');
      const confirmInput = document.getElementById('confirm-password');
      const button = document.getElementById('password-change-button');
      const errorElement = document.getElementById('password-change-error');
      const password = passwordInput?.value || '';
      const confirmation = confirmInput?.value || '';

      errorElement?.classList.add('hidden');

      if (password !== confirmation) {
        this.showPasswordChangeError('كلمتا المرور غير متطابقتين.');
        return;
      }

      if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        this.showPasswordChangeError('استخدم 12 خانة على الأقل، وبها حرف كبير وصغير ورقم ورمز.');
        return;
      }

      this.setButtonBusy(button, true, 'جارٍ الحفظ…', 'حفظ وفتح اللوحة');

      try {
        const { data, error } = await this.supabase.auth.updateUser({
          password,
          data: {
            ...(this.user?.user_metadata || {}),
            must_change_password: false,
          },
        });
        if (error) throw error;

        this.user = data?.user || this.user;
        this.showDashboard();
        await this.loadInvoices();
        this.showToast('تم حفظ كلمة المرور الجديدة.');
      } catch (error) {
        console.error('Password change failed:', error);
        this.showPasswordChangeError(this.friendlyError(error, 'تعذّر حفظ كلمة المرور. حاول مرة أخرى.'));
      } finally {
        if (document.body.contains(button)) {
          this.setButtonBusy(button, false, 'جارٍ الحفظ…', 'حفظ وفتح اللوحة');
        }
      }
    }

    showPasswordChangeError(message) {
      const element = document.getElementById('password-change-error');
      if (!element) return;
      element.textContent = message;
      element.classList.remove('hidden');
    }

    showDashboard() {
      this.hideInitialLoader();
      document.body.classList.add('dashboard-body');

      this.content.innerHTML = `
        <div class="dashboard">
          <header class="topbar">
            <div class="topbar-inner">
              <div class="topbar-brand">
                <img src="assets/green-top-logo.webp" width="720" height="720" alt="">
                <div>
                  <h1>إدارة فواتير جرين توب</h1>
                  <p id="admin-email" dir="ltr"></p>
                </div>
              </div>
              <button id="logout-button" class="logout-button" type="button" aria-label="تسجيل الخروج">
                ${ICONS.logout}
                <span>خروج</span>
              </button>
            </div>
          </header>

          <div class="dashboard-main">
            <section class="page-intro">
              <div>
                <h2>الفواتير</h2>
                <p>ارفع الفاتورة وانسخ رابط العميل الخاص بها.</p>
              </div>
              <div class="stats" aria-label="ملخص الفواتير">
                <div class="stat-chip">
                  <strong id="total-count">0</strong>
                  <span>إجمالي</span>
                </div>
                <div class="stat-chip">
                  <strong id="active-count">0</strong>
                  <span>نشطة</span>
                </div>
              </div>
            </section>

            <div class="dashboard-grid">
              <section class="panel" aria-labelledby="upload-title">
                <div class="panel-heading">
                  <h3 id="upload-title">رفع فاتورة جديدة</h3>
                  <p>تُحفظ الفاتورة بصورة خاصة ولا تُفتح إلا من رابطها.</p>
                </div>

                <form id="upload-form" class="upload-form" novalidate>
                  <div class="field">
                    <label for="customer-name">اسم العميل <span class="required-mark">*</span></label>
                    <input id="customer-name" name="customerName" type="text" maxlength="100" autocomplete="off" required>
                  </div>

                  <div class="field">
                    <label for="invoice-number">رقم الفاتورة <span class="required-mark">*</span></label>
                    <input id="invoice-number" name="invoiceNumber" type="text" maxlength="80" autocomplete="off" required dir="ltr">
                  </div>

                  <div class="field">
                    <label for="invoice-notes">ملاحظة داخلية</label>
                    <textarea id="invoice-notes" name="notes" maxlength="500" placeholder="اختياري — لا تظهر للعميل"></textarea>
                  </div>

                  <div class="field">
                    <label>ملف الفاتورة <span class="required-mark">*</span></label>
                    <label id="file-picker" class="file-picker" for="invoice-file">
                      <input id="invoice-file" name="invoiceFile" type="file" accept="application/pdf,.pdf" required>
                      ${ICONS.upload}
                      <strong id="file-picker-title">اضغط لاختيار ملف الفاتورة</strong>
                      <small id="file-picker-help">ملف بصيغة PDF وبحد أقصى ${Number(this.config.MAX_FILE_SIZE_MB) || 10} ميجابايت</small>
                    </label>
                  </div>

                  <button id="upload-button" class="primary-button" type="submit">رفع وإنشاء الرابط</button>
                </form>
              </section>

              <section class="panel" aria-labelledby="list-title">
                <div class="panel-heading">
                  <h3 id="list-title">الفواتير المحفوظة</h3>
                  <p>يمكنك نسخ الرابط أو إيقافه أو حذف الفاتورة.</p>
                </div>

                <div class="list-toolbar">
                  <div class="search-wrap">
                    ${ICONS.search}
                    <input id="invoice-search" class="search-input" type="search" placeholder="بحث بالاسم أو رقم الفاتورة" autocomplete="off">
                  </div>
                  <button id="refresh-button" class="refresh-button" type="button" aria-label="تحديث القائمة">
                    ${ICONS.refresh}
                  </button>
                </div>

                <div id="invoice-list" class="invoice-list">
                  <div class="list-loading">
                    <span class="spinner" aria-hidden="true"></span>
                    <p>جارٍ تحميل الفواتير…</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      `;

      const adminEmail = document.getElementById('admin-email');
      if (adminEmail) adminEmail.textContent = this.user?.email || '';

      this.bindDashboardEvents();
    }

    bindDashboardEvents() {
      document.getElementById('logout-button')?.addEventListener('click', () => this.logout());
      document.getElementById('upload-form')?.addEventListener('submit', (event) => this.handleUpload(event));
      document.getElementById('invoice-file')?.addEventListener('change', (event) => {
        this.setSelectedFile(event.target.files?.[0] || null);
      });
      document.getElementById('invoice-search')?.addEventListener('input', (event) => {
        this.filterInvoices(event.target.value);
      });
      document.getElementById('refresh-button')?.addEventListener('click', () => this.loadInvoices());

      const picker = document.getElementById('file-picker');
      picker?.addEventListener('dragover', (event) => {
        event.preventDefault();
        picker.classList.add('is-dragging');
      });
      picker?.addEventListener('dragleave', () => picker.classList.remove('is-dragging'));
      picker?.addEventListener('drop', (event) => this.handleFileDrop(event));
    }

    handleFileDrop(event) {
      event.preventDefault();
      const picker = document.getElementById('file-picker');
      picker?.classList.remove('is-dragging');

      const file = event.dataTransfer?.files?.[0];
      const input = document.getElementById('invoice-file');
      if (!file || !input || typeof DataTransfer === 'undefined') return;

      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      this.setSelectedFile(file);
    }

    setSelectedFile(file) {
      this.uploadedFile = file;
      const title = document.getElementById('file-picker-title');
      const help = document.getElementById('file-picker-help');
      if (!title || !help) return;

      if (!file) {
        title.textContent = 'اضغط لاختيار ملف الفاتورة';
        title.classList.remove('selected-file');
        help.textContent = `ملف بصيغة PDF وبحد أقصى ${Number(this.config.MAX_FILE_SIZE_MB) || 10} ميجابايت`;
        return;
      }

      title.textContent = file.name;
      title.classList.add('selected-file');
      help.textContent = this.formatFileSize(file.size);
    }

    async loadInvoices() {
      const list = document.getElementById('invoice-list');
      if (!list) return;

      list.innerHTML = `
        <div class="list-loading">
          <span class="spinner" aria-hidden="true"></span>
          <p>جارٍ تحميل الفواتير…</p>
        </div>
      `;

      try {
        const { data, error } = await this.supabase
          .from('invoices')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        this.invoices = Array.isArray(data) ? data : [];
        const searchValue = document.getElementById('invoice-search')?.value || '';
        this.filterInvoices(searchValue);
        this.updateStats();
      } catch (error) {
        console.error('Invoice loading failed:', error);
        this.renderListError(this.friendlyError(error, 'تعذّر تحميل الفواتير. حاول مرة أخرى.'));
      }
    }

    filterInvoices(rawQuery) {
      const query = String(rawQuery || '').trim().toLocaleLowerCase('ar');
      this.filteredInvoices = !query
        ? [...this.invoices]
        : this.invoices.filter((invoice) => {
            const haystack = `${invoice.customer_name || ''} ${invoice.invoice_number || ''} ${invoice.notes || ''}`
              .toLocaleLowerCase('ar');
            return haystack.includes(query);
          });

      this.renderInvoices();
    }

    updateStats() {
      const total = document.getElementById('total-count');
      const active = document.getElementById('active-count');
      if (total) total.textContent = String(this.invoices.length);
      if (active) active.textContent = String(this.invoices.filter((invoice) => invoice.is_enabled).length);
    }

    renderInvoices() {
      const list = document.getElementById('invoice-list');
      if (!list) return;
      list.replaceChildren();

      if (!this.filteredInvoices.length) {
        const isSearching = Boolean(document.getElementById('invoice-search')?.value.trim());
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = ICONS.empty;
        const title = document.createElement('h4');
        title.textContent = isSearching ? 'لا توجد نتيجة مطابقة' : 'لا توجد فواتير حتى الآن';
        const message = document.createElement('p');
        message.textContent = isSearching ? 'غيّر كلمة البحث وحاول مرة أخرى.' : 'ارفع أول فاتورة وسيظهر رابط العميل هنا.';
        empty.append(title, message);
        list.appendChild(empty);
        return;
      }

      const fragment = document.createDocumentFragment();
      this.filteredInvoices.forEach((invoice) => fragment.appendChild(this.createInvoiceCard(invoice)));
      list.appendChild(fragment);
    }

    createInvoiceCard(invoice) {
      const card = document.createElement('article');
      card.className = `invoice-card${invoice.is_enabled ? '' : ' is-disabled'}`;

      const top = document.createElement('div');
      top.className = 'invoice-card-top';

      const identity = document.createElement('div');
      const number = document.createElement('h4');
      number.className = 'invoice-number';
      number.dir = 'ltr';
      number.textContent = `#${invoice.invoice_number || '—'}`;
      const customer = document.createElement('p');
      customer.className = 'customer-name';
      customer.textContent = invoice.customer_name || 'بدون اسم';
      identity.append(number, customer);

      const status = document.createElement('span');
      status.className = `status-badge ${invoice.is_enabled ? 'status-active' : 'status-disabled'}`;
      status.textContent = invoice.is_enabled ? 'نشطة' : 'موقوفة';
      top.append(identity, status);

      const meta = document.createElement('div');
      meta.className = 'invoice-meta';
      const date = document.createElement('span');
      date.textContent = this.formatDate(invoice.created_at);
      meta.appendChild(date);
      if (Number(invoice.file_size) > 0) {
        const size = document.createElement('span');
        size.textContent = this.formatFileSize(Number(invoice.file_size));
        meta.appendChild(size);
      }

      const actions = document.createElement('div');
      actions.className = 'invoice-actions';
      actions.append(
        this.createActionButton('نسخ رابط العميل', 'action-copy', ICONS.copy, () => this.copyInvoiceLink(invoice.secure_token)),
        this.createActionButton('معاينة', '', ICONS.view, () => this.previewInvoice(invoice.secure_token)),
        this.createActionButton(invoice.is_enabled ? 'إيقاف الرابط' : 'تفعيل الرابط', '', ICONS.toggle, () => this.toggleInvoice(invoice)),
        this.createActionButton('حذف', 'action-delete', ICONS.delete, () => this.deleteInvoice(invoice))
      );

      card.append(top, meta, actions);
      return card;
    }

    createActionButton(label, extraClass, icon, handler) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `small-button ${extraClass}`.trim();
      button.innerHTML = icon;
      const text = document.createElement('span');
      text.textContent = label;
      button.appendChild(text);
      button.addEventListener('click', handler);
      return button;
    }

    renderListError(message) {
      const list = document.getElementById('invoice-list');
      if (!list) return;
      list.replaceChildren();
      const error = document.createElement('div');
      error.className = 'list-error';
      error.innerHTML = ICONS.warning;
      const title = document.createElement('h4');
      title.textContent = 'تعذّر تحميل القائمة';
      const text = document.createElement('p');
      text.textContent = message;
      error.append(title, text);
      list.appendChild(error);
    }

    async handleUpload(event) {
      event.preventDefault();

      const nameInput = document.getElementById('customer-name');
      const numberInput = document.getElementById('invoice-number');
      const notesInput = document.getElementById('invoice-notes');
      const fileInput = document.getElementById('invoice-file');
      const uploadButton = document.getElementById('upload-button');

      const customerName = nameInput?.value.trim() || '';
      const invoiceNumber = numberInput?.value.trim() || '';
      const notes = notesInput?.value.trim() || '';
      const file = fileInput?.files?.[0] || null;

      if (!customerName || !invoiceNumber || !file) {
        this.showToast('أكمل اسم العميل ورقم الفاتورة واختر الملف.', 'error');
        return;
      }

      const maxBytes = (Number(this.config.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;
      if (file.size > maxBytes) {
        this.showToast(`حجم الملف أكبر من ${Number(this.config.MAX_FILE_SIZE_MB) || 10} ميجابايت.`, 'error');
        return;
      }

      this.setButtonBusy(uploadButton, true, 'جارٍ رفع الفاتورة…', 'رفع وإنشاء الرابط');
      this.setUploadFormDisabled(true);

      let filePath = '';

      try {
        await this.assertPdf(file);

        filePath = `${this.createUuid()}.pdf`;
        const secureToken = this.generateSecureToken();

        const { error: uploadError } = await this.supabase.storage
          .from('invoices')
          .upload(filePath, file, {
            cacheControl: '3600',
            contentType: 'application/pdf',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { error: databaseError } = await this.supabase
          .from('invoices')
          .insert({
            customer_name: customerName,
            customer_email: null,
            invoice_number: invoiceNumber,
            file_path: filePath,
            file_size: file.size,
            notes: notes || null,
            secure_token: secureToken,
            is_enabled: true,
          });

        if (databaseError) {
          await this.supabase.storage.from('invoices').remove([filePath]);
          throw databaseError;
        }

        const customerLink = this.buildCustomerLink(secureToken);
        event.target.reset();
        this.setSelectedFile(null);
        await this.loadInvoices();
        this.showLinkModal(invoiceNumber, customerLink);
        this.showToast('تم رفع الفاتورة وإنشاء رابط العميل.', 'success');
      } catch (error) {
        console.error('Invoice upload failed:', error);
        this.showToast(this.friendlyError(error, 'تعذّر رفع الفاتورة. حاول مرة أخرى.'), 'error', 6500);
      } finally {
        this.setUploadFormDisabled(false);
        this.setButtonBusy(uploadButton, false, 'جارٍ رفع الفاتورة…', 'رفع وإنشاء الرابط');
      }
    }

    async assertPdf(file) {
      const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
      const allowedMime = !file.type || file.type === 'application/pdf';
      const signature = await file.slice(0, 1024).text();

      if (!hasPdfExtension || !allowedMime || !signature.includes('%PDF-')) {
        throw new Error('invalid_pdf');
      }
    }

    setUploadFormDisabled(isDisabled) {
      document.querySelectorAll('#upload-form input, #upload-form textarea').forEach((element) => {
        element.disabled = isDisabled;
      });
    }

    setButtonBusy(button, isBusy, busyText, defaultText) {
      if (!button) return;
      button.disabled = isBusy;
      button.textContent = isBusy ? busyText : defaultText;
    }

    async toggleInvoice(invoice) {
      try {
        const { error } = await this.supabase
          .from('invoices')
          .update({ is_enabled: !invoice.is_enabled })
          .eq('id', invoice.id);

        if (error) throw error;
        this.showToast(invoice.is_enabled ? 'تم إيقاف رابط الفاتورة.' : 'تم تفعيل رابط الفاتورة.', 'success');
        await this.loadInvoices();
      } catch (error) {
        console.error('Invoice status update failed:', error);
        this.showToast(this.friendlyError(error, 'تعذّر تغيير حالة الفاتورة.'), 'error');
      }
    }

    async deleteInvoice(invoice) {
      const confirmed = await this.confirmModal({
        title: 'حذف الفاتورة؟',
        message: `سيتم حذف الفاتورة رقم ${invoice.invoice_number || ''} نهائيًا، وسيتوقف رابط العميل فورًا.`,
        confirmText: 'حذف نهائي',
      });

      if (!confirmed) return;

      try {
        const { error: databaseError } = await this.supabase
          .from('invoices')
          .delete()
          .eq('id', invoice.id);

        if (databaseError) throw databaseError;

        const { error: storageError } = await this.supabase.storage
          .from('invoices')
          .remove([invoice.file_path]);

        if (storageError) {
          console.error('Orphaned invoice file cleanup failed:', storageError);
          this.showToast('تم إيقاف الرابط وحذف السجل، وتعذّر تنظيف الملف المخزن.', 'error', 6500);
        } else {
          this.showToast('تم حذف الفاتورة نهائيًا.', 'success');
        }

        await this.loadInvoices();
      } catch (error) {
        console.error('Invoice deletion failed:', error);
        this.showToast(this.friendlyError(error, 'تعذّر حذف الفاتورة.'), 'error');
      }
    }

    copyInvoiceLink(token) {
      return this.copyText(this.buildCustomerLink(token)).then((copied) => {
        this.showToast(copied ? 'تم نسخ رابط العميل.' : 'تعذّر نسخ الرابط.', copied ? 'success' : 'error');
      });
    }

    previewInvoice(token) {
      const popup = window.open(this.buildCustomerLink(token), '_blank', 'noopener,noreferrer');
      if (!popup) this.showToast('اسمح بفتح النوافذ لمعاينة الفاتورة.', 'error');
    }

    buildCustomerLink(token) {
      const url = new URL(window.location.href);
      url.pathname = url.pathname.replace(/admin\.html\/?$/i, '');
      url.search = '';
      url.hash = '';
      url.searchParams.set('token', token);
      return url.toString();
    }

    generateSecureToken() {
      const bytes = new Uint8Array(32);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    createUuid() {
      if (window.crypto.randomUUID) return window.crypto.randomUUID();
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
    }

    async copyText(value) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (error) {
        try {
          const area = document.createElement('textarea');
          area.value = value;
          area.setAttribute('readonly', '');
          area.className = 'clipboard-helper';
          document.body.appendChild(area);
          area.select();
          const copied = document.execCommand('copy');
          area.remove();
          return copied;
        } catch (fallbackError) {
          console.error('Clipboard copy failed:', error, fallbackError);
          return false;
        }
      }
    }

    showLinkModal(invoiceNumber, customerLink) {
      this.modalRoot.replaceChildren();

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.innerHTML = `
        <div class="modal-card">
          <h3></h3>
          <p>هذا هو الرابط الخاص بالعميل. لا يفتح أي فاتورة أخرى.</p>
          <div class="link-box"></div>
          <div class="modal-actions">
            <button class="primary-button" type="button" data-modal-action="copy">نسخ الرابط</button>
            <button class="secondary-button" type="button" data-modal-action="preview">معاينة</button>
            <button class="ghost-button modal-close-row" type="button" data-modal-action="close">إغلاق</button>
          </div>
        </div>
      `;

      backdrop.querySelector('h3').textContent = `فاتورة رقم ${invoiceNumber}`;
      backdrop.querySelector('.link-box').textContent = customerLink;
      backdrop.querySelector('[data-modal-action="copy"]').addEventListener('click', async () => {
        const copied = await this.copyText(customerLink);
        this.showToast(copied ? 'تم نسخ رابط العميل.' : 'تعذّر نسخ الرابط.', copied ? 'success' : 'error');
      });
      backdrop.querySelector('[data-modal-action="preview"]').addEventListener('click', () => {
        window.open(customerLink, '_blank', 'noopener,noreferrer');
      });
      backdrop.querySelector('[data-modal-action="close"]').addEventListener('click', () => backdrop.remove());
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) backdrop.remove();
      });

      this.modalRoot.appendChild(backdrop);
      backdrop.querySelector('[data-modal-action="copy"]').focus();
    }

    confirmModal({ title, message, confirmText }) {
      return new Promise((resolve) => {
        this.modalRoot.replaceChildren();

        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.setAttribute('role', 'alertdialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.innerHTML = `
          <div class="modal-card">
            <h3></h3>
            <p></p>
            <div class="modal-actions">
              <button class="danger-button" type="button" data-confirm="yes"></button>
              <button class="ghost-button" type="button" data-confirm="no">إلغاء</button>
            </div>
          </div>
        `;

        backdrop.querySelector('h3').textContent = title;
        backdrop.querySelector('p').textContent = message;
        backdrop.querySelector('[data-confirm="yes"]').textContent = confirmText;

        const finish = (value) => {
          backdrop.remove();
          resolve(value);
        };

        backdrop.querySelector('[data-confirm="yes"]').addEventListener('click', () => finish(true));
        backdrop.querySelector('[data-confirm="no"]').addEventListener('click', () => finish(false));
        backdrop.addEventListener('click', (event) => {
          if (event.target === backdrop) finish(false);
        });

        this.modalRoot.appendChild(backdrop);
        backdrop.querySelector('[data-confirm="no"]').focus();
      });
    }

    showToast(message, type = 'success', duration = 4000) {
      if (!this.toastRegion) return;
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      this.toastRegion.appendChild(toast);
      window.setTimeout(() => toast.remove(), duration);
    }

    formatDate(value) {
      if (!value) return 'تاريخ غير متاح';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'تاريخ غير متاح';

      return new Intl.DateTimeFormat('ar-KW', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kuwait',
      }).format(date);
    }

    formatFileSize(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 كيلوبايت';
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
    }

    friendlyError(error, fallback) {
      const message = String(error?.message || error || '').toLowerCase();
      const code = String(error?.code || '');

      if (message.includes('invalid login credentials')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      if (message.includes('email not confirmed')) return 'يجب تأكيد البريد الإلكتروني أولًا.';
      if (message.includes('not_authorized')) return 'هذا الحساب غير مصرح له بالدخول.';
      if (message.includes('invalid_pdf')) return 'الملف المختار ليس فاتورة بصيغة PDF صحيحة.';
      if (code === '23505' || message.includes('duplicate key')) return 'رقم الفاتورة مستخدم من قبل. أدخل رقمًا مختلفًا.';
      if (message.includes('bucket not found')) return 'مخزن الفواتير غير مُجهّز بعد.';
      if (message.includes('row-level security') || message.includes('permission denied')) return 'صلاحيات الإدارة غير مُجهّزة بصورة صحيحة.';
      if (message.includes('failed to fetch') || message.includes('network')) return 'تعذّر الاتصال بالخدمة. تحقق من الإنترنت وحاول مرة أخرى.';
      return fallback;
    }

    async logout() {
      try {
        await this.supabase.auth.signOut();
      } catch (error) {
        console.error('Logout failed:', error);
      } finally {
        this.user = null;
        this.invoices = [];
        this.showLogin();
      }
    }

    showFatalError() {
      this.hideInitialLoader();
      this.content.innerHTML = `
        <section class="login-page">
          <div class="login-card">
            <div class="login-brand">
              <img src="assets/green-top-logo.webp" width="720" height="720" alt="Green Top Taxi & Limousine">
              <h1>تعذّر فتح لوحة الإدارة</h1>
              <p>تأكد من اتصال الإنترنت وإعدادات المشروع ثم أعد تحميل الصفحة.</p>
            </div>
            <button id="fatal-reload-button" class="primary-button" type="button">إعادة المحاولة</button>
          </div>
        </section>
      `;
      document.getElementById('fatal-reload-button')?.addEventListener('click', () => window.location.reload());
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.adminDashboard = new AdminDashboard();
  });
})();
