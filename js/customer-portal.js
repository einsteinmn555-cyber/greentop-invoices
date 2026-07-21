(() => {
  'use strict';

  class CustomerPortal {
    constructor() {
      this.config = null;
      this.token = null;
      this.invoiceData = null;
      this.urlCreatedAt = 0;

      this.loading = document.getElementById('loading');
      this.invoiceContainer = document.getElementById('invoice-container');
      this.errorContainer = document.getElementById('invoice-error');
      this.errorMessage = document.getElementById('error-message');
      this.invoiceReference = document.getElementById('invoice-reference');
      this.viewerSection = document.getElementById('viewer-section');
      this.invoiceFrame = document.getElementById('invoice-frame');
      this.viewerFallback = document.getElementById('viewer-fallback');
      this.viewButton = document.getElementById('view-invoice-btn');

      this.bindEvents();
      this.init();
    }

    bindEvents() {
      this.viewButton?.addEventListener('click', () => this.viewInvoice());
      document.getElementById('website-btn')?.addEventListener('click', () => this.visitWebsite());
      document.getElementById('error-website-btn')?.addEventListener('click', () => this.visitWebsite());
      document.getElementById('close-viewer-btn')?.addEventListener('click', () => this.closeViewer());
      document.getElementById('open-invoice-btn')?.addEventListener('click', () => this.openInvoice());
    }

    async init() {
      try {
        this.config = window.GREENTOP_CONFIG;

        if (!this.config?.INVOICE_FUNCTION_URL || !this.config?.OFFICIAL_WEBSITE) {
          throw new Error('missing_configuration');
        }

        const params = new URLSearchParams(window.location.search);
        this.token = (params.get('token') || '').trim().toLowerCase();

        if (!this.token) {
          this.showError('افتح رابط الفاتورة الذي أرسلته لك جرين توب.');
          return;
        }

        if (!/^[a-f0-9]{64}$/.test(this.token)) {
          this.showError('رابط الفاتورة غير صحيح أو غير مكتمل.');
          return;
        }

        await this.refreshInvoiceAccess();
        this.showInvoiceReady();
      } catch (error) {
        console.error('Customer portal initialization failed:', error);
        this.showError('الرابط غير صحيح أو لم يعد متاحًا.');
      }
    }

    async refreshInvoiceAccess() {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);
      const headers = { 'Content-Type': 'application/json' };

      if (this.config.SUPABASE_ANON_KEY) {
        headers.apikey = this.config.SUPABASE_ANON_KEY;
        headers.Authorization = `Bearer ${this.config.SUPABASE_ANON_KEY}`;
      }

      try {
        const response = await fetch(this.config.INVOICE_FUNCTION_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({ token: this.token }),
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data?.url) {
          throw new Error(data?.error || `invoice_request_${response.status}`);
        }

        this.invoiceData = data;
        this.urlCreatedAt = Date.now();
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    showInvoiceReady() {
      this.loading?.classList.add('hidden');
      this.errorContainer?.classList.add('hidden');
      this.invoiceContainer?.classList.remove('hidden');

      const number = String(this.invoiceData?.invoice_number || '').trim();
      if (number && this.invoiceReference) {
        this.invoiceReference.textContent = `Invoice #${number}`;
        this.invoiceReference.classList.remove('hidden');
      }
    }

    async viewInvoice() {
      if (!this.invoiceData?.url) return;

      this.setViewButtonBusy(true);

      try {
        const signedUrlAge = Date.now() - this.urlCreatedAt;
        if (signedUrlAge > 7 * 60 * 1000) {
          await this.refreshInvoiceAccess();
        }

        this.invoiceFrame.src = `${this.invoiceData.url}#toolbar=1&navpanes=0&view=FitH`;
        this.viewerSection.classList.remove('hidden');

        window.setTimeout(() => {
          this.viewerFallback?.classList.remove('hidden');
        }, 1200);

        this.viewerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        console.error('Invoice view failed:', error);
        this.showError('تعذّر فتح الفاتورة الآن. أعد فتح الرابط وحاول مرة أخرى.');
      } finally {
        this.setViewButtonBusy(false);
      }
    }

    setViewButtonBusy(isBusy) {
      if (!this.viewButton) return;
      this.viewButton.disabled = isBusy;
      const label = this.viewButton.querySelector('span');
      if (label) label.textContent = isBusy ? 'جارٍ فتح الفاتورة…' : 'عرض الفاتورة';
    }

    closeViewer() {
      this.viewerSection?.classList.add('hidden');
      if (this.invoiceFrame) this.invoiceFrame.src = 'about:blank';
      this.viewerFallback?.classList.add('hidden');
      this.viewButton?.focus();
    }

    openInvoice() {
      if (!this.invoiceData?.url) return;
      window.open(this.invoiceData.url, '_blank', 'noopener,noreferrer');
    }

    visitWebsite() {
      if (!this.config?.OFFICIAL_WEBSITE) return;
      window.open(this.config.OFFICIAL_WEBSITE, '_blank', 'noopener,noreferrer');
    }

    showError(message) {
      this.loading?.classList.add('hidden');
      this.invoiceContainer?.classList.add('hidden');
      this.viewerSection?.classList.add('hidden');
      if (this.invoiceFrame) this.invoiceFrame.src = 'about:blank';
      if (this.errorMessage) this.errorMessage.textContent = message;
      this.errorContainer?.classList.remove('hidden');
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.customerPortal = new CustomerPortal();
  });
})();
