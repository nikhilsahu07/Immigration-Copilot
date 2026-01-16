
import { chromium } from 'playwright-core';

// Hardcoded data from the last Gemini response
const fields = [
    {
      "selector": "#FirstName",
      "value": "NIKHIL",
      "fieldName": "First Name",
      "fieldType": "text"
    },
    {
      "selector": "#MiddleName",
      "value": "KUMAR",
      "fieldName": "Middle Name",
      "fieldType": "text"
    },
    {
      "selector": "#LastName",
      "value": "SAHU",
      "fieldName": "Last Name",
      "fieldType": "text"
    },
    {
      "selector": "#Email",
      "value": "heynikhil07@gmail.com",
      "fieldName": "Email Address",
      "fieldType": "email"
    },
    {
      "selector": "input[placeholder='Enter DOB']",
      "value": "2004-01-10",
      "fieldName": "Date of Birth",
      "fieldType": "date"
    },
    {
      "selector": "select[id*='MaritalStatus']",
      "value": "Single",
      "fieldName": "Marital Status",
      "fieldType": "select"
    },
    {
      "selector": "input[name*='MailingAddress1']",
      "value": "LAKE ROAD, HINDPIRI, Digambar Babu Lane, Building No 3",
      "fieldName": "Mailing Address 1",
      "fieldType": "text"
    },
    {
      "selector": "input[name*='MailingCity']",
      "value": "Ranchi",
      "fieldName": "Mailing City",
      "fieldType": "text"
    },
    {
      "selector": "input[name*='MailingPincode']",
      "value": "834001",
      "fieldName": "Mailing Pincode",
      "fieldType": "text"
    },
    {
      "selector": "input[type='checkbox'][name*='SameAsMailing']",
      "value": "true",
      "fieldName": "Same as mailing address",
      "fieldType": "checkbox"
    },
    {
      "selector": "input[name*='PassportNumber']",
      "value": "V8291034",
      "fieldName": "Passport Number",
      "fieldType": "text"
    },
    {
      "selector": "input[name*='PassportIssueDate']",
      "value": "2021-06-15",
      "fieldName": "Passport Issue Date",
      "fieldType": "date"
    },
    {
      "selector": "input[name*='PassportExpiryDate']",
      "value": "2031-06-14",
      "fieldName": "Passport Expiry Date",
      "fieldType": "date"
    },
    {
      "selector": "input[placeholder='Enter City of Birth']",
      "value": "Tandwa",
      "fieldName": "City of Birth",
      "fieldType": "text"
    },
    {
      "selector": "select[id*='Nationality']",
      "value": "Indian",
      "fieldName": "Nationality",
      "fieldType": "select"
    }
  ];

