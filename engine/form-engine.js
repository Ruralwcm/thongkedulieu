/**
 * RuralForms — Form Engine
 * Reads config.json, renders form UI, validates, and submits via hidden iframe
 */

'use strict';

const FormEngine = {

  config: null,
  values: {},
  files: {},  // fieldId -> array of {file, dataUrl, sizeKb}
  storesData: null,

  STORESLIST_URL: 'https://docs.google.com/spreadsheets/d/1fMmEm1GC9aei_3oeu2vcadPVsUM9ms9eVhm99d7pF8A/gviz/tq?tqx=out:json&gid=900581387&tq=',
  STORESLIST_QUERY: "select A,B,H,I where C='Đang hoạt động' and E='Miền Bắc' order by I,H",

  GDV_LIST: [
    'Nguyễn Duy Đoàn','Lê Thị Hồng Thu','Phạm Minh Thu',
    'Tạ Công Nhận','Tạ Quốc Huy','Đặng Văn Dũng',
    'Hồ Nam','Nguyễn Mạnh Sơn'
  ],

  async init(configUrl) {
    this.showLoading(true);
    try {
      const res = await fetch(configUrl);
      if (!res.ok) throw new Error('Cannot load form config');
      this.config = await res.json();

      if (!this.config.enabled) {
        this.showDisabled();
        return;
      }

      // Prefetch storeslist if needed
      const needsStores = this.config.fields.some(f =>
        f.source && f.source.startsWith('storeslist'));
      if (needsStores) await this.loadStoresData();

      this.renderForm();
      this.showLoading(false);
    } catch (e) {
      console.error(e);
      this.showError('Không thể tải cấu hình form. Vui lòng thử lại.');
    }
  },

  async loadStoresData() {
    try {
      const q = encodeURIComponent(this.STORESLIST_QUERY);
      const url = this.STORESLIST_URL + q;
      const res = await fetch(url);
      const text = await res.text();
      // Google viz response: /*O_o*/\ngoogle.visualization.Query.setResponse({...})
      const json = JSON.parse(text.replace(/^.*?\(/, '').replace(/\)\s*$/, ''));
      const rows = json.table.rows;
      // Columns: A=maSAP, B=tenCH, H=QLKV, I=GDV
      this.storesData = rows.map(r => ({
        maSAP: r.c[0]?.v || '',
        tenCH: r.c[1]?.v || '',
        qlkv: r.c[2]?.v || '',
        gdv: r.c[3]?.v || ''
      }));
    } catch(e) {
      console.warn('Storeslist load failed, using fallback', e);
      this.storesData = [];
    }
  },

  getGDVList() {
    if (!this.storesData) return this.GDV_LIST;
    const set = new Set(this.storesData.map(r => r.gdv).filter(Boolean));
    // Keep order from GDV_LIST, add any extras
    const ordered = this.GDV_LIST.filter(g => set.has(g));
    set.forEach(g => { if (!ordered.includes(g)) ordered.push(g); });
    return ordered;
  },

  getQLKVList(gdv) {
    if (!this.storesData || !gdv) return [];
    const set = new Set(
      this.storesData.filter(r => r.gdv === gdv).map(r => r.qlkv).filter(Boolean)
    );
    return Array.from(set).sort();
  },

  getCHList(qlkv) {
    if (!this.storesData || !qlkv) return [];
    return this.storesData
      .filter(r => r.qlkv === qlkv)
      .map(r => ({ value: r.maSAP, label: `${r.maSAP} - ${r.tenCH}` }));
  },

  renderForm() {
    const cfg = this.config;
    document.title = cfg.title;

    const headerEl = document.getElementById('form-header');
    if (headerEl) {
      headerEl.querySelector('.form-title').textContent = cfg.title;
      headerEl.querySelector('.form-subtitle').textContent = cfg.subtitle || '';
    }

    const container = document.getElementById('form-fields');
    if (!container) return;
    container.innerHTML = '';

    for (const field of cfg.fields) {
      const el = this.renderField(field);
      if (el) container.appendChild(el);
    }

    // Submit handler
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleSubmit());
    }
  },

  renderField(field) {
    if (field.type === 'section') {
      const div = document.createElement('div');
      div.className = 'section-title';
      div.innerHTML = `<h3 style="color:var(--primary);font-size:1rem;margin:20px 0 4px;border-bottom:2px solid var(--primary-light);padding-bottom:6px">${field.label}</h3>`;
      return div;
    }

    const wrap = document.createElement('div');
    wrap.className = 'field-group';
    wrap.id = `field-wrap-${field.id}`;

    const label = document.createElement('label');
    label.className = 'field-label';
    label.htmlFor = `field-${field.id}`;
    label.innerHTML = field.label + (field.required ? '<span class="required-star">*</span>' : '');

    const inputEl = this.buildInput(field);
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error';
    errorEl.id = `error-${field.id}`;
    const warnEl = document.createElement('div');
    warnEl.className = 'field-warn';
    warnEl.id = `warn-${field.id}`;

    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    if (field.hint) {
      const hint = document.createElement('div');
      hint.className = 'field-hint';
      hint.textContent = field.hint;
      wrap.appendChild(hint);
    }
    wrap.appendChild(errorEl);
    wrap.appendChild(warnEl);

    return wrap;
  },

  buildInput(field) {
    switch (field.type) {
      case 'text':       return this.buildText(field);
      case 'textarea':   return this.buildTextarea(field);
      case 'number':     return this.buildNumber(field);
      case 'dropdown':   return this.buildDropdown(field);
      case 'date':       return this.buildDate(field);
      case 'phone':      return this.buildPhone(field);
      case 'email':      return this.buildEmailInput(field);
      case 'image':      return this.buildImageUpload(field);
      default:           return this.buildText(field);
    }
  },

  buildText(field) {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `field-${field.id}`;
    input.name = field.id;
    input.placeholder = field.placeholder || '';
    this.attachChangeListener(input, field);
    return input;
  },

  buildTextarea(field) {
    const ta = document.createElement('textarea');
    ta.id = `field-${field.id}`;
    ta.name = field.id;
    ta.placeholder = field.placeholder || '';
    if (field.validate?.max_length) ta.maxLength = field.validate.max_length;
    this.attachChangeListener(ta, field);
    return ta;
  },

  buildNumber(field) {
    const wrap = document.createElement('div');
    wrap.className = 'input-unit-wrap';
    const input = document.createElement('input');
    input.type = 'number';
    input.id = `field-${field.id}`;
    input.name = field.id;
    input.placeholder = '0';
    if (field.validate) {
      if (field.validate.min !== undefined) input.min = field.validate.min;
      if (field.validate.max !== undefined) input.max = field.validate.max;
    }
    this.attachChangeListener(input, field);
    wrap.appendChild(input);
    if (field.unit) {
      const badge = document.createElement('div');
      badge.className = 'input-unit-badge';
      badge.textContent = field.unit;
      wrap.appendChild(badge);
    }
    return wrap;
  },

  buildDropdown(field) {
    const select = document.createElement('select');
    select.id = `field-${field.id}`;
    select.name = field.id;

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = `— Chọn ${field.label} —`;
    select.appendChild(defaultOpt);

    if (field.source === 'storeslist_gdv') {
      this.getGDVList().forEach(g => {
        const opt = document.createElement('option');
        opt.value = g; opt.textContent = g;
        select.appendChild(opt);
      });
    } else if (field.source === 'storeslist_qlkv') {
      select.disabled = true;
    } else if (field.source === 'storeslist_ch') {
      select.disabled = true;
    } else if (Array.isArray(field.options)) {
      field.options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = typeof o === 'object' ? o.value : o;
        opt.textContent = typeof o === 'object' ? o.label : o;
        select.appendChild(opt);
      });
    }

    // Cascade logic
    select.addEventListener('change', () => {
      this.values[field.id] = select.value;
      this.clearFieldError(field.id);

      // If this is GDV, update QLKV
      if (field.source === 'storeslist_gdv') {
        const qlkvField = this.config.fields.find(f => f.source === 'storeslist_qlkv');
        if (qlkvField) this.updateCascadeDropdown(qlkvField, this.getQLKVList(select.value), 'text');
        const chField = this.config.fields.find(f => f.source === 'storeslist_ch');
        if (chField) this.updateCascadeDropdown(chField, [], 'object');
      }
      // If this is QLKV, update CH
      if (field.source === 'storeslist_qlkv') {
        const chField = this.config.fields.find(f => f.source === 'storeslist_ch');
        if (chField) this.updateCascadeDropdown(chField, this.getCHList(select.value), 'object');
      }

      // Live validate
      if (select.value) {
        const result = Validator.validate(field, select.value);
        this.showFieldResult(field, result);
      }
    });

    return select;
  },

  updateCascadeDropdown(field, items, itemType) {
    const select = document.getElementById(`field-${field.id}`);
    if (!select) return;
    select.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = items.length ? `— Chọn ${field.label} —` : `— Chọn GĐV trước —`;
    select.appendChild(def);
    items.forEach(item => {
      const opt = document.createElement('option');
      if (itemType === 'object') {
        opt.value = item.value; opt.textContent = item.label;
      } else {
        opt.value = item; opt.textContent = item;
      }
      select.appendChild(opt);
    });
    select.disabled = items.length === 0;
    this.values[field.id] = '';
    this.clearFieldError(field.id);
  },

  buildDate(field) {
    const input = document.createElement('input');
    input.type = 'date';
    input.id = `field-${field.id}`;
    input.name = field.id;
    const v = field.validate || {};
    if (v.no_past) {
      const today = new Date().toISOString().split('T')[0];
      input.min = today;
    }
    if (v.no_future) {
      const today = new Date().toISOString().split('T')[0];
      input.max = today;
    }
    if (v.min) input.min = v.min;
    if (v.max) input.max = v.max;
    this.attachChangeListener(input, field);
    return input;
  },

  buildPhone(field) {
    const input = document.createElement('input');
    input.type = 'tel';
    input.id = `field-${field.id}`;
    input.name = field.id;
    input.placeholder = '09x / 08x / 03x / 07x';
    input.maxLength = 11;
    this.attachChangeListener(input, field);
    return input;
  },

  buildEmailInput(field) {
    const input = document.createElement('input');
    input.type = 'email';
    input.id = `field-${field.id}`;
    input.name = field.id;
    input.placeholder = 'example@domain.com';
    this.attachChangeListener(input, field);
    return input;
  },

  buildImageUpload(field) {
    const v = field.validate || {};
    const maxFiles = v.max_files || 5;
    const maxKb = v.max_kb || 500;

    const wrap = document.createElement('div');

    const uploadArea = document.createElement('div');
    uploadArea.className = 'image-upload-area';
    uploadArea.innerHTML = `
      <span class="upload-icon">📷</span>
      <div class="upload-text">
        <strong>Chọn ảnh</strong> hoặc kéo thả vào đây<br>
        <span class="text-xs text-muted">Tối đa ${maxFiles} ảnh · ${maxKb}KB mỗi ảnh${v.auto_resize ? ' (tự động nén)' : ''}</span>
      </div>
    `;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = `field-${field.id}`;
    fileInput.name = field.id;
    fileInput.accept = field.validate?.accept || 'image/*';
    fileInput.multiple = maxFiles > 1;
    fileInput.setAttribute('aria-label', field.label);

    const preview = document.createElement('div');
    preview.className = 'image-preview-grid';
    preview.id = `preview-${field.id}`;

    this.files[field.id] = [];

    fileInput.addEventListener('change', (e) => {
      this.handleFileSelect(field, e.target.files, preview);
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault(); uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault(); uploadArea.classList.remove('dragover');
      this.handleFileSelect(field, e.dataTransfer.files, preview);
    });

    uploadArea.appendChild(fileInput);
    wrap.appendChild(uploadArea);
    wrap.appendChild(preview);
    return wrap;
  },

  async handleFileSelect(field, fileList, previewEl) {
    const v = field.validate || {};
    const maxKb = v.max_kb || 500;
    const maxFiles = v.max_files || 5;

    const existing = this.files[field.id] || [];
    const newFiles = Array.from(fileList);
    const available = maxFiles - existing.length;

    if (available <= 0) {
      this.showFieldError(field.id, `Đã đủ ${maxFiles} ảnh`);
      return;
    }

    const toProcess = newFiles.slice(0, available);
    for (const file of toProcess) {
      let processed = file;
      let sizeKb = file.size / 1024;

      // Auto resize if needed
      if (v.auto_resize && sizeKb > maxKb) {
        processed = await this.resizeImage(file, maxKb);
        sizeKb = processed.size / 1024;
      }

      if (sizeKb > maxKb * 1.1) {
        this.showFieldWarn(field.id, `Ảnh "${file.name}" (${Math.round(sizeKb)}KB) vượt quá ${maxKb}KB`);
        continue;
      }

      const dataUrl = await this.fileToDataUrl(processed);
      this.files[field.id].push({ file: processed, dataUrl, sizeKb: Math.round(sizeKb), name: file.name });
    }

    this.values[field.id] = this.files[field.id];
    this.renderImagePreviews(field, previewEl);

    const result = Validator.validate(field, this.files[field.id]);
    this.showFieldResult(field, result);
  },

  renderImagePreviews(field, previewEl) {
    previewEl.innerHTML = '';
    (this.files[field.id] || []).forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'preview-item';
      const img = document.createElement('img');
      img.src = item.dataUrl;
      img.alt = item.name;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'preview-remove';
      removeBtn.innerHTML = '✕';
      removeBtn.onclick = (e) => {
        e.preventDefault();
        this.files[field.id].splice(idx, 1);
        this.values[field.id] = this.files[field.id];
        this.renderImagePreviews(field, previewEl);
        const result = Validator.validate(field, this.files[field.id]);
        this.showFieldResult(field, result);
      };
      const sizeEl = document.createElement('div');
      sizeEl.className = 'preview-size';
      sizeEl.textContent = `${item.sizeKb}KB`;
      div.append(img, removeBtn, sizeEl);
      previewEl.appendChild(div);
    });
  },

  async resizeImage(file, maxKb) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let quality = 0.85;
          let scale = 1;
          const targetBytes = maxKb * 1024;

          // Scale down if very large
          if (file.size > targetBytes * 3) {
            scale = Math.sqrt(targetBytes / file.size) * 1.2;
          }
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(blob => {
            resolve(blob || file);
          }, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  fileToDataUrl(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  },

  attachChangeListener(input, field) {
    const handler = () => {
      this.values[field.id] = input.value;
      if (input.value !== '') {
        const result = Validator.validate(field, input.value);
        this.showFieldResult(field, result);
      } else {
        this.clearFieldError(field.id);
      }
    };
    input.addEventListener('change', handler);
    input.addEventListener('input', () => {
      if (input.value !== '') this.clearFieldError(field.id);
    });
  },

  showFieldResult(field, result) {
    const errEl = document.getElementById(`error-${field.id}`);
    const warnEl = document.getElementById(`warn-${field.id}`);
    const inputEl = document.getElementById(`field-${field.id}`);
    if (errEl) {
      errEl.textContent = result.error || '';
      errEl.classList.toggle('show', !!result.error);
    }
    if (warnEl) {
      warnEl.textContent = result.warn || '';
      warnEl.classList.toggle('show', !!result.warn);
    }
    if (inputEl) {
      inputEl.classList.toggle('error', !!result.error);
      inputEl.classList.toggle('warn', !result.error && !!result.warn);
    }
  },

  showFieldError(fieldId, msg) {
    const errEl = document.getElementById(`error-${fieldId}`);
    if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
  },

  showFieldWarn(fieldId, msg) {
    const warnEl = document.getElementById(`warn-${fieldId}`);
    if (warnEl) { warnEl.textContent = msg; warnEl.classList.add('show'); }
  },

  clearFieldError(fieldId) {
    const errEl = document.getElementById(`error-${fieldId}`);
    const warnEl = document.getElementById(`warn-${fieldId}`);
    const inputEl = document.getElementById(`field-${fieldId}`);
    if (errEl) { errEl.textContent = ''; errEl.classList.remove('show'); }
    if (warnEl) { warnEl.textContent = ''; warnEl.classList.remove('show'); }
    if (inputEl) { inputEl.classList.remove('error', 'warn'); }
  },

  async handleSubmit() {
    // Validate all fields
    const { valid, errors } = Validator.validateForm(this.config, this.values);

    if (!valid) {
      // Show all errors
      for (const field of this.config.fields) {
        if (errors[field.id]) {
          this.showFieldError(field.id, errors[field.id]);
          // Scroll to first error
          const el = document.getElementById(`field-wrap-${field.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
      this.showToast('Vui lòng kiểm tra lại thông tin', 'error');
      return;
    }

    // Show loading
    const submitBtn = document.getElementById('submit-btn');
    const originalHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Đang gửi...';

    try {
      await this.submitForm();
      this.showSuccess();
    } catch(e) {
      console.error(e);
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
      this.showToast('Gửi thất bại. Vui lòng thử lại!', 'error');
    }
  },

  async submitForm() {
    const payload = this.buildPayload();
    const webhook = this.config.webhook;

    return new Promise((resolve, reject) => {
      // Use hidden iframe to avoid CORS issues
      const iframe = document.createElement('iframe');
      iframe.name = 'submit-frame-' + Date.now();
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = webhook;
      form.target = iframe.name;
      form.style.display = 'none';

      // Add JSON payload as hidden field
      const dataField = document.createElement('input');
      dataField.type = 'hidden';
      dataField.name = 'payload';
      dataField.value = JSON.stringify(payload);
      form.appendChild(dataField);

      // Also add individual fields for GAS compatibility
      for (const [key, val] of Object.entries(payload.fields)) {
        const field = document.createElement('input');
        field.type = 'hidden';
        field.name = key;
        field.value = typeof val === 'object' ? JSON.stringify(val) : String(val);
        form.appendChild(field);
      }

      document.body.appendChild(form);

      let done = false;
      iframe.onload = () => {
        if (done) return;
        done = true;
        setTimeout(() => {
          document.body.removeChild(iframe);
          document.body.removeChild(form);
        }, 1000);
        resolve();
      };

      // Fallback timeout
      setTimeout(() => {
        if (done) return;
        done = true;
        // Assume success after 8s (GAS doesn't always trigger onload)
        document.body.removeChild(iframe);
        document.body.removeChild(form);
        resolve();
      }, 8000);

      form.submit();
    });
  },

  buildPayload() {
    const fields = {};
    for (const fieldCfg of this.config.fields) {
      if (fieldCfg.type === 'section') continue;
      const val = this.values[fieldCfg.id];
      if (fieldCfg.type === 'image') {
        // Include image count and base64 data
        const imgs = this.files[fieldCfg.id] || [];
        fields[fieldCfg.id + '_count'] = imgs.length;
        imgs.forEach((img, i) => {
          fields[`${fieldCfg.id}_${i+1}`] = img.dataUrl;
          fields[`${fieldCfg.id}_${i+1}_name`] = img.name;
        });
      } else {
        fields[fieldCfg.id] = val !== undefined ? val : '';
      }
    }
    return {
      form_id: this.config.id,
      timestamp: new Date().toISOString(),
      fields
    };
  },

  showSuccess() {
    const formEl = document.getElementById('form-body');
    const successEl = document.getElementById('success-screen');
    if (formEl) formEl.style.display = 'none';
    if (successEl) successEl.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  showLoading(show) {
    const el = document.getElementById('loading-screen');
    if (el) el.style.display = show ? 'flex' : 'none';
    const body = document.getElementById('form-body');
    if (body) body.style.display = show ? 'none' : 'block';
  },

  showDisabled() {
    const body = document.getElementById('form-body');
    const loading = document.getElementById('loading-screen');
    if (loading) loading.style.display = 'none';
    if (body) body.innerHTML = `<div class="card"><div class="alert alert-warning">
      <strong>⚠️ Form tạm ngưng</strong><br>Form này hiện tạm thời không nhận dữ liệu. Vui lòng liên hệ quản trị viên.
    </div></div>`;
    if (body) body.style.display = 'block';
  },

  showError(msg) {
    const loading = document.getElementById('loading-screen');
    const body = document.getElementById('form-body');
    if (loading) loading.style.display = 'none';
    if (body) {
      body.innerHTML = `<div class="card"><div class="alert alert-error">❌ ${msg}</div></div>`;
      body.style.display = 'block';
    }
  },

  showToast(msg, type = '') {
    let toast = document.getElementById('rf-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rf-toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => toast.classList.remove('show'), 3500);
  }
};

// Make globally available
window.FormEngine = FormEngine;
