
export const buildAnalysisPrompt = (
  html: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractedData: any,
  documentList: { name: string; category: string }[],
  customPrompt?: string
) => {
  // Build document list string
  const documentListStr = documentList.length > 0
    ? documentList.map(d => `- ${d.category}: ${d.name}`).join('\n')
    : 'No documents attached';

  return `
        You are an intelligent automation agent filling out visa/immigration forms.
        
        TASK:
        1. First, classify the page type (dashboard, form, confirmation, or unknown)
        2. If it's a DASHBOARD page: identify navigation buttons/links to click (e.g., "Create New Application")
        3. If it's a FORM page: map form fields to the provided client data
        
        CLIENT EXTRACTED DATA:
        ${JSON.stringify(extractedData, null, 2)}
        
        ATTACHED DOCUMENTS (use these for file upload fields):
        ${documentListStr}
        NOTE: For file upload fields, set the "value" to the document name that best matches the field requirement.
        Match by category: passport/identity for ID uploads, education for degree/certificate uploads, etc.
        
        CUSTOM INSTRUCTIONS:
        ${customPrompt || 'None'}
        
        HTML CONTEXT:
        ${html.substring(0, 100000)}

        OUTPUT INSTRUCTIONS:
        Return a valid JSON object with the following structure:
        {
          "pageType": "dashboard" | "form" | "confirmation" | "unknown",
          "pageSummary": "Brief description of the page",
          "isFormPage": boolean,
          "fields": [
            { 
              "selector": "SIMPLE CSS selector ONLY (e.g. button[data='green'], #id, .class)", 
              "value": "Value to fill based on client data", 
              "fieldName": "Name of the field", 
              "fieldType": "text|select|radio|checkbox|date|file|email|tel",
              "reason": "Why this value was chosen" 
            }
          ],
          "actions": [
            { 
              "type": "click|submit|wait", 
              "selector": "SIMPLE CSS selector ONLY - NO :contains(), NO :has(), NO jQuery selectors", 
              "expectedText": "Exact visible button text (REQUIRED - used for matching)",
              "description": "What this action does" 
            }
          ],
          "captcha": {
            "detected": boolean,
            "isInsideForm": boolean
          },
          "otp": {
            "detected": boolean,
            "selector": "CSS selector for OTP input if found"
          }
        }

        CRITICAL RULES:
        1. For DASHBOARD pages: fields array should be empty, focus on actions array with navigation clicks
        2. For FORM pages: fields array should have ALL VISIBLE form fields - do NOT skip any input, select, or checkbox
        3. SELECTOR FORMAT: Use ONLY valid CSS selectors. NEVER use :contains(), :has(), or jQuery pseudo-selectors - they are INVALID
        4. For click actions: Use a SIMPLE selector (e.g. "button[data='green']", ".buttons_border") and put the button text in "expectedText"
        5. IMPORTANT: Map EVERY form field you see in the HTML, even if you don't have exact data:
           - For emergency contact fields: use someone from the family info or make reasonable entries
           - For unknown required fields: provide a reasonable placeholder value
           - NEVER skip fields just because data is missing - provide something reasonable
        6. Detect CAPTCHA only if it's inside the form and blocking submission
        7. Return raw JSON only, no markdown formatting
        8. For checkboxes that say "agree", "accept", "confirm", etc: set value to "true"
      `;
};
