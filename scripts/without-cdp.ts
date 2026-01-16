import { chromium } from 'playwright';

// 1. Data Definitions
const targetUrl = 'https://www.coursefinder.ai/StudentApplications/EditProfile?id=847058&sc=true';

const fields = [
    { "selector": "#FirstName", "value": "NIKHIL", "fieldName": "First Name", "fieldType": "text" },
    { "selector": "#MiddleName", "value": "KUMAR", "fieldName": "Middle Name", "fieldType": "text" },
    { "selector": "#LastName", "value": "SAHU", "fieldName": "Last Name", "fieldType": "text" },
    { "selector": "#Email", "value": "heynikhil07@gmail.com", "fieldName": "Email Address", "fieldType": "email" },
    { "selector": "input[placeholder='Enter DOB']", "value": "2004-01-10", "fieldName": "Date of Birth", "fieldType": "date" },
    { "selector": "select[id*='MaritalStatus']", "value": "Single", "fieldName": "Marital Status", "fieldType": "select" },
    { "selector": "input[name*='MailingAddress1']", "value": "LAKE ROAD, HINDPIRI, Digambar Babu Lane, Building No 3", "fieldName": "Mailing Address 1", "fieldType": "text" },
    { "selector": "input[name*='MailingCity']", "value": "Ranchi", "fieldName": "Mailing City", "fieldType": "text" },
    { "selector": "input[name*='MailingPincode']", "value": "834001", "fieldName": "Mailing Pincode", "fieldType": "text" },
    { "selector": "input[type='checkbox'][name*='SameAsMailing']", "value": "true", "fieldName": "Same as mailing address", "fieldType": "checkbox" },
    { "selector": "input[name*='PassportNumber']", "value": "V8291034", "fieldName": "Passport Number", "fieldType": "text" },
    { "selector": "input[name*='PassportIssueDate']", "value": "2021-06-15", "fieldName": "Passport Issue Date", "fieldType": "date" },
    { "selector": "input[name*='PassportExpiryDate']", "value": "2031-06-14", "fieldName": "Passport Expiry Date", "fieldType": "date" },
    { "selector": "input[placeholder='Enter City of Birth']", "value": "Tandwa", "fieldName": "City of Birth", "fieldType": "text" },
    { "selector": "select[id*='Nationality']", "value": "Indian", "fieldName": "Nationality", "fieldType": "select" }
];

async function run() {
    console.log('🚀 Launching visible browser...');
    
    // Launch browser in headed mode with a slight delay to see actions
    const browser = await chromium.launch({ 
        headless: false, 
        slowMo: 100, // Adds 100ms delay to interactions so you can see them
        args: ['--start-maximized'] // Optional: Open maximized
    });

    const context = await browser.newContext({
        viewport: null // Uses the full window size
    });
    
    const page = await context.newPage();

    console.log(`🌐 Navigating to: ${targetUrl}`);
    await page.goto(targetUrl);

    // --- LOGIN HANDLER ---
    // A fresh browser won't be logged in. If we get redirected to login, pause.
    if (page.url().includes('login') || page.url().includes('signin')) {
        console.log('⚠️ Login required! Please log in manually in the browser window.');
        console.log('⏸️ Script paused. Resume via Playwright Inspector or console when ready...');
        
        // Wait for user to login and navigate back to the target page
        // You can click the "Resume" button in the Playwright inspector overlay if it appears, 
        // or we just wait until the #FirstName field appears.
        await page.waitForSelector('#FirstName', { timeout: 0 }); // Wait forever until user logs in and navigates
        console.log('✅ Target page detected! Resuming automation...');
    } else {
        try {
            await page.waitForSelector('#FirstName', { timeout: 10000 });
        } catch (e) {
            console.error('❌ Could not find #FirstName. Are you on the right page?');
            return;
        }
    }

    // --- FORM FILLING ---
    console.log('📝 Starting form fill...');

    for (const field of fields) {
        try {
            const locator = page.locator(field.selector).first();
            
            // Scroll into view to ensure we see it
            await locator.scrollIntoViewIfNeeded();

            // Check if visible
            if (!(await locator.isVisible())) {
                console.warn(`⚠️ Field hidden, skipping: ${field.fieldName} (${field.selector})`);
                continue;
            }

            console.log(`🔹 Filling: ${field.fieldName}`);

            if (field.fieldType === 'select') {
                // Handle Dropdowns
                // Try selecting by Label first, then by Value
                try {
                    await locator.selectOption({ label: field.value });
                } catch {
                    await locator.selectOption({ value: field.value });
                }

            } else if (field.fieldType === 'checkbox') {
                // Handle Checkboxes
                if (field.value === 'true') {
                    await locator.check();
                } else {
                    await locator.uncheck();
                }

            } else {
                // Handle Text, Date, Email, etc.
                await locator.fill(field.value);
            }

        } catch (error) {
            console.error(`❌ Failed to fill ${field.fieldName}:`, error);
        }
    }

    console.log('✅ Form filling complete!');
    
    // Keep browser open for 10 seconds to inspect, then close
    // Comment out browser.close() if you want to keep it open indefinitely
    console.log('⏳ Keeping browser open for 10 seconds...');
    await page.waitForTimeout(10000);
    
    await browser.close();
}

run();