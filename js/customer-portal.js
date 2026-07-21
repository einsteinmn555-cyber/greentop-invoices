// Green Top Invoice Portal - Customer Portal
// Secure invoice viewer using Edge Function for all data access

class CustomerPortal {
  constructor() {
    this.config = null;
    this.token = null;
    this.init();
  }

  async init() {
    try {
      // Load configuration
      if (!window.GREENTOP_CONFIG) {
        throw new Error('Configuration not loaded. Please check config.js');
      }

      this.config = window.GREENTOP_CONFIG;

      // Get token from URL
      const params = new URLSearchParams(window.location.search);
      this.token = params.get('token');

      if (!this.token) {
        this.showError('No invoice token provided. Please check your link.');
        return;
      }

      // Validate token format (should be 64-character hex string)
      if (!/^[a-f0-9]{64}$/.test(this.token)) {
        this.showError('Invalid token format. Please check your link.');
        return;
      }

      // Call Edge Function to validate token and get signed URL
      await this.validateAndPrepareInvoice();
    } catch (error) {
      console.error('Initialization error:', error);
      this.showError('Failed to initialize. Please try again.');
    }
  }

  async validateAndPrepareInvoice() {
    try {
      const loading = document.getElementById('loading');
      if (loading) loading.style.display = 'block';

      // Call Edge Function with secure token
      // Edge Function handles all validation and creates signed URL
      const response = await fetch(this.config.INVOICE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: this.token,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.url) {
        throw new Error('No download URL returned from server');
      }

      // Store signed URL for download
      this.invoiceData = data;
      this.displayInvoice();
    } catch (error) {
      console.error('Invoice validation error:', error);
      this.showError('Invoice not found or has been disabled. Please contact support.');
    }
  }

  displayInvoice() {
    const loading = document.getElementById('loading');
    const container = document.getElementById('invoice-container');
    const error = document.getElementById('invoice-error');

    if (loading) loading.classList.add('hidden');
    if (error) error.classList.add('hidden');
    if (container) container.classList.remove('hidden');
  }

  async downloadInvoice() {
    try {
      if (!this.invoiceData || !this.invoiceData.url) {
        throw new Error('Invoice data not available');
      }

      // Download using the signed URL
      const a = document.createElement('a');
      a.href = this.invoiceData.url;
      a.download = `invoice-${this.invoiceData.invoice_number || 'document'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download invoice. Please try again.');
    }
  }

  visitWebsite() {
    window.open(this.config.OFFICIAL_WEBSITE, '_blank');
  }

  showError(message) {
    const loading = document.getElementById('loading');
    const error = document.getElementById('invoice-error');
    const container = document.getElementById('invoice-container');

    if (loading) loading.classList.add('hidden');
    if (container) container.classList.add('hidden');

    if (error) {
      error.innerHTML = `
        <div class="error-message">
          <h2>⚠️ Unable to Load Invoice</h2>
          <p>${message}</p>
          <p style="margin-top: 20px; font-size: 12px; color: #999;">
            If you believe this is an error, please contact Green Top support at info@greentaxikw.com
          </p>
        </div>
      `;
      error.classList.remove('hidden');
    }
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  window.customerPortal = new CustomerPortal();
});
