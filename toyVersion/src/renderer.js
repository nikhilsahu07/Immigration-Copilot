import './index.css';

console.log('👋 AI Renderer loading...');

let currentFormMapping = null;

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM ready, building enhanced AI UI...');

  document.body.innerHTML = `
    <div class="container">
      <div class="left-panel" id="leftPanel">
        <h1>🤖 AI Form Filler</h1>
        
        <div class="card">
          <h3>🌐 Target Website</h3>
          <input 
            type="url" 
            id="urlInput" 
            class="url-input" 
            placeholder="https://example.com/form"
            value="https://testing.thepolicymall.com/health-insurance"
          />
          <div class="ai-badge">✨ Powered by Gemini AI</div>
        </div>

        <div class="card">
          <h3>🎯 Custom AI Instructions (Optional)</h3>
          <textarea 
            id="customPrompt" 
            class="prompt-textarea"
            placeholder="E.g., 'Fill the form professionally and use formal language'"
            rows="3"
          ></textarea>
          <div class="prompt-hint">💡 Leave empty for default behavior</div>
        </div>

        <div class="card">
          <h3>Controls</h3>
          <div class="controls">
            <button class="btn btn-primary btn-icon" id="startBtn">
              🚀 Start Auto-Fill
            </button>
            <button class="btn btn-danger btn-icon" id="stopBtn" disabled>
              ⬛ Stop
            </button>
          </div>
        </div>

        <div class="card" id="previewCard" style="display: none;">
          <h3>📋 Auto-Filled Fields (Review)</h3>
          <div class="field-preview" id="fieldPreview"></div>
          <button class="btn btn-success btn-icon" id="approveBtn">
            ✓ Looks Good!
          </button>
        </div>

        <div class="card">
          <div class="status-box">
            <h3>Status</h3>
            <div id="statusText">Enter URL and click Start</div>
            <div class="progress-bar">
              <div class="progress-fill" id="progressBar"></div>
            </div>
            <div id="progressText">0%</div>
            <button class="btn btn-success btn-icon" id="submitBtn" style="display: none;">
              📤 Submit Form
            </button>
          </div>
        </div>
      </div>

      <div class="right-panel" id="rightPanel">
        <button class="toggle-btn" id="toggleBtn" title="Toggle Panel">◀</button>
        <div class="placeholder-content">
          <div class="placeholder-icon">🤖</div>
          <div class="placeholder-text">AI-Powered Browser</div>
          <div class="placeholder-subtext">Form will auto-fill here</div>
        </div>
      </div>
    </div>
  `;

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const approveBtn = document.getElementById('approveBtn');
  const submitBtn = document.getElementById('submitBtn');
  const toggleBtn = document.getElementById('toggleBtn');
  const leftPanel = document.getElementById('leftPanel');
  const statusText = document.getElementById('statusText');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const previewCard = document.getElementById('previewCard');
  const fieldPreview = document.getElementById('fieldPreview');
  const urlInput = document.getElementById('urlInput');
  const customPrompt = document.getElementById('customPrompt');

  // Toggle panel
  toggleBtn.addEventListener('click', () => {
    leftPanel.classList.toggle('hidden');
    toggleBtn.textContent = leftPanel.classList.contains('hidden') ? '▶' : '◀';
  });

  // Start AI automation
  startBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const prompt = customPrompt.value.trim();

    if (!url) {
      statusText.textContent = '❌ Please enter a URL';
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      statusText.textContent = '❌ URL must start with http:// or https://';
      return;
    }

    console.log('🚀 Start AI clicked');
    console.log('URL:', url);
    console.log('Custom Prompt:', prompt || 'None');

    startBtn.disabled = true;
    stopBtn.disabled = false;
    previewCard.style.display = 'none';
    submitBtn.style.display = 'none';

    try {
      await window.electronAPI.startAutomation({ url, prompt });
    } catch (error) {
      console.error('❌ Start error:', error);
      statusText.textContent = `Error: ${error.message}`;
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  });

  // Stop automation
  stopBtn.addEventListener('click', async () => {
    console.log('⬛ Stop clicked');
    stopBtn.disabled = true;

    try {
      await window.electronAPI.stopAutomation();
    } catch (error) {
      console.error('❌ Stop error:', error);
    }

    startBtn.disabled = false;
    previewCard.style.display = 'none';
    submitBtn.style.display = 'none';
  });

  // Approve auto-filled form
  approveBtn.addEventListener('click', async () => {
    console.log('✓ Approve clicked');
    approveBtn.disabled = true;
    approveBtn.textContent = '⏳ Approved...';

    try {
      await window.electronAPI.approveAndSubmit();
      previewCard.style.display = 'none';
    } catch (error) {
      console.error('❌ Approve error:', error);
      approveBtn.disabled = false;
      approveBtn.textContent = '✓ Looks Good!';
    }
  });

  // Final submit
  submitBtn.addEventListener('click', async () => {
    console.log('📤 Submit clicked');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Submitting...';

    try {
      await window.electronAPI.finalSubmit();
      submitBtn.style.display = 'none';
    } catch (error) {
      console.error('❌ Submit error:', error);
      submitBtn.disabled = false;
      submitBtn.textContent = '📤 Submit Form';
    }
  });

  // Listen for AI form preview (after auto-fill)
  window.electronAPI.onFormPreview((formMapping) => {
    console.log('📋 Received auto-filled form preview:', formMapping);
    currentFormMapping = formMapping;

    // Build preview UI with icons
    let html = '<div class="field-list">';

    formMapping.fields.forEach((field, idx) => {
      const confidenceColor =
        field.confidence === 'high'
          ? '#10b981'
          : field.confidence === 'medium'
            ? '#f59e0b'
            : '#ef4444';

      // Field type icon
      const typeIcon =
        {
          text: '📝',
          email: '📧',
          tel: '📞',
          select: '📋',
          dropdown: '📋',
          radio: '🔘',
          checkbox: '☑️',
          date: '📅',
          textarea: '📄',
          number: '🔢',
        }[field.fieldType] || '📝';

      html += `
        <div class="field-item">
          <div class="field-header">
            <span class="field-label">
              ${typeIcon} ${field.fieldLabel || 'Unknown Field'}
            </span>
            <span class="confidence-badge" style="background: ${confidenceColor}">
              ${field.confidence || 'low'}
            </span>
          </div>
          <div class="field-value-preview">
            <strong>Filled:</strong> ${field.value || '(empty)'}
          </div>
          <div class="field-meta">
            ${field.fieldType} • ${field.selector}
          </div>
          <div class="field-reasoning">
            💭 ${field.reasoning}
          </div>
        </div>
      `;
    });

    html += '</div>';
    fieldPreview.innerHTML = html;
    previewCard.style.display = 'block';
    approveBtn.disabled = false;
    approveBtn.textContent = '✓ Looks Good!';
  });

  // Listen for status updates
  window.electronAPI.onStatusUpdate((data) => {
    console.log('📊 Status update:', data);

    statusText.textContent = data.message;
    progressBar.style.width = `${data.progress}%`;
    progressText.textContent = `${data.progress}%`;

    if (data.needsApproval) {
      submitBtn.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = '📤 Submit Form';
    }

    if (data.progress === 100 || data.progress === 0) {
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  });

  console.log('✅ Enhanced AI UI initialized');
});

