/**
 * Diagnostic tool for troubleshooting specific event export issues
 * This will help identify the exact problem with your event data
 */

import sheetsService from './src/services/sheetsService.js';

/**
 * Comprehensive event data validator
 */
function validateEventData(eventData) {
  const issues = [];
  
  console.log('🔍 Validating Event Data Structure...');
  
  // Basic validation
  if (!eventData) {
    issues.push('❌ Event data is null or undefined');
    return issues;
  }
  
  if (!eventData.title) {
    issues.push('❌ Event title is missing');
  }
  
  if (!eventData.id) {
    issues.push('⚠️  Event ID is missing (not critical for sheets)');
  }
  
  // Custom fields validation
  if (eventData.custom_fields !== undefined) {
    console.log('📋 Found custom_fields, validating...');
    
    if (!Array.isArray(eventData.custom_fields)) {
      issues.push(`❌ custom_fields must be an array, but got: ${typeof eventData.custom_fields}`);
      issues.push(`   Value: ${JSON.stringify(eventData.custom_fields)}`);
    } else {
      console.log(`   📊 Found ${eventData.custom_fields.length} custom fields`);
      
      eventData.custom_fields.forEach((field, index) => {
        console.log(`   🔍 Validating field ${index + 1}:`, field);
        
        if (!field) {
          issues.push(`❌ Custom field at index ${index} is null/undefined`);
        } else if (typeof field !== 'object') {
          issues.push(`❌ Custom field at index ${index} is not an object: ${typeof field}`);
          issues.push(`   Value: ${JSON.stringify(field)}`);
        } else {
          // Check required properties
          if (!field.id) {
            issues.push(`❌ Custom field at index ${index} missing 'id' property`);
            issues.push(`   Field: ${JSON.stringify(field)}`);
          } else if (typeof field.id !== 'string') {
            issues.push(`❌ Custom field at index ${index} 'id' is not a string: ${typeof field.id}`);
            issues.push(`   ID value: ${JSON.stringify(field.id)}`);
          }
          
          if (!field.label) {
            issues.push(`❌ Custom field at index ${index} missing 'label' property`);
            issues.push(`   Field: ${JSON.stringify(field)}`);
          } else if (typeof field.label !== 'string') {
            issues.push(`❌ Custom field at index ${index} 'label' is not a string: ${typeof field.label}`);
            issues.push(`   Label value: ${JSON.stringify(field.label)}`);
          }
          
          if (field.id && field.label) {
            console.log(`   ✅ Field ${index + 1} is valid: ${field.id} - ${field.label}`);
          }
        }
      });
    }
  } else {
    console.log('📋 No custom fields found (this is okay)');
  }
  
  // Payment validation
  if (eventData.payment_required || eventData.requires_payment) {
    console.log('💳 Payment is required for this event');
    if (eventData.payment_amount) {
      console.log(`   💰 Payment amount: ${eventData.payment_amount}`);
    }
    if (eventData.payment_upi_id) {
      console.log(`   📱 UPI ID: ${eventData.payment_upi_id}`);
    }
    if (eventData.payment_qr_code) {
      console.log(`   📷 QR Code: ${eventData.payment_qr_code}`);
    }
  }
  
  return issues;
}

/**
 * Validate registration data
 */
function validateRegistrations(registrations) {
  const issues = [];
  
  console.log('👥 Validating Registration Data...');
  
  if (!registrations) {
    issues.push('❌ Registrations data is null or undefined');
    return issues;
  }
  
  if (!Array.isArray(registrations)) {
    issues.push(`❌ Registrations must be an array, but got: ${typeof registrations}`);
    return issues;
  }
  
  if (registrations.length === 0) {
    issues.push('❌ No registrations found');
    return issues;
  }
  
  console.log(`📊 Found ${registrations.length} registrations`);
  
  registrations.forEach((reg, index) => {
    console.log(`🔍 Validating registration ${index + 1}: ${reg.participant_name || 'Unknown'}`);
    
    // Basic fields
    if (!reg.participant_name) {
      issues.push(`⚠️  Registration ${index + 1} missing participant_name`);
    }
    if (!reg.participant_email) {
      issues.push(`⚠️  Registration ${index + 1} missing participant_email`);
    }
    
    // Check additional_info structure
    if (reg.additional_info) {
      if (typeof reg.additional_info !== 'object') {
        issues.push(`❌ Registration ${index + 1} additional_info is not an object: ${typeof reg.additional_info}`);
      } else if (reg.additional_info.custom_fields) {
        if (typeof reg.additional_info.custom_fields !== 'object') {
          issues.push(`❌ Registration ${index + 1} custom_fields is not an object: ${typeof reg.additional_info.custom_fields}`);
          issues.push(`   Value: ${JSON.stringify(reg.additional_info.custom_fields)}`);
        } else {
          console.log(`   📋 Registration ${index + 1} has custom field data:`, Object.keys(reg.additional_info.custom_fields));
        }
      }
    }
  });
  
  return issues;
}

