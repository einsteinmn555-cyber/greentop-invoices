// Admin Dashboard - Invoice Management

class AdminDashboard {
  constructor() {
    this.config = null;
    this.supabase = null;
    this.user = null;
    this.invoices = [];
    this.currentView = 'dashboard';
    this.init();
  }

  async init() {
    try {
      if (!window.GREENTOP_CONFIG) {
        throw new Error('Configuration not loaded. Please check config.js');
      }

      this.config = window.GREENTOP_CONFIG;

      const { createClient } = window.supabase;
      this.supabase = createClient(
        this.config.SUPABASE_URL,
        this.config.SUPABASE_ANON_KEY
      );

      // Check URL for view parameter
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');

      if (view === 'login') {
        this.showLoginView();
      } else {
        await this.checkAuth();
      }
    } catch (error) {
      console.error('Admin init error:', error);
      this.showError('Initialization failed: ' + error.message);
    }
  }

  async checkAuth() {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();

      if (error || !session) {
        this.showLoginView();
        return;
      }

      this.user = session.user;
      this.showDashboardView();
      await this.loadInvoices();
      this.setupEventListeners();
    } catch (error) {
      console.error('Auth error:', error);
      this.showLoginView();
    }
  }

  showLoginView() {
    this.currentView = 'login';
    const content = document.getElementById('admin-content');
    const navbar = document.querySelector('.navbar');

    if (navbar) navbar.classList.add('hidden');
    if (content) {
      content.innerHTML = `
        <div class="login-container">
          <div class="login-box">
            <h1>🌿 Green Top Admin</h1>
            <h2>Invoice Management</h2>
            
            <form id="login-form">
              <div class="form-group">
                <label for="login-email">Email Address</label>
                <input type="email" id="login-email" required placeholder="info@greentaxikw.com">
              </div>

              <div class="form-group">
                <label for="login-password">Password</label>
                <input type="password" id="login-password" required placeholder="••••••••">
              </div>

              <button type="submit" class="btn btn-primary">Login</button>
            </form>

            <div id="login-error" class="alert alert-error" style="display: none; margin-top: 20px;"></div>
          </div>
        </div>
      `;

      document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
    }
  }

  showDashboardView() {
    this.currentView = 'dashboard';
    const navbar = document.querySelector('.navbar');
    const content = document.getElementById('admin-content');

    if (navbar) {
      navbar.classList.remove('hidden');
      document.getElementById('user-email').textContent = this.user.email;
      document.getElementById('user-info').style.display = 'block';
      document.getElementById('logout-btn').style.display = 'block';
    }

    if (content) {
      content.innerHTML = `
        <div class="section">
          <h2>📄 Upload Invoice</h2>
          <form id="upload-form">
            <div class="form-row">
              <div class="form-group">
                <label for="customer-name">Customer Name *</label>
                <input type="text" id="customer-name" required placeholder="John Doe">
              </div>
              <div class="form-group">
                <label for="customer-email">Customer Email *</label>
                <input type="email" id="customer-email" required placeholder="customer@example.com">
              </div>
            </div>

            <div class="form-group">
              <label for="invoice-number">Invoice Number *</label>
              <input type="text" id="invoice-number" required placeholder="INV-2024-001">
            </div>

            <div class="form-group">
              <label for="invoice-file">PDF Invoice File *</label>
              <input type="file" id="invoice-file" accept=".pdf" required>
            </div>

            <button type="submit" class="btn btn-primary">Upload Invoice</button>
          </form>
        </div>

        <div class="section">
          <h2>📋 Invoices</h2>
          <table id="invoices-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="5" style="text-align: center; padding: 40px;">
                  <div class="spinner"></div>
                  <p>Loading invoices...</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }
  }

  async handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');

    try {
      const { error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
        return;
      }

      // Redirect to dashboard
      window.location.href = '/admin.html';
    } catch (error) {
      errorDiv.textContent = 'Login failed: ' + error.message;
      errorDiv.style.display = 'block';
    }
  }

  async loadInvoices() {
    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.invoices = data || [];
      this.displayInvoices();
    } catch (error) {
      console.error('Load invoices error:', error);
      this.showAlert('Failed to load invoices: ' + error.message, 'error');
    }
  }

  displayInvoices() {
    const tbody = document.querySelector('#invoices-table tbody');
    if (!tbody) return;

    if (this.invoices.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 40px; color: #999;">
            No invoices uploaded yet. Upload your first invoice above.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.invoices.map(invoice => `
      <tr>
        <td>#${invoice.invoice_number}</td>
        <td>${invoice.customer_name}</td>
        <td>${invoice.customer_email}</td>
        <td>
          <span class="status-badge ${invoice.is_enabled ? 'enabled' : 'disabled'}">
            ${invoice.is_enabled ? '✓ Active' : '✗ Disabled'}
          </span>
        </td>
        <td>
          <button onclick="adminDashboard.copyLink('${invoice.secure_token}')" class="btn-small" title="Copy link">📋 Copy Link</button>
          <button onclick="adminDashboard.generateQR('${invoice.secure_token}', '${invoice.invoice_number}')" class="btn-small" title="Generate QR">QR Code</button>
          <button onclick="adminDashboard.toggleInvoice('${invoice.id}', ${invoice.is_enabled})" class="btn-small">${invoice.is_enabled ? 'Disable' : 'Enable'}</button>
          <button onclick="adminDashboard.deleteInvoice('${invoice.id}')" class="btn-small btn-danger">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  setupEventListeners() {
    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
      uploadForm.addEventListener('submit', (e) => this.handleUpload(e));
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }

  async handleUpload(e) {
    e.preventDefault();

    const fileInput = document.getElementById('invoice-file');
    const nameInput = document.getElementById('customer-name');
    const emailInput = document.getElementById('customer-email');
    const numberInput = document.getElementById('invoice-number');

    if (!fileInput.files[0]) {
      this.showAlert('Please select a PDF file', 'error');
      return;
    }

    try {
      const file = fileInput.files[0];
      const timestamp = Date.now();
      const filename = `${timestamp}-${file.name}`;

      // Upload file to storage
      const { data, error: uploadError } = await this.supabase.storage
        .from('invoices')
        .upload(filename, file);

      if (uploadError) throw uploadError;

      // Generate secure token
      const secureToken = this.generateSecureToken();

      // Save invoice record
      const { error: dbError } = await this.supabase
        .from('invoices')
        .insert([
          {
            customer_name: nameInput.value,
            customer_email: emailInput.value,
            invoice_number: numberInput.value,
            file_path: filename,
            secure_token: secureToken,
            is_enabled: true,
          },
        ]);

      if (dbError) throw dbError;

      this.showAlert('Invoice uploaded successfully!', 'success');
      e.target.reset();
      await this.loadInvoices();

      // Show customer link
      const customerLink = `${window.location.origin}/?token=${secureToken}`;
      this.showLinkModal(customerLink, secureToken, numberInput.value);
    } catch (error) {
      console.error('Upload error:', error);
      this.showAlert(`Upload failed: ${error.message}`, 'error');
    }
  }

  copyLink(token) {
    const link = `${window.location.origin}/?token=${token}`;
    navigator.clipboard.writeText(link).then(() => {
      this.showAlert('Link copied to clipboard!', 'success');
    }).catch(err => {
      console.error('Copy error:', err);
      this.showAlert('Failed to copy link', 'error');
    });
  }

  async generateQR(token, invoiceNumber) {
    try {
      const link = `${window.location.origin}/?token=${token}`;

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
          <h2>QR Code - Invoice #${invoiceNumber}</h2>
          <div id="qrcode" style="text-align: center; padding: 30px; background: #f9f9f9; border-radius: 8px; margin: 20px 0;"></div>
          <p style="text-align: center; word-break: break-all; font-size: 12px; color: #666; margin-bottom: 20px;">${link}</p>
          <button onclick="this.parentElement.parentElement.remove()" class="btn btn-primary">Close</button>
        </div>
      `;
      document.body.appendChild(modal);

      if (typeof QRCode !== 'undefined') {
        new QRCode(document.getElementById('qrcode'), {
          text: link,
          width: 256,
          height: 256,
          colorDark: '#2d5016',
          colorLight: '#ffffff',
        });
      }
    } catch (error) {
      console.error('QR error:', error);
      this.showAlert('Failed to generate QR code', 'error');
    }
  }

  showLinkModal(link, token, invoiceNumber) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
        <h2>Invoice #${invoiceNumber}</h2>
        <h3>Customer Access Link</h3>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0; word-break: break-all;">
          <code style="font-size: 12px;">${link}</code>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <button onclick="navigator.clipboard.writeText('${link}').then(() => alert('Copied!')).catch(() => alert('Failed to copy'))" class="btn">📋 Copy</button>
          <button onclick="window.open('${link}', '_blank')" class="btn">👁️ Preview</button>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="btn btn-primary" style="margin-top: 10px;">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async toggleInvoice(id, isCurrentlyEnabled) {
    try {
      const { error } = await this.supabase
        .from('invoices')
        .update({ is_enabled: !isCurrentlyEnabled })
        .eq('id', id);

      if (error) throw error;

      this.showAlert(
        `Invoice ${isCurrentlyEnabled ? 'disabled' : 'enabled'} successfully`,
        'success'
      );
      await this.loadInvoices();
    } catch (error) {
      console.error('Toggle error:', error);
      this.showAlert('Failed to update invoice', 'error');
    }
  }

  async deleteInvoice(id) {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;

    try {
      const invoice = this.invoices.find(inv => inv.id === id);

      if (invoice) {
        // Delete from storage
        await this.supabase.storage
          .from('invoices')
          .remove([invoice.file_path]);
      }

      // Delete database record
      const { error } = await this.supabase
        .from('invoices')
        .delete()
        .eq('id', id);

      if (error) throw error;

      this.showAlert('Invoice deleted successfully', 'success');
      await this.loadInvoices();
    } catch (error) {
      console.error('Delete error:', error);
      this.showAlert('Failed to delete invoice', 'error');
    }
  }

  generateSecureToken() {
    // Generate 256-bit secure random token
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async logout() {
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;
      window.location.href = '/admin.html?view=login';
    } catch (error) {
      console.error('Logout error:', error);
      this.showAlert('Logout failed', 'error');
    }
  }

  showAlert(message, type = 'info') {
    const alerts = document.querySelector('.alerts-container') || (() => {
      const container = document.createElement('div');
      container.className = 'alerts-container';
      container.style.cssText = 'position: fixed; top: 80px; right: 20px; z-index: 999; max-width: 400px;';
      document.body.appendChild(container);
      return container;
    })();

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; cursor: pointer; font-size: 18px; color: inherit;">&times;</button>
      </div>
    `;
    alerts.appendChild(alert);

    setTimeout(() => alert.remove(), 5000);
  }

  showError(message) {
    this.showAlert(message, 'error');
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  window.adminDashboard = new AdminDashboard();
});