// Listen for CAPTCHA detection
window.electronAPI.onCaptchaDetected((detection) => {
  console.log('🤖 CAPTCHA detected:', detection);

  // Clear status text and create alert container
  const previewCard = document.getElementById('previewCard');
  const statusBox = document.querySelector('.status-box');

  // Hide preview if showing
  if (previewCard) previewCard.style.display = 'none';

  // Create alert HTML
  const alertHTML = `
      <div class="alert-box captcha-alert">
        <div class="alert-icon">⚠️</div>
        <div class="alert-content">
          <h4>${detection.captchaType || 'CAPTCHA'} Detected!</h4>
          <p style="font-size: 14px; margin: 10px 0;">${detection.message}</p>
          <p style="font-size: 13px; color: #6b7280; margin: 10px 0;">
            The form has been filled. Please solve the CAPTCHA in the browser window (right side), 
            then click the button below to continue.
          </p>
          <button class="btn btn-success btn-icon" id="continueCaptchaBtn" style="margin-top: 15px; width: 100%;">
            ✓ I Solved the CAPTCHA - Continue
          </button>
        </div>
      </div>
    `;

  // Insert into status box
  if (statusBox) {
    const existingH3 = statusBox.querySelector('h3');
    if (existingH3) existingH3.textContent = 'Action Required';

    const statusText = document.getElementById('statusText');
    statusText.innerHTML = alertHTML;

    // Add event listener to the button
    setTimeout(() => {
      const continueBtn = document.getElementById('continueCaptchaBtn');
      if (continueBtn) {
        continueBtn.onclick = async () => {
          console.log('✅ User clicked Continue after CAPTCHA');
          continueBtn.disabled = true;
          continueBtn.textContent = '⏳ Resuming...';
          statusText.textContent = 'Resuming automation...';

          try {
            await window.electronAPI.resumeAfterCaptcha();
          } catch (error) {
            console.error('Resume error:', error);
            statusText.textContent = 'Error resuming. Please try again.';
            continueBtn.disabled = false;
            continueBtn.textContent = '✓ I Solved the CAPTCHA - Continue';
          }
        };
      }
    }, 100);
  }
});