/**
 * Test the actual sheet data preparation
 */
async function testSheetPreparation(eventData, registrations) {
  console.log('🧪 Testing Sheet Data Preparation...');
  
  try {
    const result = sheetsService.prepareSheetData(eventData, registrations);
    console.log('✅ Sheet data preparation successful!');
    console.log(`📊 Generated ${result.headers.length} columns and ${result.rows.length} rows`);
    console.log('📋 Headers:', result.headers);
    
    // Show sample row
    if (result.rows.length > 0) {
      console.log('📄 Sample row data:');
      result.headers.forEach((header, index) => {
        const value = result.rows[0][index];
        console.log(`   ${header}: ${value}`);
      });
    }
    
    return { success: true, result };
  } catch (error) {
    console.log('❌ Sheet data preparation failed!');
    console.log('Error:', error.message);
    console.log('Stack:', error.stack);
    return { success: false, error };
  }
}

/**
 * Main diagnostic function
 */
async function diagnoseEvent(eventData, registrations) {
  console.log('🔧 GOOGLE SHEETS EXPORT DIAGNOSTIC TOOL');
  console.log('=' .repeat(60));
  console.log(`📅 Event: ${eventData?.title || 'Unknown Event'}`);
  console.log(`👥 Registrations: ${registrations?.length || 0}`);
  console.log('=' .repeat(60));
  
  // Step 1: Validate event data
  console.log('\n📋 STEP 1: Event Data Validation');
  console.log('-' .repeat(40));
  const eventIssues = validateEventData(eventData);
  
  if (eventIssues.length > 0) {
    console.log('❌ Event data issues found:');
    eventIssues.forEach(issue => console.log(issue));
  } else {
    console.log('✅ Event data validation passed');
  }
  
  // Step 2: Validate registrations
  console.log('\n👥 STEP 2: Registration Data Validation');
  console.log('-' .repeat(40));
  const regIssues = validateRegistrations(registrations);
  
  if (regIssues.length > 0) {
    console.log('❌ Registration data issues found:');
    regIssues.forEach(issue => console.log(issue));
  } else {
    console.log('✅ Registration data validation passed');
  }
  
  // Step 3: Test sheet preparation
  console.log('\n🧪 STEP 3: Sheet Preparation Test');
  console.log('-' .repeat(40));
  const prepResult = await testSheetPreparation(eventData, registrations);
  
  // Summary
  console.log('\n📊 DIAGNOSTIC SUMMARY');
  console.log('=' .repeat(60));
  
  const totalIssues = eventIssues.length + regIssues.length;
  if (totalIssues === 0 && prepResult.success) {
    console.log('🎉 NO ISSUES FOUND! Your event should export successfully.');
  } else {
    console.log(`❌ Found ${totalIssues} validation issues`);
    if (!prepResult.success) {
      console.log('❌ Sheet preparation failed');
      console.log('🔍 Main error:', prepResult.error.message);
    }
    
    console.log('\n🔧 RECOMMENDED ACTIONS:');
    if (eventIssues.length > 0) {
      console.log('1. Fix event data issues listed above');
    }
    if (regIssues.length > 0) {
      console.log('2. Fix registration data issues listed above');
    }
    if (!prepResult.success) {
      console.log('3. Address the sheet preparation error');
    }
  }
  
  console.log('\n' + '=' .repeat(60));
}

// Export for use in other scripts
export { diagnoseEvent, validateEventData, validateRegistrations, testSheetPreparation };

// If running directly, provide instructions
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔧 Event Diagnostic Tool');
  console.log('To use this tool, import it and call diagnoseEvent(eventData, registrations)');
  console.log('Example:');
  console.log('  import { diagnoseEvent } from "./diagnose-event.js";');
  console.log('  await diagnoseEvent(yourEventData, yourRegistrations);');
}
