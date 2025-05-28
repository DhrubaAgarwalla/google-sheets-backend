/**
 * Test script specifically for debugging custom fields issues
 * Run this to identify the exact problem with custom fields
 */

import sheetsService from './src/services/sheetsService.js';

// Test with the exact structure that might be causing issues
const problematicEventData = {
  id: 'test-event',
  title: 'Test Event with Custom Fields',
  custom_fields: [
    { id: 'field1', label: 'T-Shirt Size', type: 'select' },
    { id: 'field2', label: 'Dietary Preferences', type: 'text' },
    { id: 'field3', label: 'Emergency Contact', type: 'text' }
  ],
  requires_payment: true,
  payment_amount: 500,
  payment_upi_id: 'test@upi'
};

const testRegistrations = [
  {
    participant_name: 'John Doe',
    participant_email: 'john@example.com',
    participant_phone: '+1234567890',
    participant_student_id: 'STU001',
    participant_department: 'Computer Science',
    participant_year: '3rd Year',
    registration_type: 'Individual',
    status: 'Confirmed',
    created_at: new Date().toISOString(),
    additional_info: {
      department: 'Computer Science',
      year: '3rd Year',
      custom_fields: {
        field1: 'Large',
        field2: 'Vegetarian',
        field3: 'John Doe Sr. - +1234567899'
      }
    },
    payment_status: 'pending',
    payment_amount: 500
  },
  {
    participant_name: 'Jane Smith',
    participant_email: 'jane@example.com',
    participant_phone: '+1234567891',
    participant_student_id: 'STU002',
    registration_type: 'Individual',
    status: 'Confirmed',
    created_at: new Date().toISOString(),
    additional_info: {
      custom_fields: {
        field1: 'Medium',
        field2: 'No restrictions',
        field3: 'Jane Smith Sr. - +1234567898'
      }
    },
    payment_status: 'completed',
    payment_amount: 500
  }
];

async function testCustomFields() {
  console.log('🧪 Testing Custom Fields Processing');
  console.log('=' .repeat(50));
  
  try {
    console.log('\n📋 Event Data:');
    console.log(JSON.stringify(problematicEventData, null, 2));
    
    console.log('\n👥 Sample Registration:');
    console.log(JSON.stringify(testRegistrations[0], null, 2));
    
    console.log('\n🔄 Testing prepareSheetData...');
    
    // Test the data preparation
    const result = sheetsService.prepareSheetData(problematicEventData, testRegistrations);
    
    console.log('\n✅ SUCCESS! Sheet data prepared successfully');
    console.log(`📊 Headers (${result.headers.length}):`, result.headers);
    console.log(`📝 Rows: ${result.rows.length}`);
    
    // Show the first row in detail
    if (result.rows.length > 0) {
      console.log('\n📄 First row data:');
      result.headers.forEach((header, index) => {
        console.log(`  ${header}: ${result.rows[0][index]}`);
      });
    }
    
    console.log('\n🎯 Now testing full sheet creation...');
    
    // Test the full sheet creation
    const sheetResult = await sheetsService.createEventSheet(problematicEventData, testRegistrations);
    
    console.log('\n🎉 FULL SUCCESS! Google Sheet created successfully');
    console.log('📊 Result:', sheetResult);
    
  } catch (error) {
    console.log('\n❌ ERROR DETECTED:');
    console.log('Error Type:', error.constructor.name);
    console.log('Error Message:', error.message);
    console.log('Error Stack:', error.stack);
    
    // Provide specific debugging information
    if (error.message.includes('Custom field')) {
      console.log('\n🔍 CUSTOM FIELD ISSUE DETECTED:');
      console.log('- Check that all custom fields have both "id" and "label" properties');
      console.log('- Ensure custom_fields is an array');
      console.log('- Verify that registration data has custom_fields in additional_info');
    }
    
    if (error.message.includes('prepare sheet data')) {
      console.log('\n🔍 DATA PREPARATION ISSUE:');
      console.log('- Check the structure of your event data');
      console.log('- Verify registration data format');
      console.log('- Ensure all required fields are present');
    }
    
    if (error.message.includes('Google')) {
      console.log('\n🔍 GOOGLE API ISSUE:');
      console.log('- Check your service account credentials');
      console.log('- Verify Google Sheets API is enabled');
      console.log('- Ensure proper permissions are set');
    }
  }
}

// Test with various edge cases
async function testEdgeCases() {
  console.log('\n\n🧪 Testing Edge Cases');
  console.log('=' .repeat(50));
  
  const edgeCases = [
    {
      name: 'Empty custom fields array',
      eventData: { ...problematicEventData, custom_fields: [] },
      registrations: testRegistrations
    },
    {
      name: 'No custom fields property',
      eventData: { ...problematicEventData },
      registrations: testRegistrations
    },
    {
      name: 'Registration without custom fields',
      eventData: problematicEventData,
      registrations: [{
        participant_name: 'Test User',
        participant_email: 'test@example.com',
        created_at: new Date().toISOString(),
        additional_info: {}
      }]
    }
  ];
  
  // Remove custom_fields from the second test case
  delete edgeCases[1].eventData.custom_fields;
  
  for (const testCase of edgeCases) {
    console.log(`\n🔬 Testing: ${testCase.name}`);
    try {
      const result = sheetsService.prepareSheetData(testCase.eventData, testCase.registrations);
      console.log(`  ✅ Success - Headers: ${result.headers.length}, Rows: ${result.rows.length}`);
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
    }
  }
}

// Run the tests
async function runAllTests() {
  await testCustomFields();
  await testEdgeCases();
  
  console.log('\n' + '=' .repeat(50));
  console.log('🏁 Testing completed');
  console.log('If you see errors above, they indicate the specific issues to fix.');
}

runAllTests().catch(error => {
  console.error('❌ Test execution failed:', error);
});
