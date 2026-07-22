(() => {
  'use strict';

  class CustomerPortal {
    constructor() {
      this.config = null;
      this.token = null;
      this.shortCode = null;
      this.accessRequest = null;
      this.invoiceData = null;
      this.urlCreatedAt = 0;
      this.pdfLibraryPromise = null;
      this.pdfLoadingTask = null;
      this.pdfDocument = null;
      this.renderGeneration = 0;

      this.loading = document.getElementById('loading');
      this.invoiceContainer = document.getElementById('invoice-container');
      this.errorContainer = document.getElementById('invoice-error');
      this.errorMessage = document.getElementById('error-message');
      this.invoiceReference = document.getElementById('invoice-reference');
      this.viewerSection = document.getElementById('viewer-section');
      this.viewerLoading = document.getElementById('viewer-loading');
      this.viewerStatusText = document.getElementById('viewer-status-text');
      this.viewerError = document.getElementById('viewer-error');
      this.pdfPages = document.getElementById('pdf-pages');
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
        const shortPath = window.location.pathname.match(/^\/i\/([A-Za-z0-9_-]{16})\/?$/);
        this.shortCode = shortPath?.[1] || '';

        if (!this.token && !this.shortCode) {
          this.showError('افتح رابط الفاتورة الذي أرسلته لك جرين توب.');
          return;
        }

        const hasValidToken = /^[a-f0-9]{64}$/.test(this.token);
        const hasValidShortCode = /^[A-Za-z0-9_-]{16}$/.test(this.shortCode);
        if (!hasValidToken && !hasValidShortCode) {
          this.showError('رابط الفاتورة غير صحيح أو غير مكتمل.');
          return;
        }

        this.accessRequest = hasValidShortCode
          ? { code: this.shortCode }
          : { token: this.token };

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
          body: JSON.stringify(this.accessRequest),
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

        this.viewerSection.classList.remove('hidden');
        this.viewerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const generation = this.prepareViewer();
        await this.renderInvoicePdf(generation);
      } catch (error) {
        console.error('Invoice view failed:', error);
        this.showViewerError();
      } finally {
        this.setViewButtonBusy(false);
      }
    }

    prepareViewer() {
      const generation = this.cancelPdfRender();
      this.pdfPages?.replaceChildren();
      this.viewerError?.classList.add('hidden');
      this.viewerFallback?.classList.add('hidden');
      this.viewerLoading?.classList.remove('hidden');
      if (this.viewerStatusText) {
        this.viewerStatusText.textContent = 'جارٍ تجهيز الفاتورة للعرض…';
      }
      return generation;
    }

    async loadPdfLibrary() {
      if (!this.pdfLibraryPromise) {
        const assetBase = new URL('vendor/pdfjs/5.4.624/', `${window.location.origin}/`);
        const libraryUrl = new URL('pdf.min.mjs', assetBase);
        const workerUrl = new URL('pdf.worker.min.mjs', assetBase);

        this.pdfLibraryPromise = import(libraryUrl.href)
          .then((pdfjs) => {
            pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.href;
            return pdfjs;
          })
          .catch((error) => {
            this.pdfLibraryPromise = null;
            throw error;
          });
      }

      return this.pdfLibraryPromise;
    }

    async renderInvoicePdf(generation) {
      const pdfjs = await this.loadPdfLibrary();
      if (generation !== this.renderGeneration) return;

      const assetBase = new URL('vendor/pdfjs/5.4.624/', `${window.location.origin}/`);
      const loadingTask = pdfjs.getDocument({
        url: this.invoiceData.url,
        cMapUrl: new URL('cmaps/', assetBase).href,
        cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', assetBase).href,
        wasmUrl: new URL('wasm/', assetBase).href,
        isEvalSupported: false,
        withCredentials: false,
      });

      this.pdfLoadingTask = loadingTask;
      const pdfDocument = await loadingTask.promise;

      if (generation !== this.renderGeneration) {
        await loadingTask.destroy();
        return;
      }

      this.pdfDocument = pdfDocument;
      const totalPages = pdfDocument.numPages;

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        if (generation !== this.renderGeneration) return;

        if (this.viewerStatusText) {
          this.viewerStatusText.textContent = totalPages === 1
            ? 'جارٍ عرض الفاتورة…'
            : `جارٍ تجهيز الصفحة ${pageNumber} من ${totalPages}…`;
        }

        const page = await pdfDocument.getPage(pageNumber);
        if (generation !== this.renderGeneration) {
          page.cleanup();
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(260, (this.pdfPages?.clientWidth || 320) - 20);
        const viewport = page.getViewport({ scale: availableWidth / baseViewport.width });
        const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);

        const pageFigure = document.createElement('figure');
        pageFigure.className = 'pdf-page';

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `صفحة ${pageNumber} من ${totalPages}`);

        const canvasContext = canvas.getContext('2d', { alpha: false });
        if (!canvasContext) throw new Error('canvas_unavailable');

        pageFigure.appendChild(canvas);

        if (totalPages > 1) {
          const caption = document.createElement('figcaption');
          caption.textContent = `صفحة ${pageNumber} من ${totalPages}`;
          pageFigure.appendChild(caption);
        }

        this.pdfPages?.appendChild(pageFigure);

        await page.render({
          canvasContext,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
          viewport,
          background: '#ffffff',
        }).promise;

        page.cleanup();
      }

      if (generation !== this.renderGeneration) return;
      this.viewerLoading?.classList.add('hidden');
      this.viewerFallback?.classList.remove('hidden');
    }

    cancelPdfRender() {
      this.renderGeneration += 1;

      const loadingTask = this.pdfLoadingTask;
      const pdfDocument = this.pdfDocument;
      this.pdfLoadingTask = null;
      this.pdfDocument = null;

      const cleanup = loadingTask?.destroy() || pdfDocument?.destroy();
      if (cleanup?.catch) cleanup.catch(() => {});

      return this.renderGeneration;
    }

    showViewerError() {
      this.viewerLoading?.classList.add('hidden');
      this.viewerError?.classList.remove('hidden');
      this.viewerFallback?.classList.remove('hidden');
    }

    setViewButtonBusy(isBusy) {
      if (!this.viewButton) return;
      this.viewButton.disabled = isBusy;
      const label = this.viewButton.querySelector('span');
      if (label) label.textContent = isBusy ? 'جارٍ فتح الفاتورة…' : 'عرض الفاتورة';
    }

    closeViewer() {
      this.cancelPdfRender();
      this.viewerSection?.classList.add('hidden');
      this.pdfPages?.replaceChildren();
      this.viewerLoading?.classList.add('hidden');
      this.viewerError?.classList.add('hidden');
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
      this.cancelPdfRender();
      this.pdfPages?.replaceChildren();
      if (this.errorMessage) this.errorMessage.textContent = message;
      this.errorContainer?.classList.remove('hidden');
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.customerPortal = new CustomerPortal();
  });
})();
