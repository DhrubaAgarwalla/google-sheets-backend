/**
 * Test script for the Google Sheets backend service
 * Run this to verify the backend is working correctly
 */

// Import node-fetch for HTTP requests
import fetch from 'node-fetch';

const BACKEND_URL = 'http://localhost:3001';

// Sample test data
const testEventData = {
  id: 'test-event-1',
  title: 'Test Event - Backend Verification',
  custom_fields: [
    { id: 'field1', label: 'T-Shirt Size', type: 'select' },
    { id: 'field2', label: 'Dietary Preferences', type: 'text' },
    { id: 'field3', label: 'Emergency Contact', type: 'text' },
    { id: 'field4', label: 'Skills', type: 'checkbox' }
  ],
  requires_payment: true,
  payment_amount: 500,
  payment_upi_id: 'test@upi'
};

const testRegistrations = [
  {
    participant_name: 'John Doe',
    participant_email: 'john.doe@example.com',
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
        field3: 'John Doe Sr. - +1234567899',
        field4: ['JavaScript', 'React', 'Node.js']
      }
    },
    payment_status: 'pending',
    payment_amount: 500
  },
  {
    participant_name: 'Jane Smith',
    participant_email: 'jane.smith@example.com',
    participant_phone: '+1234567891',
    participant_student_id: 'STU002',
    participant_department: 'Electrical Engineering',
    participant_year: '2nd Year',
    registration_type: 'Team',
    status: 'Confirmed',
    created_at: new Date().toISOString(),
    additional_info: {
      department: 'Electrical Engineering',
      year: '2nd Year',
      team_name: 'Tech Innovators',
      team_lead: 'Jane Smith',
      team_members: [
        { name: 'Alice Johnson', rollNumber: 'STU003', department: 'Computer Science', year: '2nd Year' },
        { name: 'Bob Wilson', rollNumber: 'STU004', department: 'Mechanical Engineering', year: '3rd Year' }
      ],
      custom_fields: {
        field1: 'Medium',
        field2: 'No restrictions',
        field3: 'Jane Smith Sr. - +1234567898',
        field4: ['Python', 'Machine Learning']
      }
    },
    payment_status: 'completed',
    payment_amount: 500,
    payment_screenshot_url: 'https://example.com/payment-proof.jpg'
  },
  {
    participant_name: 'Mike Johnson',
    participant_email: 'mike.johnson@example.com',
    participant_phone: '+1234567892',
    participant_student_id: 'STU005',
    participant_department: 'Mechanical Engineering',
    participant_year: '4th Year',
    registration_type: 'Individual',
    status: 'Confirmed',
    created_at: new Date().toISOString(),
    additional_info: {
      department: 'Mechanical Engineering',
      year: '4th Year',
      custom_fields: {
        field1: 'Small',
        field2: 'Vegan',
        field3: 'Mike Johnson Sr. - +1234567897',
        field4: ['CAD', 'Design', 'Manufacturing']
      }
    },
    payment_status: 'pending',
    payment_amount: 500
  }
];

async function testHealthCheck() {
  console.log('🔍 Testing health check...');
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/health`);
    const data = await response.json();

    if (response.ok && data.status === 'healthy') {
      console.log('✅ Health check passed');
      console.log(`   Status: ${data.status}`);
      console.log(`   Google Auth: ${data.services?.googleAuth || 'unknown'}`);
      return true;
    } else {
      console.log('❌ Health check failed');
      console.log('   Response:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check failed with error:', error.message);
    return false;
  }
}

async function testDetailedHealth() {
  console.log('\n🔍 Testing detailed health check...');
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/health/detailed`);
    const data = await response.json();

    console.log('📊 Detailed Health Status:');
    console.log(`   Overall Status: ${data.status}`);
    console.log(`   Google Auth: ${data.services?.googleAuth || 'unknown'}`);
    console.log(`   Google Sheets: ${data.services?.googleSheets || 'unknown'}`);
    console.log(`   Google Drive: ${data.services?.googleDrive || 'unknown'}`);
    console.log(`   Service Account: ${data.configuration?.serviceAccountEmail || 'not configured'}`);

    return response.ok;
  } catch (error) {
    console.log('❌ Detailed health check failed:', error.message);
    return false;
  }
}

async function testCreateSheet() {
  console.log('\n🔍 Testing Google Sheet creation...');
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/sheets/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventData: testEventData,
        registrations: testRegistrations
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('✅ Google Sheet created successfully!');
      console.log(`   Spreadsheet ID: ${data.data.spreadsheetId}`);
      console.log(`   Title: ${data.data.title}`);
      console.log(`   Shareable Link: ${data.data.shareableLink}`);
      console.log(`   Row Count: ${data.data.rowCount}`);

      return data.data.spreadsheetId;
    } else {
      console.log('❌ Sheet creation failed');
      console.log('   Response:', data);
      return null;
    }
  } catch (error) {
    console.log('❌ Sheet creation failed with error:', error.message);
    return null;
  }
}

async function testGetSheetInfo(spreadsheetId) {
  if (!spreadsheetId) return false;

  console.log('\n🔍 Testing get sheet info...');
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/sheets/${spreadsheetId}`);
    const data = await response.json();

    if (response.ok && data.success) {
      console.log('✅ Sheet info retrieved successfully!');
      console.log(`   Title: ${data.data.title}`);
      console.log(`   Shareable Link: ${data.data.shareableLink}`);
      return true;
    } else {
      console.log('❌ Get sheet info failed');
      console.log('   Response:', data);
      return false;
    }
  } catch (error) {
    console.log('❌ Get sheet info failed with error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Google Sheets Backend Tests\n');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log('=' .repeat(50));

  // Test 1: Basic health check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ Backend is not healthy. Please check your configuration.');
    return;
  }

  // Test 2: Detailed health check
  await testDetailedHealth();

  // Test 3: Create Google Sheet
  const spreadsheetId = await testCreateSheet();

  // Test 4: Get sheet info
  await testGetSheetInfo(spreadsheetId);

  console.log('\n' + '=' .repeat(50));

  if (spreadsheetId) {
    console.log('🎉 All tests passed! Google Sheets integration is working.');
    console.log('\n📋 You can view the test sheet at:');
    console.log(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`);
    console.log('\n💡 You can now use the Google Sheets export feature in your Event Manager application.');
  } else {
    console.log('⚠️  Some tests failed. Please check your configuration and try again.');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Test execution failed:', error);
});

export default runTests;
