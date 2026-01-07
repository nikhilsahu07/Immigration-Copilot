const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-3-flash-preview',
  generationConfig: {
    temperature: 0.3,
    topP: 0.8,
    maxOutputTokens: 4096,
  },
});

let chromium;
app.commandLine.appendSwitch('remote-debugging-port', '9222');

let mainWindow;
let browserView;
let page = null;
let browser = null;
let currentFormMapping = null;
let customPrompt = '';
let targetURL = '';

// User data (in production, load from database)
const userData = {
  planType: 'Individual',
  name: 'John Doe',
  emailId: 'john.doe@example.com',
  insuranceCover: '5 Lakhs',
  dateOfBirth: '1990-05-15',
  gender: 'Male',
  pincode: '10001',
  countryCode: '+91',
  mobileNo: '9810375969',
  tenure: '1 Year',
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1800,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// START AI-POWERED AUTOMATION
ipcMain.handle('start-automation', async (event, { url, prompt }) => {
  try {
    console.log('🤖 Starting AI-powered automation...');
    console.log('🌐 Target URL:', url);
    console.log('📝 Custom Prompt:', prompt || 'None');

    targetURL = url;
    customPrompt = prompt || '';

    // Create BrowserView
    browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    mainWindow.setBrowserView(browserView);

    const bounds = mainWindow.getBounds();
    browserView.setBounds({
      x: 500,
      y: 0,
      width: bounds.width - 500,
      height: bounds.height,
    });

    mainWindow.on('resize', () => {
      if (browserView) {
        const newBounds = mainWindow.getBounds();
        browserView.setBounds({
          x: 500,
          y: 0,
          width: newBounds.width - 500,
          height: newBounds.height,
        });
      }
    });

    // Load target page
    sendStatus('Loading page...', 5);
    await browserView.webContents.loadURL(url);
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // Connect Playwright
    sendStatus('Connecting to browser...', 10);
    if (!chromium) {
      chromium = require('playwright-core').chromium;
    }

    browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const pages = context.pages();

    page = null;
    const urlDomain = new URL(url).hostname;
    for (const p of pages) {
      if (p.url().includes(urlDomain)) {
        page = p;
        break;
      }
    }

    if (!page) {
      throw new Error('Could not find target page');
    }

    await page.waitForLoadState('domcontentloaded');
    sendStatus('Page loaded successfully', 15);

    // Start AI processing
    await processPageWithAI();
  } catch (error) {
    console.error('Automation error:', error);
    sendStatus(`Error: ${error.message}`, 0);
  }
});

// AI PROCESSING FUNCTION
async function processPageWithAI() {
  try {
    sendStatus('🤖 AI analyzing form structure...', 20);

    // Extract comprehensive HTML structure
    const htmlStructure = await page.evaluate(() => {
      const forms = document.querySelectorAll('form, [class*="form"]');
      const form = forms[0] || document.body;

      const inputs = Array.from(
        form.querySelectorAll(
          'input, textarea, select, button[type="radio"], [role="radio"], [role="checkbox"]'
        )
      );

      const seen = new Set();
      const uniqueInputs = inputs.filter((el) => {
        const key = el.name || el.id || el.placeholder || el.className;
        if (!key || key === '' || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return {
        fields: uniqueInputs.map((el, idx) => {
          const tagName = el.tagName.toLowerCase();
          const type = el.type || 'text';

          let options = [];
          if (tagName === 'select') {
            options = Array.from(el.querySelectorAll('option')).map((opt) => ({
              value: opt.value,
              text: opt.textContent.trim(),
            }));
          }

          let radioGroup = null;
          let radioOptions = [];
          if (type === 'radio') {
            radioGroup = el.name;
            // Get all radio buttons in same group (if group exists)
            if (radioGroup && radioGroup !== '') {
              const radios = document.querySelectorAll(
                `input[type="radio"][name="${radioGroup}"]`
              );
              radioOptions = Array.from(radios).map((r) => ({
                value: r.value,
                label: getLabelText(r) || r.value,
              }));
            } else {
              // No group - use label as identifier
              radioOptions = [
                {
                  value: el.value,
                  label: getLabelText(el) || 'unknown',
                },
              ];
            }
          }

          // Generate unique selector with better strategy
          let uniqueSelector = '';
          if (el.id && el.id !== '') {
            uniqueSelector = `#${el.id}`;
          } else if (el.name && el.name !== '') {
            uniqueSelector = `[name="${el.name}"]`;
          } else if (el.placeholder && el.placeholder !== '') {
            uniqueSelector = `[placeholder="${el.placeholder}"]`;
          } else {
            // Last resort: use class and type
            const firstClass = el.className
              .split(' ')
              .filter((c) => c.trim() !== '')[0];
            if (firstClass) {
              uniqueSelector = `.${firstClass}[type="${type}"]`;
            } else {
              uniqueSelector = `${tagName}[type="${type}"]`;
            }
          }

          return {
            index: idx,
            tagName,
            type,
            name: el.name,
            id: el.id,
            placeholder: el.placeholder,
            value: el.value,
            required: el.required,
            className: el.className,
            ariaLabel: el.getAttribute('aria-label'),
            labelText: getLabelText(el),
            options: options.length > 0 ? options : null,
            radioGroup,
            radioOptions: radioOptions.length > 0 ? radioOptions : null,
            uniqueSelector,
            min: el.min,
            max: el.max,
            pattern: el.pattern,
          };
        }),
      };

      function getLabelText(element) {
        if (element.id) {
          const label = document.querySelector(`label[for="${element.id}"]`);
          if (label) return label.textContent.trim();
        }

        const parentLabel = element.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();

        const prevSibling = element.previousElementSibling;
        if (prevSibling && prevSibling.tagName === 'LABEL') {
          return prevSibling.textContent.trim();
        }

        // Check next sibling
        const nextSibling = element.nextElementSibling;
        if (
          nextSibling &&
          (nextSibling.tagName === 'LABEL' || nextSibling.textContent)
        ) {
          const text = nextSibling.textContent.trim();
          if (text.length < 50) return text;
        }

        const labelDiv = element.closest('[class*="label"]');
        if (labelDiv) {
          const text = labelDiv.textContent.trim();
          if (text.length < 100) return text;
        }

        const ariaLabelledBy = element.getAttribute('aria-labelledby');
        if (ariaLabelledBy) {
          const labelEl = document.getElementById(ariaLabelledBy);
          if (labelEl) return labelEl.textContent.trim();
        }

        return '';
      }
    });

    console.log('📋 Extracted form structure:', htmlStructure);
    console.log(`📊 Total unique fields: ${htmlStructure.fields.length}`);
    sendStatus('🤖 Sending to Gemini AI...', 30);

    // Generate AI prompt with custom instructions
    const basePrompt = `You are an expert form-filling AI assistant. Analyze this form and map user data to fields intelligently.

**User Data:**
${JSON.stringify(userData, null, 2)}

**Form Fields:**
${JSON.stringify(htmlStructure.fields, null, 2)}

${customPrompt ? `\n**Custom Instructions:**\n${customPrompt}\n` : ''}

**CRITICAL INSTRUCTIONS:**
1. Match each form field to the most appropriate user data
2. For SELECT/DROPDOWN: return the exact "value" attribute from options array
3. For RADIO: Use the fieldLabel to match user data (e.g., if user has "1 Year" and label is "1 Year", return that radio). The selector and value are less important than label matching.
4. For CHECKBOX: return "true" or "false"
5. For DATE: return in format YYYY-MM-DD
6. For TEXT/EMAIL/TEL: return the exact string
7. Use uniqueSelector field for the selector
8. For fields with no matching data, use empty string ""
9. You MUST return COMPLETE valid JSON with closing brackets
10. You MUST return COMPLETE valid JSON with closing brackets
11. **IMPORTANT**: Include the submitButton object at the end

**Return this EXACT JSON structure (MUST be complete):**
{
  "fields": [
    {
      "fieldIndex": 0,
      "fieldName": "name or id attribute",
      "fieldLabel": "human-readable label",
      "fieldType": "text|select|radio|checkbox|date|email|tel|textarea",
      "selector": "most reliable CSS selector (prefer #id, then [name=x], then .class)",
      "value": "the value to fill or select",
      "confidence": "high|medium|low",
      "reasoning": "brief explanation"
    }
  ],
  "submitButton": {
    "selector": "button[type='submit']",
    "text": "Submit"
  }
}

**Return ONLY complete valid JSON with all closing brackets. No explanations.**`;

    // Call Gemini API with increased token limit
    const result = await model.generateContent(basePrompt);
    const response = await result.response;
    let aiResponse = response.text();

    console.log('🤖 Raw Gemini Response:', aiResponse);

    // ROBUST JSON CLEANUP
    aiResponse = aiResponse
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // Find the first { and last }
    const firstBrace = aiResponse.indexOf('{');
    const lastBrace = aiResponse.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      aiResponse = aiResponse.substring(firstBrace, lastBrace + 1);
    }

    let formMapping;
    try {
      formMapping = JSON.parse(aiResponse);

      // Validate structure
      if (!formMapping.fields || !Array.isArray(formMapping.fields)) {
        throw new Error('Invalid response: missing fields array');
      }

      // Add default submitButton if missing
      if (!formMapping.submitButton) {
        formMapping.submitButton = {
          selector: "button[type='submit'], input[type='submit']",
          text: 'Submit',
        };
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      console.error('Parse error:', parseError.message);

      // Try to salvage partial JSON
      try {
        // Try to fix incomplete JSON by adding missing closing brackets
        let fixedResponse = aiResponse;

        // Count opening and closing braces
        const openBraces = (fixedResponse.match(/{/g) || []).length;
        const closeBraces = (fixedResponse.match(/}/g) || []).length;

        // Add missing closing braces
        if (openBraces > closeBraces) {
          const missing = openBraces - closeBraces;
          fixedResponse += '\n]'.repeat(
            Math.max(
              0,
              (fixedResponse.match(/\[/g) || []).length -
                (fixedResponse.match(/\]/g) || []).length
            )
          );
          fixedResponse += '\n}'.repeat(missing);
        }

        console.log('🔧 Attempting to fix JSON...');
        formMapping = JSON.parse(fixedResponse);

        if (!formMapping.submitButton) {
          formMapping.submitButton = {
            selector: "button[type='submit'], input[type='submit']",
            text: 'Submit',
          };
        }

        console.log('✅ JSON fixed successfully!');
      } catch (fixError) {
        throw new Error(
          'AI returned invalid JSON that could not be fixed. Please try again.'
        );
      }
    }

    sendStatus('✅ AI analysis complete', 40);
    console.log('🎯 Form Mapping:', formMapping);

    currentFormMapping = formMapping;

    // AUTO-FILL THE FORM FIRST
    await autoFillForm(formMapping);
  } catch (error) {
    console.error('AI processing error:', error);
    sendStatus(`AI Error: ${error.message}`, 0);
  }
}

// AUTO-FILL FORM (New Function - Fill First, Detect After)
async function autoFillForm(formMapping) {
  try {
    sendStatus('🤖 Auto-filling form...', 50);

    // FILL ALL FIELDS FIRST (no early detection)
    for (let i = 0; i < formMapping.fields.length; i++) {
      const field = formMapping.fields[i];

      if (!field.value || field.value === '') {
        console.log(`⏭️ Skipping empty field: ${field.fieldLabel}`);
        continue;
      }

      try {
        console.log(
          `📝 Filling: ${field.fieldLabel} (${field.fieldType}) = "${field.value}"`
        );

        // Scroll into view
        await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, field.selector);

        await page.waitForTimeout(300);

        // Handle different field types
        switch (field.fieldType) {
          case 'select':
          case 'dropdown':
            await fillSelect(field);
            break;

          case 'radio':
            await fillRadio(field);
            break;

          case 'checkbox':
            await fillCheckbox(field);
            break;

          case 'date':
            await fillDate(field);
            break;

          case 'text':
          case 'email':
          case 'tel':
          case 'textarea':
          case 'number':
          default:
            await fillTextInput(field);
            break;
        }

        const progress = 50 + Math.round((i / formMapping.fields.length) * 30);
        sendStatus(`✅ Filled: ${field.fieldLabel}`, progress);

        await page.waitForTimeout(600);
      } catch (fieldError) {
        console.error(
          `❌ Error filling ${field.fieldLabel}:`,
          fieldError.message
        );
        sendStatus(`⚠️ Skipped: ${field.fieldLabel}`, 0);
      }
    }

    // NOW CHECK FOR CAPTCHA/OTP (AFTER FILLING)
    sendStatus('🔍 Checking for CAPTCHA/OTP...', 85);
    await page.waitForTimeout(2000);

    const detection = await detectCaptchaOrOtp();

    if (detection.hasCaptcha) {
      console.log('⏸️ CAPTCHA detected after filling');
      sendStatus(detection.message, 85);
      sendCaptchaAlert(detection);
      return; // Pause here, wait for user
    }

    if (detection.hasOtp) {
      console.log('⏸️ OTP required after filling');
      sendStatus('📱 OTP required! Enter it manually', 85);
      sendOtpAlert(detection.otpDetails);
      return; // Pause here, wait for user
    }

    // NO CAPTCHA/OTP - Show preview for approval
    sendStatus('✅ Form auto-filled! Review & approve', 85);
    sendFormPreview(formMapping);
  } catch (error) {
    console.error('Auto-fill error:', error);
    sendStatus(`Auto-fill Error: ${error.message}`, 0);
  }
}

// DETECT CAPTCHA OR OTP (HTML Analysis)
async function detectCaptchaOrOtp() {
  try {
    const detection = await page.evaluate(() => {
      const result = {
        hasCaptcha: false,
        hasOtp: false,
        captchaType: null,
        otpDetails: null,
        shouldPause: false,
        message: '',
      };

      // 1. DETECT RECAPTCHA
      const recaptchaIframe = document.querySelector(
        'iframe[src*="google.com/recaptcha"]'
      );
      const recaptchaDiv = document.querySelector('.g-recaptcha, #g-recaptcha');
      if (recaptchaIframe || recaptchaDiv) {
        result.hasCaptcha = true;
        result.captchaType = 'reCAPTCHA';
        result.shouldPause = true;
        result.message = '🤖 reCAPTCHA detected! Please solve it manually.';
        return result;
      }

      // 2. DETECT HCAPTCHA
      const hcaptchaIframe = document.querySelector(
        'iframe[src*="hcaptcha.com"]'
      );
      const hcaptchaDiv = document.querySelector('.h-captcha');
      if (hcaptchaIframe || hcaptchaDiv) {
        result.hasCaptcha = true;
        result.captchaType = 'hCaptcha';
        result.shouldPause = true;
        result.message = '🤖 hCaptcha detected! Please solve it manually.';
        return result;
      }

      // 3. DETECT CLOUDFLARE TURNSTILE
      const turnstileDiv = document.querySelector(
        '.cf-turnstile, [data-sitekey]'
      );
      if (turnstileDiv) {
        result.hasCaptcha = true;
        result.captchaType = 'Cloudflare Turnstile';
        result.shouldPause = true;
        result.message = '🤖 Cloudflare CAPTCHA detected! Please solve it.';
        return result;
      }

      // 4. DETECT CUSTOM CAPTCHA (image-based)
      const captchaImages = document.querySelectorAll(
        'img[alt*="captcha" i], img[src*="captcha" i]'
      );
      if (captchaImages.length > 0) {
        result.hasCaptcha = true;
        result.captchaType = 'Custom Image CAPTCHA';
        result.shouldPause = true;
        result.message = '🤖 Image CAPTCHA detected! Please solve it.';
        return result;
      }

      // 5. DETECT OTP INPUT FIELDS
      const otpInputs = document.querySelectorAll(`
        input[name*="otp" i],
        input[id*="otp" i],
        input[placeholder*="otp" i],
        input[autocomplete="one-time-code"]
    `);

      if (otpInputs.length > 0) {
        const otpField = otpInputs[0];
        result.hasOtp = true;
        result.shouldPause = true;
        result.otpDetails = {
          selector: otpField.id
            ? `#${otpField.id}`
            : `[name="${otpField.name}"]`,
          placeholder: otpField.placeholder,
          maxLength: otpField.maxLength,
        };
        result.message = `📱 OTP field detected! Waiting for OTP...`;
        return result;
      }

      // 6. DETECT OTP TEXT IN PAGE
      const bodyText = document.body.innerText.toLowerCase();
      if (
        bodyText.includes('enter otp') ||
        bodyText.includes('verification code') ||
        bodyText.includes('enter the code') ||
        bodyText.includes('verify your')
      ) {
        result.hasOtp = true;
        result.shouldPause = true;
        result.message = 'OTP verification step detected!';
        return result;
      }

      return result;
    });

    return detection;
  } catch (error) {
    console.error('Detection error:', error);
    return { hasCaptcha: false, hasOtp: false, shouldPause: false };
  }
}

// FILL SELECT/DROPDOWN
async function fillSelect(field) {
  try {
    await page.waitForSelector(field.selector, {
      state: 'visible',
      timeout: 5000,
    });
    await page.selectOption(field.selector, field.value);
    console.log(`✅ Selected option: ${field.value}`);
  } catch (error) {
    // Try alternative method
    await page.evaluate(
      (selector, value) => {
        const select = document.querySelector(selector);
        if (select) {
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      field.selector,
      field.value
    );
  }
}
// FILL RADIO BUTTON (BULLETPROOF - JavaScript click)
async function fillRadio(field) {
  try {
    if (!field.value || field.value === '') {
      console.log('⏭️ Skipping radio - no value to select');
      return;
    }

    console.log(
      `🔘 Attempting to click radio: "${field.fieldLabel}" with selector: ${field.selector}`
    );

    // METHOD 1: Try by label text if available
    if (field.fieldLabel && field.fieldLabel.trim() !== '') {
      const clicked = await page.evaluate((labelText) => {
        // Find all labels
        const labels = Array.from(document.querySelectorAll('label'));
        const matchingLabel = labels.find(
          (label) =>
            label.textContent.trim() === labelText ||
            label.textContent.includes(labelText)
        );

        if (matchingLabel) {
          // Find associated radio button
          const forId = matchingLabel.getAttribute('for');
          let radio = null;

          if (forId) {
            radio = document.getElementById(forId);
          } else {
            // Radio might be inside the label
            radio = matchingLabel.querySelector('input[type="radio"]');
          }

          if (radio && radio.type === 'radio') {
            radio.checked = true;
            radio.click();
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            radio.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('Radio clicked via label:', labelText);
            return true;
          }
        }
        return false;
      }, field.fieldLabel);

      if (clicked) {
        console.log(`✅ Selected radio via label: ${field.fieldLabel}`);
        await page.waitForTimeout(500);
        return;
      }
    }

    // METHOD 2: Try by radioGroup and value
    if (field.radioGroup && field.radioGroup !== '') {
      const clicked = await page.evaluate(
        (group, value) => {
          const radios = document.querySelectorAll(
            `input[type="radio"][name="${group}"]`
          );
          for (const radio of radios) {
            if (radio.value === value) {
              radio.checked = true;
              radio.click();
              radio.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
          return false;
        },
        field.radioGroup,
        field.value
      );

      if (clicked) {
        console.log(
          `✅ Selected radio in group ${field.radioGroup}: ${field.value}`
        );
        await page.waitForTimeout(500);
        return;
      }
    }

    // METHOD 3: Try by selector (direct JavaScript click)
    const clicked = await page.evaluate((selector) => {
      // Try to find the element
      let radio = document.querySelector(selector);

      // If selector has :nth-of-type, try without it
      if (!radio && selector.includes(':nth-of-type')) {
        const baseSelector = selector.split(':nth-of-type')[0];
        const radios = document.querySelectorAll(baseSelector);
        if (radios.length > 0) {
          radio = radios[0]; // Use first one
        }
      }

      if (radio && radio.type === 'radio') {
        radio.checked = true;
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    }, field.selector);

    if (clicked) {
      console.log(`✅ Selected radio via selector: ${field.selector}`);
      await page.waitForTimeout(500);
    } else {
      console.log(`⚠️ Could not click radio button`);
    }
  } catch (error) {
    console.error('Radio button error:', error.message);
  }
}

// FILL CHECKBOX
async function fillCheckbox(field) {
  try {
    await page.waitForSelector(field.selector, {
      state: 'visible',
      timeout: 5000,
    });

    const shouldCheck =
      field.value === 'true' || field.value === true || field.value === '1';

    if (shouldCheck) {
      await page.check(field.selector);
      console.log(`✅ Checked checkbox`);
    } else {
      await page.uncheck(field.selector);
      console.log(`✅ Unchecked checkbox`);
    }
  } catch (error) {
    console.error('Checkbox error:', error);
  }
}

// FILL DATE INPUT
async function fillDate(field) {
  try {
    await page.waitForSelector(field.selector, {
      state: 'visible',
      timeout: 5000,
    });

    // Try HTML5 date input
    await page.fill(field.selector, field.value);

    console.log(`✅ Filled date: ${field.value}`);
  } catch (error) {
    // Try alternative date formats
    await page.evaluate(
      (selector, value) => {
        const input = document.querySelector(selector);
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      field.selector,
      field.value
    );
  }
}

// FILL TEXT INPUT (IMPROVED - handles duplicates)
async function fillTextInput(field) {
  try {
    // Use uniqueSelector if available
    const selector = field.uniqueSelector || field.selector;

    // Check if multiple elements match
    const count = await page.locator(selector).count();

    if (count > 1) {
      console.log(
        `⚠️ Multiple elements found (${count}), using first visible one`
      );
      // Use first visible element
      await page
        .locator(selector)
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
      await page.locator(selector).first().fill('');
      await page.waitForTimeout(200);
      await page.locator(selector).first().fill(field.value);
    } else {
      await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
      await page.fill(selector, '');
      await page.waitForTimeout(200);
      await page.fill(selector, field.value);
    }

    console.log(`✅ Filled text: ${field.value}`);
  } catch (error) {
    console.error('Text input error:', error.message);
  }
}

// Send form preview to renderer
function sendFormPreview(formMapping) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('form-preview', formMapping);
  }
}

// Resume automation after CAPTCHA is solved
ipcMain.handle('resume-after-captcha', async () => {
  console.log('✅ User solved CAPTCHA, resuming automation...');
  sendStatus('✅ CAPTCHA solved! Preparing to submit...', 90, true);

  try {
    // Wait a moment for CAPTCHA verification
    await page.waitForTimeout(2000);

    // Show submit button in UI
    if (currentFormMapping) {
      sendFormPreview(currentFormMapping);
      sendStatus('Ready to submit! Click Submit button', 90, true);
    }
  } catch (error) {
    console.error('Resume error:', error);
    sendStatus(`Error: ${error.message}`, 0);
  }
});

// Submit OTP code
ipcMain.handle('submit-otp', async (event, otpCode) => {
  console.log('📱 Submitting OTP:', otpCode);
  sendStatus('Filling OTP...', 80);

  try {
    // Find OTP field and fill it
    const otpFilled = await page.evaluate((code) => {
      const otpInputs = document.querySelectorAll(`
        input[name*="otp" i],
        input[id*="otp" i],
        input[placeholder*="otp" i],
        input[autocomplete="one-time-code"]  // HTML5 OTP field
    `);

      // Add filtering to exclude ZIP/PIN fields
      const realOtpInputs = Array.from(otpInputs).filter((input) => {
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        return (
          !name.includes('zip') &&
          !name.includes('pin') &&
          !id.includes('postal') &&
          !id.includes('pincode')
        );
      });

      if (otpInputs.length > 0) {
        const otpField = otpInputs[0];
        otpField.value = code;
        otpField.dispatchEvent(new Event('input', { bubbles: true }));
        otpField.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, otpCode);

    if (otpFilled) {
      sendStatus('✅ OTP submitted! Ready to continue', 90, true);
      console.log('✅ OTP filled successfully');
    } else {
      sendStatus('❌ Could not find OTP field', 0);
      console.error('❌ OTP field not found');
    }
  } catch (error) {
    console.error('OTP submission error:', error);
    sendStatus(`OTP Error: ${error.message}`, 0);
  }
});

// User approved - proceed to submit
ipcMain.handle('approve-and-submit', async () => {
  try {
    console.log('✅ User approved, preparing to submit...');
    sendStatus('Ready to submit! Click Submit button', 90, true);
  } catch (error) {
    console.error('Approval error:', error);
    sendStatus(`Error: ${error.message}`, 0);
  }
});

// Final submit
ipcMain.handle('final-submit', async () => {
  try {
    console.log('📤 Submitting form...');
    sendStatus('Submitting form...', 95);

    const submitSelector =
      currentFormMapping?.submitButton?.selector ||
      'button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Continue")';

    await page.waitForSelector(submitSelector, { timeout: 5000 });

    await page.evaluate((selector) => {
      const btn = document.querySelector(selector);
      if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, submitSelector);

    await page.waitForTimeout(1000);
    await page.click(submitSelector);

    sendStatus('✅ Form submitted successfully!', 100);
    await page.waitForTimeout(3000);

    // Check for next page
    const hasNextPage = await checkForNextPage();
    if (hasNextPage) {
      sendStatus('🔄 Next page detected, restarting...', 10);
      await processPageWithAI();
    } else {
      await cleanup();
    }
  } catch (error) {
    console.error('Submit error:', error);
    sendStatus(`Submit Error: ${error.message}`, 0);
  }
});

// Check for next page
async function checkForNextPage() {
  try {
    await page.waitForTimeout(2000);
    const hasNext = await page.evaluate(() => {
      const nextBtn = document.querySelector(
        'button:has-text("Next"), button:has-text("Continue"), .next-page'
      );
      return !!nextBtn;
    });
    return hasNext;
  } catch {
    return false;
  }
}

ipcMain.handle('stop-automation', async () => {
  console.log('Stopping automation...');
  await cleanup();
  sendStatus('Automation stopped', 0);
});

function sendStatus(message, progress, needsApproval = false) {
  console.log(`Status: ${message} (${progress}%)`);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('status-update', {
      message,
      progress,
      needsApproval,
    });
  }
}

async function cleanup() {
  try {
    if (browserView) {
      mainWindow.removeBrowserView(browserView);
      browserView.webContents.destroy();
      browserView = null;
    }
    if (browser) await browser.close();
  } catch (e) {
    console.error('Cleanup error:', e);
  }
  page = null;
  browser = null;
  currentFormMapping = null;
  console.log('Cleanup complete');
}

function sendCaptchaAlert(detection) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('captcha-detected', detection);
  }
}

function sendOtpAlert(otpDetails) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('otp-required', otpDetails);
  }
}
