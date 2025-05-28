/**
 * Debug script for custom fields processing
 * Run this to test custom field handling in isolation
 */

import sheetsService from './src/services/sheetsService.js';

// Test data with various custom field scenarios
const testScenarios = [
  {
    name: "Valid Custom Fields",
    eventData: {
      id: 'test-1',
      title: 'Test Event 1',
      custom_fields: [
        { id: 'field1', label: 'T-Shirt Size', type: 'select' },
        { id: 'field2', label: 'Dietary Preferences', type: 'text' },
        { id: 'field3', label: 'Skills', type: 'checkbox' }
      ],
      requires_payment: true,
      payment_amount: 500
    },
    registrations: [
      {
        participant_name: 'John Doe',
        participant_email: 'john@example.com',
        participant_phone: '+1234567890',
        participant_student_id: 'STU001',
        additional_info: {
          department: 'Computer Science',
          year: '3rd Year',
          custom_fields: {
            field1: 'Large',
            field2: 'Vegetarian',
            field3: ['JavaScript', 'React', 'Node.js']
          }
        },
        payment_status: 'pending',
        payment_amount: 500,
        created_at: new Date().toISOString()
      }
    ]
  },
  {
    name: "Invalid Custom Fields Structure",
    eventData: {
      id: 'test-2',
      title: 'Test Event 2',
      custom_fields: [
        { id: 'field1', label: 'Valid Field', type: 'text' },
        { id: '', label: 'Invalid Field - No ID', type: 'text' },
        { label: 'Invalid Field - No ID at all', type: 'text' },
        null,
        undefined,
        'invalid string field'
      ]
    },
    registrations: [
      {
        participant_name: 'Jane Smith',
        participant_email: 'jane@example.com',
        additional_info: {
          custom_fields: {
            field1: 'Valid Value'
          }
        },
        created_at: new Date().toISOString()
      }
    ]
  },
  {
    name: "No Custom Fields",
    eventData: {
      id: 'test-3',
      title: 'Test Event 3'
    },
    registrations: [
      {
        participant_name: 'Mike Johnson',
        participant_email: 'mike@example.com',
        created_at: new Date().toISOString()
      }
    ]
  },
  {
    name: "Custom Fields Not Array",
    eventData: {
      id: 'test-4',
      title: 'Test Event 4',
      custom_fields: "not an array"
    },
    registrations: [
      {
        participant_name: 'Sarah Wilson',
        participant_email: 'sarah@example.com',
        created_at: new Date().toISOString()
      }
    ]
  },
  {
    name: "Missing Custom Field Values",
    eventData: {
      id: 'test-5',
      title: 'Test Event 5',
      custom_fields: [
        { id: 'field1', label: 'Required Field', type: 'text' },
        { id: 'field2', label: 'Optional Field', type: 'text' }
      ]
    },
    registrations: [
      {
        participant_name: 'Alex Brown',
        participant_email: 'alex@example.com',
        additional_info: {
          custom_fields: {
            field1: 'Has Value'
            // field2 is missing
          }
        },
        created_at: new Date().toISOString()
      },
      {
        participant_name: 'Chris Green',
        participant_email: 'chris@example.com',
        additional_info: {
          // No custom_fields at all
        },
        created_at: new Date().toISOString()
      }
    ]
  }
];

async function runDebugTests() {
  console.log('🔍 Starting Custom Fields Debug Tests\n');
  console.log('=' .repeat(60));

  for (const scenario of testScenarios) {
    console.log(`\n📋 Testing: ${scenario.name}`);
    console.log('-' .repeat(40));

    try {
      // Test the prepareSheetData method directly
      const result = sheetsService.prepareSheetData(scenario.eventData, scenario.registrations);
      
      console.log('✅ Success!');
      console.log(`   Headers (${result.headers.length}):`, result.headers);
      console.log(`   Rows: ${result.rows.length}`);
      
      // Show first row data
      if (result.rows.length > 0) {
        console.log(`   First row (${result.rows[0].length} columns):`, result.rows[0]);
      }
      
    } catch (error) {
      console.log('❌ Error:', error.message);
      console.log('   Stack:', error.stack);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('🏁 Debug tests completed');
}

// Run the debug tests
runDebugTests().catch(error => {
  console.error('❌ Debug test execution failed:', error);
});

export default runDebugTests;