async function run() {
  console.log('Connecting to browser on port 9222...');
  
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log(`Browser contexts: ${browser.contexts().length}`);
    let targetFrame: any = null;
    let page: any = null;

    for (const context of browser.contexts()) {
        const pages = context.pages();
        console.log(`Context has ${pages.length} pages`);

        for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            const title = await p.title();
            const url = p.url();
            console.log(`Scanning page [${i}]: "${title}" (${url})`);

            // Check main frame using evaluate (most robust)
            try {
                const foundInMain = await p.evaluate(() => {
                    const el = document.querySelector('#FirstName');
                    return { found: !!el, visible: el ? (el as HTMLElement).offsetParent !== null : false };
                });
                
                console.log(`   Main Frame Eval: Found=${foundInMain.found}, Visible=${foundInMain.visible}`);
                
                if (foundInMain.found && foundInMain.visible) {
                    console.log('✅ Found target in MAIN frame via evaluate!');
                    page = p;
                    targetFrame = p; // Treat page as frame for filling
                    break;
                }
            } catch (e) {
                console.log('   Error evaluating main frame:', e);
            }
            
            // Check iframes
            const frames = p.frames();
            console.log(`   Frames: ${frames.length}`);

            for (const f of frames) {
                if (f === p.mainFrame()) continue; // already checked
                console.log(`     Checking Frame: "${f.name()}" (${f.url()})`);
                try {
                    const foundInFrame = await f.evaluate(() => {
                        const el = document.querySelector('#FirstName');
                        return { found: !!el, visible: el ? (el as HTMLElement).offsetParent !== null : false };
                    });
                     console.log(`       Frame Eval: Found=${foundInFrame.found}, Visible=${foundInFrame.visible}`);

                    if (foundInFrame.found && foundInFrame.visible) {
                         console.log('✅ Found target in child frame via evaluate!');
                         targetFrame = f;
                         page = p;
                         break; 
                    }
                } catch (e) {
                    console.log('   Error evaluating frame:', e);
                }
            }
            if (targetFrame) break; 
        }
        if (targetFrame) break;
    }

    if (!targetFrame) {
        console.error('❌ Could not find #FirstName in any frame of any page (checked all contexts).');
        
        // Force navigation to the target page to be absolutely sure
        const targetUrl = 'https://www.coursefinder.ai/StudentApplications/EditProfile?id=847058&sc=true';
        
        // Find the coursefinder page
        page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('coursefinder'));
        
        if (!page) {
            console.warn('Could not find existing coursefinder page to use. Creating a new page.');
            page = await browser.newPage();
        }
        
        if (page) {
            console.log(`\nFound page: ${await page.title()} (${page.url()})`);
            console.log(`🚀 Forcing navigation to: ${targetUrl}`);
            try {
                await page.goto(targetUrl, { timeout: 60000 });
                console.log('   Navigation complete. Waiting for specific selector #FirstName...');
                targetFrame = page;

                // Wait for selector
                try {
                    await page.waitForSelector('#FirstName', { state: 'visible', timeout: 30000 });
                    console.log('✅ Selector #FirstName appeared!');
                } catch (e) {
                    console.error('❌ Timeout waiting for #FirstName after navigation.');
                }

            } catch (e) {
                console.error('   Navigation failed:', e);
            }
        } else {
            console.error('No pages available to navigate.');
            await browser.close();
            return;
        }
    }

    console.log(`\nAttached to TARGET FRAME on page: ${page.url()}`);

    for (const field of fields) {
        const frameToUse = targetFrame || page;
        console.log(`\nChecking field: ${field.fieldName} (${field.selector})`);
        
        try {
            // Use evaluate to check existence/visibility first
             const status = await frameToUse.evaluate((s: string) => {
                const el = document.querySelector(s);
                if (!el) return { exists: false };
                return { exists: true, visible: (el as HTMLElement).offsetParent !== null, value: (el as HTMLInputElement).value };
            }, field.selector);

            if (!status.exists) {
                console.error(`❌ Element NOT FOUND: ${field.selector}`);
                continue;
            }
            if (!status.visible) {
                 console.warn(`⚠️ Element FOUND but NOT VISIBLE: ${field.selector}`);
            } else {
                 console.log(`✅ Element is visible. Current value: "${status.value}"`);
            }

            // Attempt to fill
            console.log(`   Attempting to fill value: "${field.value}"`);
            
            if (field.fieldType === 'select') {
                await frameToUse.selectOption(field.selector, { label: field.value }).catch(async () => {
                     console.log('   standard select failed, trying value match...');
                     await frameToUse.selectOption(field.selector, { value: field.value });
                });
            } else if (field.fieldType === 'checkbox') {
                 // Force check via eval if standard fails
                if (field.value === 'true') await frameToUse.check(field.selector);
                else await frameToUse.uncheck(field.selector);
            } else {
                 // Try standard fill
                await frameToUse.fill(field.selector, field.value);
            }
            console.log(`✅ Filled successfully`);

        } catch (err: any) {
            console.error(`❌ FAILED to fill: ${err.message}`);
        }
    }

    console.log('\nDone.');
    await browser.close();

  } catch (error) {
    console.error('Connection failed:', error);
  }
}

run();
