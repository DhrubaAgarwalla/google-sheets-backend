/**
 * Debug your specific problematic event
 * Replace the eventData and registrations with your actual data
 */

import { diagnoseEvent } from './diagnose-event.js';

// YOUR ACTUAL EVENT DATA (based on the screenshots)
const yourEventData = {
  id: 'custom-check-event',
  title: 'custom check',
  custom_fields: [
    // This is likely where the issue is - we need to find the actual custom field definition
    { id: 'choose_field', label: 'choose', type: 'text' }
  ],
  requires_payment: true,
  payment_amount: 122,
  // Add other event properties as needed
};

// YOUR ACTUAL REGISTRATION DATA (based on the screenshots)
const yourRegistrations = [
  {
    participant_name: 'Prachi Agarwalla',
    participant_email: 'demo@example.com',
    participant_phone: '+919864375371',
    participant_student_id: '2411100',
    participant_department: 'ECE',
    participant_year: '1',
    registration_type: 'Individual',
    status: 'Registered',
    created_at: '2025-05-28T03:54:00.000Z', // May 28, 2025 3:54 AM
    additional_info: {
      department: 'ECE',
      year: '1',
      custom_fields: {
        choose_field: '123, 456' // This is the custom field value from your screenshot
      }
    },
    payment_status: 'verified',
    payment_amount: 122,
    payment_screenshot_url: 'some-screenshot-url'
  }
];

// Run the diagnostic
async function debugMyEvent() {
  console.log('🔍 Debugging your specific event...\n');

  await diagnoseEvent(yourEventData, yourRegistrations);

  console.log('\n📝 INSTRUCTIONS:');
  console.log('1. Replace yourEventData with your actual event data');
  console.log('2. Replace yourRegistrations with your actual registration data');
  console.log('3. Run: node debug-my-event.js');
  console.log('4. The tool will show you exactly what\'s wrong');
}

debugMyEvent().catch(error => {
  console.error('❌ Diagnostic failed:', error);
});
