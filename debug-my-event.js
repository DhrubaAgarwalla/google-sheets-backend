/**
 * Debug your specific problematic event
 * Replace the eventData and registrations with your actual data
 */

import { diagnoseEvent } from './diagnose-event.js';

// Update your test data to match the problematic event structure
const yourEventData = {
  id: 'custom-check-event',
  title: 'custom check',
  custom_fields: [
    { id: 'choose_field', label: 'choose', type: 'checkbox' },
    // Add other custom fields that are causing issues
  ],
  requires_payment: true,
  payment_amount: 122,
};

// Add a sample registration with the problematic custom field data
const sampleRegistration = {
  participant_name: "Test User",
  participant_email: "test@example.com",
  participant_phone: "1234567890",
  additional_info: {
    custom_fields: {
      choose_field: ["Option 1", "Option 2"] // For checkbox type
      // Add other custom field values
    }
  }
};

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


