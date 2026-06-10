/**
 * RuralForms — Validator Engine
 * Client-side validation for all field types
 */

const Validator = {

  /**
   * Validate a single field value against its config
   * @returns { valid: bool, error: string|null, warn: string|null }
   */
  validate(field, value) {
    const v = field.validate || {};
    const isEmpty = value === null || value === undefined || value === '';

    // --- Required ---
    if (field.required && isEmpty) {
      return { valid: false, error: `Vui lòng nhập ${field.label}`, warn: null };
    }
    if (isEmpty) return { valid: true, error: null, warn: null };

    switch (field.type) {

      case 'text':
        return this.validateText(value, v, field);

      case 'textarea':
        return this.validateTextarea(value, v, field);

      case 'number':
        return this.validateNumber(value, v, field);

      case 'dropdown':
        if (!value || value === '') return { valid: false, error: `Vui lòng chọn ${field.label}`, warn: null };
        return { valid: true, error: null, warn: null };

      case 'date':
        return this.validateDate(value, v, field);

      case 'phone':
        return this.validatePhone(value, v, field);

      case 'email':
        return this.validateEmail(value, v, field);

      case 'image':
        return this.validateImage(value, v, field);

      default:
        return { valid: true, error: null, warn: null };
    }
  },

  validateText(value, v, field) {
    if (v.min_length && value.length < v.min_length) {
      return { valid: false, error: `Tối thiểu ${v.min_length} ký tự`, warn: null };
    }
    if (v.max_length && value.length > v.max_length) {
      return { valid: false, error: `Tối đa ${v.max_length} ký tự`, warn: null };
    }
    if (v.regex) {
      const re = new RegExp(v.regex);
      if (!re.test(value)) {
        return { valid: false, error: v.regex_error || `Định dạng không hợp lệ`, warn: null };
      }
    }
    return { valid: true, error: null, warn: null };
  },

  validateTextarea(value, v, field) {
    return this.validateText(value, v, field);
  },

  validateNumber(value, v, field) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return { valid: false, error: `Vui lòng nhập số hợp lệ`, warn: null };
    }
    if (v.min !== undefined && num < v.min) {
      return { valid: false, error: `Giá trị tối thiểu là ${v.min}${field.unit ? ' ' + field.unit : ''}`, warn: null };
    }
    if (v.max !== undefined && num > v.max) {
      return { valid: false, error: `Giá trị tối đa là ${v.max}${field.unit ? ' ' + field.unit : ''}`, warn: null };
    }
    // Warnings (value valid but needs attention)
    if (v.warn_above !== undefined && num > v.warn_above) {
      return { valid: true, error: null, warn: `⚠️ Giá trị ${num} ${field.unit || ''} có vẻ lớn (>${v.warn_above}), hãy kiểm tra lại` };
    }
    if (v.warn_below !== undefined && num < v.warn_below) {
      return { valid: true, error: null, warn: `⚠️ Giá trị ${num} ${field.unit || ''} có vẻ nhỏ (<${v.warn_below}), hãy kiểm tra lại` };
    }
    return { valid: true, error: null, warn: null };
  },

  validateDate(value, v, field) {
    const d = new Date(value);
    if (isNaN(d.getTime())) {
      return { valid: false, error: `Ngày không hợp lệ`, warn: null };
    }
    const today = new Date(); today.setHours(0,0,0,0);
    if (v.no_past && d < today) {
      return { valid: false, error: `Không được chọn ngày trong quá khứ`, warn: null };
    }
    if (v.no_future && d > today) {
      return { valid: false, error: `Không được chọn ngày trong tương lai`, warn: null };
    }
    if (v.min) {
      const minD = new Date(v.min);
      if (d < minD) return { valid: false, error: `Ngày phải từ ${v.min} trở đi`, warn: null };
    }
    if (v.max) {
      const maxD = new Date(v.max);
      if (d > maxD) return { valid: false, error: `Ngày phải trước ${v.max}`, warn: null };
    }
    return { valid: true, error: null, warn: null };
  },

  validatePhone(value, v, field) {
    // Vietnamese phone: 09x/08x/03x/07x/05x, 10 digits
    const phoneRe = /^(0[35789][0-9]{8}|0[38][0-9]{8})$/;
    const cleaned = value.replace(/[\s\-\.]/g, '');
    if (!phoneRe.test(cleaned)) {
      return { valid: false, error: `Số điện thoại không hợp lệ (định dạng: 09x/08x/03x/07x/05x)`, warn: null };
    }
    return { valid: true, error: null, warn: null };
  },

  validateEmail(value, v, field) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(value)) {
      return { valid: false, error: `Email không hợp lệ`, warn: null };
    }
    if (v.domain_whitelist && v.domain_whitelist.length > 0) {
      const domain = value.split('@')[1].toLowerCase();
      if (!v.domain_whitelist.includes(domain)) {
        return { valid: false, error: `Email phải thuộc domain: ${v.domain_whitelist.join(', ')}`, warn: null };
      }
    }
    return { valid: true, error: null, warn: null };
  },

  validateImage(value, v, field) {
    // value = array of file objects with { file, dataUrl, sizeKb }
    if (!Array.isArray(value)) {
      return { valid: false, error: `Vui lòng chọn ảnh`, warn: null };
    }
    if (v.min_files && value.length < v.min_files) {
      return { valid: false, error: `Cần tối thiểu ${v.min_files} ảnh`, warn: null };
    }
    if (v.max_files && value.length > v.max_files) {
      return { valid: false, error: `Tối đa ${v.max_files} ảnh`, warn: null };
    }
    return { valid: true, error: null, warn: null };
  },

  /**
   * Validate entire form, return { valid: bool, errors: {fieldId: string} }
   */
  validateForm(config, values) {
    const errors = {};
    let valid = true;
    for (const field of config.fields) {
      if (field.type === 'section') continue;
      const val = values[field.id];
      const result = this.validate(field, val);
      if (!result.valid) {
        errors[field.id] = result.error;
        valid = false;
      }
    }
    return { valid, errors };
  }
};

if (typeof module !== 'undefined') module.exports = Validator;