// Listen for OTP requirement
window.electronAPI.onOtpRequired((otpDetails) => {
  console.log('📱 OTP required:', otpDetails);

  const previewCard = document.getElementById('previewCard');
  const statusBox = document.querySelector('.status-box');

  if (previewCard) previewCard.style.display = 'none';

  const alertHTML = `
      <div class="alert-box otp-alert">
        <div class="alert-icon"></div>
        <div class="alert-content">
          <h4>OTP Verification Required</h4>
          <p style="font-size: 14px; margin: 10px 0;">
            The form has been filled. Please check your phone/email for the verification code.
          </p>
          <div style="margin: 20px 0; text-align: center;">
            <label style="display: block; margin-bottom: 10px; font-weight: 600; color: #374151; font-size: 13px;">
              Enter OTP Code:
            </label>
            <input 
              type="text" 
              id="otpInput" 
              class="otp-input"
              placeholder="${otpDetails?.placeholder || 'Enter OTP'}" 
              maxlength="${otpDetails?.maxLength || 6}"
              style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 20px; font-weight: 600; width: 220px; text-align: center; letter-spacing: 8px;"
            />
          </div>
          <button class="btn btn-success btn-icon" id="submitOtpBtn" style="width: 100%;">
            📤 Submit OTP & Continue
          </button>
          <p style="margin-top: 10px; font-size: 11px; color: #9ca3af;">
            Field selector: ${otpDetails?.selector || 'Auto-detected'}
          </p>
        </div>
      </div>
    `;

  if (statusBox) {
    const existingH3 = statusBox.querySelector('h3');
    if (existingH3) existingH3.textContent = 'OTP Required';

    const statusText = document.getElementById('statusText');
    statusText.innerHTML = alertHTML;

    // Focus on OTP input
    setTimeout(() => {
      const otpInput = document.getElementById('otpInput');
      if (otpInput) {
        otpInput.focus();

        // Allow Enter key to submit
        otpInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            document.getElementById('submitOtpBtn').click();
          }
        });
      }

      // Add submit button handler
      const submitBtn = document.getElementById('submitOtpBtn');
      if (submitBtn) {
        submitBtn.onclick = async () => {
          const otpCode = otpInput.value.trim();

          if (!otpCode) {
            statusText.innerHTML +=
              '<p style="color: #ef4444; margin-top: 10px; font-weight: 600;">⚠️ Please enter the OTP code!</p>';
            return;
          }

          console.log('📱 Submitting OTP:', otpCode);
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ Submitting...';

          try {
            await window.electronAPI.submitOtp(otpCode);
            statusText.textContent = '✅ OTP submitted successfully!';
          } catch (error) {
            console.error('OTP submit error:', error);
            statusText.textContent =
              '❌ Error submitting OTP. Please try again.';
            submitBtn.disabled = false;
            submitBtn.textContent = '📤 Submit OTP & Continue';
          }
        };
      }
    }, 100);
  }
});
