import googleConfig from '../config/google.js';

/**
 * Google Sheets service for managing event registration spreadsheets
 */
class SheetsService {
  constructor() {
    this.sheets = null;
    this.drive = null;
    this.initialize();
  }

  initialize() {
    this.sheets = googleConfig.getSheetsClient();
    this.drive = googleConfig.getDriveClient();
  }

  /**
   * Create a new Google Sheet with event registration data
   */
  async createEventSheet(eventData, registrations, isAutoCreate = false) {
    try {
      console.log(`Creating Google Sheet for event: ${eventData.title} (auto-create: ${isAutoCreate})`);

      // Validate input data
      if (!eventData) {
        throw new Error('Event data is required but was not provided');
      }
      if (!eventData.title) {
        throw new Error('Event title is required but was not provided');
      }
      if (!registrations || !Array.isArray(registrations)) {
        throw new Error('Registrations must be provided as an array');
      }

      // Allow empty registrations for auto-creation mode
      if (registrations.length === 0 && !isAutoCreate) {
        throw new Error('Cannot create sheet with no registrations');
      }

      // Validate custom fields structure early
      if (eventData.custom_fields) {
        if (!Array.isArray(eventData.custom_fields)) {
          throw new Error(`Custom fields must be an array, but received: ${typeof eventData.custom_fields}`);
        }

        // Validate each custom field
        eventData.custom_fields.forEach((field, index) => {
          if (!field || typeof field !== 'object') {
            throw new Error(`Custom field at index ${index} is invalid: must be an object but received ${typeof field}`);
          }
          if (!field.id || typeof field.id !== 'string') {
            throw new Error(`Custom field at index ${index} is missing required 'id' property or id is not a string`);
          }
          if (!field.label || typeof field.label !== 'string') {
            throw new Error(`Custom field at index ${index} is missing required 'label' property or label is not a string`);
          }
        });
      }

      // Test data preparation before creating the sheet
      try {
        const testSheetData = this.prepareSheetData(eventData, registrations);
        console.log(`Sheet data prepared successfully: ${testSheetData.headers.length} columns, ${testSheetData.rows.length} rows`);
      } catch (prepError) {
        throw new Error(`Failed to prepare sheet data: ${prepError.message}`);
      }

      // Check if there are team registrations
      const hasTeamRegistrations = registrations.some(reg =>
        reg.additional_info?.team_members?.length > 0
      );

      // Check if the event supports team registration based on participation type
      const supportsTeamRegistration = eventData.participation_type === 'team' || eventData.participation_type === 'both';

      // Create sheets array - always include Registrations and Dashboard
      const sheets = [
        {
          properties: {
            title: 'Registrations',
            tabColor: { red: 0.267, green: 0.447, blue: 0.769 }, // #4472C4
            gridProperties: {
              rowCount: Math.max(1000, registrations.length + 50),
              columnCount: 20
            }
          }
        },
        {
          properties: {
            title: 'Dashboard',
            tabColor: { red: 0.929, green: 0.490, blue: 0.192 }, // #ED7D31
            gridProperties: {
              rowCount: 100,
              columnCount: 10
            }
          }
        }
      ];

      // Only add Team Members sheet if the event supports team registration or there are team registrations
      if (supportsTeamRegistration || hasTeamRegistrations) {
        sheets.splice(1, 0, { // Insert at index 1 (between Registrations and Dashboard)
          properties: {
            title: 'Team Members',
            tabColor: { red: 0.267, green: 0.447, blue: 0.769 }, // #4472C4
            gridProperties: {
              rowCount: 1000,
              columnCount: 15
            }
          }
        });
      }

      // Create a new spreadsheet with conditional sheets
      const spreadsheetResponse = await this.sheets.spreadsheets.create({
        resource: {
          properties: {
            title: `${eventData.title} - Event Registrations`,
            locale: 'en_US',
            timeZone: 'Asia/Kolkata'
          },
          sheets: sheets
        }
      });

      const spreadsheetId = spreadsheetResponse.data.spreadsheetId;
      console.log(`Created spreadsheet with ID: ${spreadsheetId}`);

      // Get sheet IDs based on what sheets were created
      const registrationsSheetId = spreadsheetResponse.data.sheets[0].properties.sheetId;
      let teamMembersSheetId = null;
      let dashboardSheetId = null;

      if (supportsTeamRegistration || hasTeamRegistrations) {
        teamMembersSheetId = spreadsheetResponse.data.sheets[1].properties.sheetId;
        dashboardSheetId = spreadsheetResponse.data.sheets[2].properties.sheetId;
      } else {
        dashboardSheetId = spreadsheetResponse.data.sheets[1].properties.sheetId;
      }

      // Populate sheets - continue even if some fail
      try {
        await this.populateRegistrationsSheet(spreadsheetId, eventData, registrations, isAutoCreate);
        console.log('Successfully populated registrations sheet');
      } catch (error) {
        console.error('Failed to populate registrations sheet:', error.message);
        // Continue anyway - the sheet exists, just might be empty
      }

      if (supportsTeamRegistration) {
        try {
          await this.populateTeamMembersSheet(spreadsheetId, eventData, registrations);
          console.log('Successfully populated team members sheet');
        } catch (error) {
          console.error('Failed to populate team members sheet:', error.message);
          // Continue anyway
        }
      }

      try {
        await this.populateDashboardSheet(spreadsheetId, eventData, registrations);
        console.log('Successfully populated dashboard sheet');
      } catch (error) {
        console.error('Failed to populate dashboard sheet:', error.message);
        // Continue anyway
      }

      // Format sheets - continue even if some fail
      try {
        await this.formatRegistrationsSheet(spreadsheetId, registrationsSheetId, registrations, eventData);
        console.log('Successfully formatted registrations sheet');
      } catch (error) {
        console.error('Failed to format registrations sheet:', error.message);
        // For auto-created sheets, try basic formatting as fallback
        if (isAutoCreate && registrations.length === 0) {
          try {
            console.log('Applying fallback formatting for auto-created sheet');
            await this.formatEmptyAutoCreatedSheet(spreadsheetId, registrationsSheetId, this.prepareSheetData(eventData, registrations).headers.length);
          } catch (fallbackError) {
            console.error('Fallback formatting also failed:', fallbackError.message);
          }
        }
      }

      if (supportsTeamRegistration) {
        try {
          await this.formatTeamMembersSheet(spreadsheetId, teamMembersSheetId, registrations, eventData);
          console.log('Successfully formatted team members sheet');
        } catch (error) {
          console.error('Failed to format team members sheet:', error.message);
          // Continue anyway
        }
      }

      try {
        await this.formatDashboardSheet(spreadsheetId, dashboardSheetId);
        console.log('Successfully formatted dashboard sheet');
      } catch (error) {
        console.error('Failed to format dashboard sheet:', error.message);
        // Continue anyway
      }

      // Make the sheet publicly viewable - continue even if this fails
      try {
        await this.makeSheetPublic(spreadsheetId);
        console.log('Successfully made sheet publicly editable');
      } catch (error) {
        console.warn('Failed to make sheet public - sheet will require permission requests:', error.message);
        // Continue anyway - sheet is still created
      }

      // Get the shareable link
      const shareableLink = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;

      return {
        success: true,
        spreadsheetId,
        shareableLink,
        title: `${eventData.title} - Registrations`,
        rowCount: registrations.length,
        message: 'Google Sheet created successfully'
      };

    } catch (error) {
      console.error('Error creating Google Sheet:', error);

      // Provide specific error messages based on error type
      if (error.message.includes('Custom field') || error.message.includes('prepare sheet data')) {
        // Custom field validation errors
        throw new Error(`Sheet creation failed due to custom field issues: ${error.message}`);
      } else if (error.code === 403) {
        // Google API permission errors
        throw new Error('Sheet creation failed: Insufficient permissions to access Google Sheets API. Please check your service account credentials and permissions.');
      } else if (error.code === 401) {
        // Authentication errors
        throw new Error('Sheet creation failed: Authentication failed. Please check your Google service account credentials.');
      } else if (error.code === 429) {
        // Rate limiting errors
        throw new Error('Sheet creation failed: Google API rate limit exceeded. Please try again later.');
      } else if (error.code === 400) {
        // Bad request errors
        throw new Error(`Sheet creation failed: Invalid request to Google Sheets API. ${error.message}`);
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
        // Network errors
        throw new Error('Sheet creation failed: Network error. Please check your internet connection and try again.');
      } else if (error.message.includes('Event data is required') || error.message.includes('Registrations must be provided')) {
        // Input validation errors
        throw new Error(`Sheet creation failed: ${error.message}`);
      } else {
        // Generic errors
        throw new Error(`Sheet creation failed: ${error.message || 'Unknown error occurred'}`);
      }
    }
  }

  /**
   * Update an existing Google Sheet with new registration data
   */
  async updateEventSheet(spreadsheetId, eventData, registrations) {
    try {
      console.log(`Updating Google Sheet: ${spreadsheetId} with ${registrations.length} registrations`);

      // Prepare new data
      const sheetData = this.prepareSheetData(eventData, registrations);

      // Clear existing data (from row 4 onwards to preserve title, empty row, and headers)
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Registrations!A4:Z'
      });

      // Update the sheet with proper structure including title row
      const allData = [
        [`${eventData.title} - Event Registrations`], // Title row
        [], // Empty row
        sheetData.headers, // Header row
        ...sheetData.rows // Data rows
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Registrations!A1',
        valueInputOption: 'USER_ENTERED', // Use USER_ENTERED to process hyperlink formulas
        resource: {
          values: allData
        }
      });

      // Get the sheet information for formatting and updating other sheets
      const spreadsheetInfo = await this.sheets.spreadsheets.get({ spreadsheetId });
      const sheetId = spreadsheetInfo.data.sheets[0].properties.sheetId;
      const allSheets = spreadsheetInfo.data.sheets;

      // Re-format the sheet with proper row count (including title, empty row, and header)
      const totalRowCount = registrations.length + 3; // +3 for title, empty row, and header
      await this.formatSheet(spreadsheetId, sheetId, sheetData.headers.length, totalRowCount);

      // Check if team registrations exist
      const hasTeamRegistrations = registrations.some(reg =>
        reg.additional_info?.team_members && reg.additional_info.team_members.length > 0
      );

      // Update Team Members sheet if it exists and there are team registrations
      const teamMembersSheet = allSheets.find(sheet => sheet.properties.title === 'Team Members');
      if (teamMembersSheet && hasTeamRegistrations) {
        try {
          console.log(`Updating Team Members sheet... (${registrations.filter(r => r.additional_info?.team_members?.length > 0).length} team registrations)`);
          await this.populateTeamMembersSheet(spreadsheetId, eventData, registrations);
          console.log('✅ Team Members sheet updated successfully');
        } catch (error) {
          console.warn('⚠️ Failed to update Team Members sheet:', error.message);
          // Don't fail the whole operation if team sheet update fails
        }
      } else if (teamMembersSheet && !hasTeamRegistrations) {
        console.log('⏭️ Team Members sheet exists but no team registrations found, skipping update');
      }

      // Update Dashboard sheet if it exists
      const dashboardSheet = allSheets.find(sheet => sheet.properties.title === 'Dashboard');
      if (dashboardSheet) {
        try {
          console.log(`Updating Dashboard sheet... (${registrations.length} total registrations)`);
          await this.populateDashboardSheet(spreadsheetId, eventData, registrations);
          console.log('✅ Dashboard sheet updated successfully');
        } catch (error) {
          console.warn('⚠️ Failed to update Dashboard sheet:', error.message);
          // Don't fail the whole operation if dashboard update fails
        }
      } else {
        console.log('⏭️ No Dashboard sheet found, skipping dashboard update');
      }

      console.log(`✅ Google Sheet updated successfully: ${registrations.length} registrations, ${sheetData.headers.length} columns`);
      console.log(`📊 Updated sheets: Registrations${teamMembersSheet ? ', Team Members' : ''}${dashboardSheet ? ', Dashboard' : ''}`);

      return {
        success: true,
        spreadsheetId,
        shareableLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`,
        rowCount: registrations.length,
        message: 'Google Sheet updated successfully'
      };

    } catch (error) {
      console.error('Error updating Google Sheet:', error);
      throw new Error(`Failed to update Google Sheet: ${error.message}`);
    }
  }

  /**
   * Prepare data for the Google Sheet
   * This function is designed to be resilient - if any part fails, it will continue with available data
   */
  prepareSheetData(eventData, registrations) {
    try {
      console.log('Preparing sheet data with eventData:', JSON.stringify(eventData, null, 2));

      // Safely log sample registration
      try {
        if (registrations && registrations.length > 0) {
          console.log('Sample registration:', JSON.stringify(registrations[0], null, 2));
        }
      } catch (logError) {
        console.warn('Could not log sample registration:', logError.message);
      }

      // Ensure eventData exists and has required properties
      if (!eventData) {
        console.error('EventData is null or undefined');
        throw new Error('Event data is required');
      }

      // Ensure registrations is an array
      if (!Array.isArray(registrations)) {
        console.error('Registrations is not an array:', typeof registrations);
        throw new Error('Registrations must be an array');
      }

      // For auto-creation mode, allow empty registrations
      if (registrations.length === 0) {
        console.log('No registrations provided - creating empty sheet structure');

        // Return basic headers for empty sheet
        const headers = [
          'S.No.',
          'Name',
          'Email',
          'Phone',
          'Student ID',
          'Department',
          'Year',
          'Registration Type',
          'Registration Status',
          'Attendance Status',
          'Attendance Time',
          'Registration Date'
        ];

        // Add custom field headers if available
        if (eventData.custom_fields && Array.isArray(eventData.custom_fields)) {
          eventData.custom_fields.forEach(field => {
            if (field && field.label) {
              headers.push(field.label);
            }
          });
        }

        // Add payment headers if payment is required
        if (eventData.payment_required || eventData.requires_payment) {
          headers.push('Payment Verified', 'Payment Amount', 'Payment Screenshot');
        }

        headers.push('Notes');

        return {
          headers,
          rows: [] // Empty rows for auto-creation
        };
      }

      // Extract custom fields from event data - ensure it's an array and validate structure
      // This section is designed to never fail - if anything goes wrong, we just skip custom fields
      let customFields = [];
      try {
        if (eventData.custom_fields) {
          console.log('Raw custom_fields:', JSON.stringify(eventData.custom_fields, null, 2));

          if (Array.isArray(eventData.custom_fields)) {
            customFields = eventData.custom_fields.filter(field => {
              try {
                // Validate each custom field has required properties
                if (!field || typeof field !== 'object') {
                  console.warn('Invalid custom field (not an object):', field);
                  return false;
                }
                if (!field.id || typeof field.id !== 'string') {
                  console.warn('Invalid custom field (missing or invalid id):', field);
                  return false;
                }
                if (!field.label || typeof field.label !== 'string') {
                  console.warn('Invalid custom field (missing or invalid label):', field);
                  return false;
                }
                console.log(`Valid custom field found: ${field.id} - ${field.label}`);
                return true;
              } catch (fieldError) {
                console.warn('Error validating custom field:', fieldError.message, field);
                return false;
              }
            });
          } else {
            console.warn('custom_fields is not an array:', typeof eventData.custom_fields, eventData.custom_fields);
          }
        } else {
          console.log('No custom_fields found in eventData');
        }
      } catch (error) {
        console.error('Error processing custom fields - continuing without custom fields:', error.message);
        customFields = [];
      }

      console.log('Valid custom fields found:', customFields.length);
      if (customFields.length > 0) {
        console.log('Custom field details:', customFields.map(f => `${f.id}:${f.label}`));
      }

      // Check if any registration has payment information - with error handling
      let hasPaymentInfo = false;
      try {
        hasPaymentInfo = registrations.some(reg => {
          try {
            return reg.payment_screenshot_url || reg.payment_status || reg.payment_amount;
          } catch (regError) {
            console.warn('Error checking payment info for registration:', regError.message);
            return false;
          }
        });
      } catch (error) {
        console.warn('Error checking payment information - continuing without payment info:', error.message);
        hasPaymentInfo = false;
      }

      // Check payment requirement - handle both property names for backward compatibility
      let paymentRequired = false;
      try {
        paymentRequired = eventData.payment_required || eventData.requires_payment || false;
      } catch (error) {
        console.warn('Error checking payment requirement - assuming no payment required:', error.message);
        paymentRequired = false;
      }

      // Build headers - with error handling
      const headers = [
        'S.No.',
        'Name',
        'Email',
        'Phone',
        'Student ID',
        'Department',
        'Year',
        'Registration Type',
        'Registration Status',
        'Attendance Status',
        'Attendance Time',
        'Registration Date'
      ];

      // Add custom field headers - with comprehensive error handling
      if (customFields && customFields.length > 0) {
        customFields.forEach((field, index) => {
          try {
            if (field && field.label && typeof field.label === 'string') {
              headers.push(field.label);
              console.log(`Added custom field header: ${field.label}`);
            } else {
              console.warn(`Invalid custom field at index ${index}:`, field);
              headers.push(`Custom Field ${index + 1}`);
            }
          } catch (error) {
            console.error(`Error adding custom field header at index ${index}:`, error.message);
            headers.push(`Custom Field ${index + 1} (Error)`);
          }
        });
      }

      // Note: Team information is handled in the separate Team Members sheet

      // Add payment headers if needed - simplified as requested
      try {
        if (hasPaymentInfo || paymentRequired) {
          headers.push('Payment Verified', 'Payment Amount', 'Payment Screenshot');
          console.log('Added simplified payment headers to sheet');
        }
      } catch (error) {
        console.warn('Error adding payment headers - continuing without payment columns:', error.message);
      }

      headers.push('Notes');

      // Build rows
      const rows = registrations.map((reg, index) => {
        try {
          // Validate registration object
          if (!reg || typeof reg !== 'object') {
            console.error(`Invalid registration at index ${index}:`, reg);
            throw new Error(`Registration ${index + 1} is not a valid object`);
          }

          if (!reg.participant_name || !reg.participant_email) {
            console.error(`Registration ${index + 1} missing required fields:`, {
              name: reg.participant_name,
              email: reg.participant_email
            });
            throw new Error(`Registration ${index + 1} is missing required participant name or email`);
          }

          console.log(`Processing registration ${index + 1}:`, reg.participant_name);

          // Format attendance timestamp
          let attendanceTime = 'N/A';
          if (reg.attendance_timestamp) {
            try {
              attendanceTime = new Date(reg.attendance_timestamp).toLocaleString('en-IN');
            } catch (e) {
              console.warn(`Error formatting attendance timestamp for ${reg.participant_name}:`, e);
            }
          }

          const row = [
            index + 1,
            reg.participant_name || 'N/A',
            reg.participant_email || 'N/A',
            reg.participant_phone || 'N/A',
            reg.participant_student_id || reg.participant_id || 'N/A',
            reg.participant_department || reg.additional_info?.department || 'N/A',
            reg.participant_year || reg.additional_info?.year || 'N/A',
            reg.registration_type || 'Individual',
            reg.status === 'registered' ? 'Confirmed' : (reg.status || 'Confirmed'),
            reg.attendance_status === 'attended' ? 'Attended' : 'Not Attended',
            attendanceTime,
            reg.created_at ? new Date(reg.created_at).toLocaleString('en-IN') : 'N/A'
          ];

          // Add custom field values
          customFields.forEach((field, fieldIndex) => {
            try {
              // Extra safety check for field object
              if (!field || !field.id) {
                console.warn(`Invalid field at index ${fieldIndex}:`, field);
                row.push('N/A');
                return;
              }

              // Safely access custom field value
              let customFieldValue;
              try {
                customFieldValue = reg.additional_info?.custom_fields?.[field.id];
              } catch (accessError) {
                console.warn(`Error accessing custom field ${field.id} for ${reg.participant_name}:`, accessError);
                customFieldValue = undefined;
              }

              let displayValue = 'N/A';

              console.log(`Processing custom field ${field.id} (${field.label}) for ${reg.participant_name}:`, customFieldValue, 'Type:', typeof customFieldValue);

              if (customFieldValue !== undefined && customFieldValue !== null && customFieldValue !== '') {
                try {
                  if (Array.isArray(customFieldValue)) {
                    // For checkbox fields that store arrays
                    displayValue = customFieldValue.length > 0 ? customFieldValue.join(', ') : 'N/A';
                  } else {
                    displayValue = String(customFieldValue);
                  }
                } catch (conversionError) {
                  console.warn(`Error converting custom field value for ${field.id}:`, conversionError);
                  displayValue = 'N/A';
                }
              }

              row.push(displayValue);
            } catch (error) {
              console.error(`Error processing custom field at index ${fieldIndex}:`, error);
              row.push('N/A');
            }
          });

          // Team information is handled in the separate Team Members sheet

          // Add simplified payment information - with error handling
          try {
            if (hasPaymentInfo || paymentRequired) {
              // Payment verification status (Yes/No instead of Verified/Pending)
              let paymentVerified = 'No';
              try {
                if (reg.payment_status === 'verified') {
                  paymentVerified = 'Yes';
                }
              } catch (statusError) {
                console.warn(`Error processing payment verification for ${reg.participant_name}:`, statusError.message);
              }

              // Payment amount
              let paymentAmount = 'N/A';
              try {
                if (reg.payment_amount) {
                  paymentAmount = `₹${reg.payment_amount}`;
                } else if (eventData.payment_amount) {
                  paymentAmount = `₹${eventData.payment_amount}`;
                }
              } catch (amountError) {
                console.warn(`Error processing payment amount for ${reg.participant_name}:`, amountError.message);
              }

              // Payment screenshot - store URL for hyperlink processing later
              let paymentScreenshot = 'N/A';
              try {
                if (reg.payment_screenshot_url && reg.payment_screenshot_url !== 'N/A') {
                  paymentScreenshot = reg.payment_screenshot_url; // Store URL for hyperlink processing
                }
              } catch (screenshotError) {
                console.warn(`Error processing payment screenshot for ${reg.participant_name}:`, screenshotError.message);
              }

              row.push(paymentVerified, paymentAmount, paymentScreenshot);
            }
          } catch (error) {
            console.warn(`Error processing payment information for ${reg.participant_name}:`, error.message);
          }

          // Add notes column
          row.push('');

          return row;
        } catch (error) {
          console.error(`Error processing registration ${index + 1}:`, error);
          // Return a basic row with error indication
          const errorRow = [
            index + 1,
            reg.participant_name || 'N/A',
            reg.participant_email || 'N/A',
            'ERROR',
            'ERROR',
            'ERROR',
            'ERROR',
            'ERROR',
            'ERROR',
            'ERROR'
          ];

          // Add empty values for custom fields
          customFields.forEach(() => errorRow.push('ERROR'));

          // Add empty values for simplified payment fields if needed
          if (hasPaymentInfo || paymentRequired) {
            errorRow.push('ERROR', 'ERROR', 'ERROR'); // Payment Verified, Payment Amount, Payment Screenshot
          }

          errorRow.push('Processing Error');
          return errorRow;
        }
      });

      return { headers, rows };
    } catch (error) {
      console.error('Error in prepareSheetData:', error);

      // Provide more specific error information
      if (error.message.includes('Custom field')) {
        throw new Error(`Custom field processing error: ${error.message}`);
      } else if (error.message.includes('Event data is required')) {
        throw new Error(`Event data validation error: ${error.message}`);
      } else if (error.message.includes('payment')) {
        throw new Error(`Payment data processing error: ${error.message}`);
      } else {
        throw new Error(`Data preparation failed: ${error.message}. Please check your event data and registration information.`);
      }
    }
  }

  /**
   * Populate the sheet with data including title
   */
  async populateSheet(spreadsheetId, sheetData, eventTitle) {
    // Add title row, empty row, then headers and data
    const allData = [
      [`${eventTitle} - Event Registrations`], // Title row
      [], // Empty row
      sheetData.headers, // Header row
      ...sheetData.rows // Data rows
    ];

    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Registrations!A1',
      valueInputOption: 'RAW',
      resource: {
        values: allData
      }
    });
  }

  /**
   * Format the Google Sheet to match Excel styling
   */
  async formatSheet(spreadsheetId, sheetId, columnCount, rowCount) {
    const titleRowIndex = 0;
    const headerRowIndex = 2; // After title and empty row

    const requests = [
      // Freeze header row (row 3, which is index 2)
      {
        updateSheetProperties: {
          properties: {
            sheetId: sheetId,
            gridProperties: {
              frozenRowCount: 3
            }
          },
          fields: 'gridProperties.frozenRowCount'
        }
      },
      // Format title row
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: titleRowIndex,
            endRowIndex: titleRowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.267, green: 0.329, blue: 0.416 }, // #44546A (dark blue-gray)
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontFamily: 'Arial',
                fontSize: 14
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      // Format header row with Excel-like styling (blue background #5B9BD5)
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: headerRowIndex,
            endRowIndex: headerRowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.357, green: 0.608, blue: 0.835 }, // #5B9BD5
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontFamily: 'Arial',
                fontSize: 11
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              borders: {
                top: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                bottom: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                left: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                right: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } }
              }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
        }
      },
      // Apply base formatting to data rows
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 3, // Start after title, empty row, and header
            endRowIndex: rowCount,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                fontFamily: 'Arial',
                fontSize: 10
              },
              borders: {
                top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } }
              }
            }
          },
          fields: 'userEnteredFormat(textFormat,borders)'
        }
      }
    ];

    // Add alternating row colors for data rows only
    const dataRowCount = rowCount - 3; // Subtract title, empty row, and header
    for (let i = 0; i < dataRowCount; i++) {
      const actualRowIndex = i + 3; // Start from row 4 (index 3)
      const isEvenDataRow = i % 2 === 0;
      const backgroundColor = isEvenDataRow
        ? { red: 1, green: 1, blue: 1 } // White for even data rows
        : { red: 0.949, green: 0.949, blue: 0.949 }; // #F2F2F2 for odd data rows

      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: actualRowIndex,
            endRowIndex: actualRowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: backgroundColor
            }
          },
          fields: 'userEnteredFormat.backgroundColor'
        }
      });
    }

    // Set specific column widths for better readability
    const columnWidths = [
      { index: 0, width: 80 },   // S.No.
      { index: 1, width: 200 },  // Name
      { index: 2, width: 250 },  // Email
      { index: 3, width: 150 },  // Phone
      { index: 4, width: 120 },  // Student ID
      { index: 5, width: 150 },  // Department
      { index: 6, width: 80 },   // Year
      { index: 7, width: 120 },  // Type
      { index: 8, width: 130 },  // Registration Status
      { index: 9, width: 130 },  // Attendance Status
      { index: 10, width: 180 }, // Attendance Time
      { index: 11, width: 180 }  // Registration Date
    ];

    columnWidths.forEach(({ index, width }) => {
      if (index < columnCount) {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'COLUMNS',
              startIndex: index,
              endIndex: index + 1
            },
            properties: {
              pixelSize: width
            },
            fields: 'pixelSize'
          }
        });
      }
    });

    // Center align specific columns (S.No., Student ID, Year, Type, Registration Status, Attendance Status) for data rows only
    const centerAlignColumns = [0, 4, 6, 7, 8, 9];
    centerAlignColumns.forEach(colIndex => {
      if (colIndex < columnCount) {
        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: 3, // Start from data rows
              endRowIndex: rowCount,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
          }
        });
      }
    });

    // Merge cells for the title row
    requests.push({
      mergeCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: columnCount
        },
        mergeType: 'MERGE_ALL'
      }
    });

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests }
    });
  }

  /**
   * Populate the Registrations sheet
   */
  async populateRegistrationsSheet(spreadsheetId, eventData, registrations, isAutoCreate = false) {
    const sheetData = this.prepareSheetData(eventData, registrations);

    const allData = [
      [`${eventData.title} - Event Registrations`], // Title row
      [], // Empty row
      sheetData.headers, // Header row
      ...sheetData.rows // Data rows
    ];

    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Registrations!A1',
      valueInputOption: 'USER_ENTERED', // Changed to USER_ENTERED to process hyperlink formulas
      resource: {
        values: allData
      }
    });

    // Note: Formatting is handled in the main createEventSheet method
  }

  /**
   * Format empty auto-created sheet with basic styling
   */
  async formatEmptyAutoCreatedSheet(spreadsheetId, sheetId, columnCount) {
    const requests = [
      // Freeze header row (row 3, which is index 2)
      {
        updateSheetProperties: {
          properties: {
            sheetId: sheetId,
            gridProperties: {
              frozenRowCount: 3
            }
          },
          fields: 'gridProperties.frozenRowCount'
        }
      },
      // Format title row
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.267, green: 0.447, blue: 0.769 }, // #4472C4
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontFamily: 'Arial',
                fontSize: 16
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      // Merge title row
      {
        mergeCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          mergeType: 'MERGE_ALL'
        }
      },
      // Format header row
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 2,
            endRowIndex: 3,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.357, green: 0.608, blue: 0.835 }, // #5B9BD5
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontFamily: 'Arial',
                fontSize: 11
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              borders: {
                top: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                bottom: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                left: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                right: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } }
              }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
        }
      }
    ];

    // Set column widths
    const columnWidths = [
      { index: 0, width: 80 },   // S.No.
      { index: 1, width: 200 },  // Name
      { index: 2, width: 250 },  // Email
      { index: 3, width: 150 },  // Phone
      { index: 4, width: 120 },  // Student ID
      { index: 5, width: 150 },  // Department
      { index: 6, width: 80 },   // Year
      { index: 7, width: 120 },  // Type
      { index: 8, width: 130 },  // Registration Status
      { index: 9, width: 130 },  // Attendance Status
      { index: 10, width: 180 }, // Attendance Time
      { index: 11, width: 180 }  // Registration Date
    ];

    columnWidths.forEach(({ index, width }) => {
      if (index < columnCount) {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'COLUMNS',
              startIndex: index,
              endIndex: index + 1
            },
            properties: {
              pixelSize: width
            },
            fields: 'pixelSize'
          }
        });
      }
    });

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests }
    });
  }

  /**
   * Populate the Team Members sheet with clean professional formatting
   */
  async populateTeamMembersSheet(spreadsheetId, eventData, registrations) {
    const teamData = [
      [`TEAM MEMBERS DETAILS`], // Title row
      [`Event: ${eventData.title}`], // Event info
      [`Generated: ${new Date().toLocaleString('en-IN')}`], // Generated date
      [], // Empty row
      ['Team #', 'Team Name', 'Role', 'Member Name', 'Scholar ID', 'Department', 'Year'] // Headers
    ];

    // For events that support both solo and team registration, include all registrations
    const supportsTeamRegistration = eventData.participation_type === 'team' || eventData.participation_type === 'both';
    let teamNumber = 1;

    registrations.forEach(reg => {
      // Check if this is a team registration with actual team members
      const hasTeamMembers = reg.additional_info?.team_members?.length > 0;

      if (hasTeamMembers) {
        // Handle team registrations with clean structure
        const teamName = reg.additional_info.team_name || `Team ${reg.participant_name}`;

        // Add team lead
        teamData.push([
          teamNumber,
          teamName,
          'Team Lead',
          reg.participant_name,
          reg.participant_id || reg.participant_student_id || 'N/A',
          reg.additional_info?.department || reg.participant_department || 'N/A',
          reg.additional_info?.year || reg.participant_year || 'N/A'
        ]);

        // Add team members
        reg.additional_info.team_members.forEach((member) => {
          teamData.push([
            teamNumber,
            teamName,
            'Member',
            member.name || 'N/A',
            member.rollNumber || member.scholar_id || 'N/A',
            member.department || 'N/A',
            member.year || 'N/A'
          ]);
        });

        // Add separator row for visual separation
        teamData.push(['', '', '', '', '', '', '']);
        teamNumber++;
      } else if (supportsTeamRegistration && eventData.participation_type === 'both') {
        // For events with both solo/team registration, include individual registrations
        const individualTeamName = `Individual - ${reg.participant_name}`;

        teamData.push([
          teamNumber,
          individualTeamName,
          'Individual',
          reg.participant_name,
          reg.participant_id || reg.participant_student_id || 'N/A',
          reg.additional_info?.department || reg.participant_department || 'N/A',
          reg.additional_info?.year || reg.participant_year || 'N/A'
        ]);

        // Add separator row
        teamData.push(['', '', '', '', '', '', '']);
        teamNumber++;
      }
    });

    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Team Members!A1',
      valueInputOption: 'RAW',
      resource: {
        values: teamData
      }
    });
  }

  /**
   * Populate the Dashboard sheet
   */
  async populateDashboardSheet(spreadsheetId, eventData, registrations) {
    // Clear existing dashboard data first to prevent duplicates
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Dashboard!A1:Z'
      });
    } catch (clearError) {
      console.warn('Warning: Could not clear Dashboard sheet, continuing with update:', clearError.message);
    }

    // Calculate statistics
    const totalRegistrations = registrations.length;
    let totalTeamMembers = 0;
    const departmentCounts = {};
    const yearCounts = {};

    // Calculate attendance statistics
    const attendedCount = registrations.filter(reg => reg.attendance_status === 'attended').length;
    const notAttendedCount = totalRegistrations - attendedCount;
    const attendanceRate = totalRegistrations > 0 ? ((attendedCount / totalRegistrations) * 100).toFixed(1) : '0.0';

    registrations.forEach(reg => {
      // Count departments
      const dept = reg.additional_info?.department || 'Unknown';
      departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;

      // Count years
      const year = reg.additional_info?.year || 'Unknown';
      yearCounts[year] = (yearCounts[year] || 0) + 1;

      // Count team members
      if (reg.additional_info?.team_members?.length > 0) {
        totalTeamMembers += reg.additional_info.team_members.length;

        // Count team member departments and years
        reg.additional_info.team_members.forEach(member => {
          const memberDept = member.department || 'Unknown';
          const memberYear = member.year || 'Unknown';
          departmentCounts[memberDept] = (departmentCounts[memberDept] || 0) + 1;
          yearCounts[memberYear] = (yearCounts[memberYear] || 0) + 1;
        });
      }
    });

    const totalParticipants = totalRegistrations + totalTeamMembers;

    const dashboardData = [
      ['EVENT REGISTRATION DASHBOARD'], // Title
      [`Event: ${eventData.title}`], // Event info
      [`Generated: ${new Date().toLocaleString('en-IN')}`], // Generated date
      [], // Empty row
      ['PARTICIPANT SUMMARY'], // Section header
      [], // Empty row
      ['Total Participants', totalParticipants],
      ['Total Registrations', totalRegistrations],
      ['Total Team Members', totalTeamMembers],
      [], // Empty row
      ['ATTENDANCE SUMMARY'], // Section header
      [], // Empty row
      ['Total Attended', attendedCount],
      ['Not Attended', notAttendedCount],
      ['Attendance Rate', `${attendanceRate}%`],
      [], // Empty row
      ['DEPARTMENT DISTRIBUTION'], // Section header
      [], // Empty row
      ['Department', 'Count', 'Percentage'] // Headers
    ];

    // Add department data
    Object.entries(departmentCounts).forEach(([dept, count]) => {
      const percentage = ((count / totalParticipants) * 100).toFixed(1);
      dashboardData.push([dept, count, `${percentage}%`]);
    });

    dashboardData.push([]); // Empty row
    dashboardData.push(['YEAR DISTRIBUTION']); // Section header
    dashboardData.push([]); // Empty row
    dashboardData.push(['Year', 'Count', 'Percentage']); // Headers

    // Add year data
    Object.entries(yearCounts).forEach(([year, count]) => {
      const percentage = ((count / totalParticipants) * 100).toFixed(1);
      dashboardData.push([year, count, `${percentage}%`]);
    });

    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Dashboard!A1',
      valueInputOption: 'RAW',
      resource: {
        values: dashboardData
      }
    });
  }

  /**
   * Format the Registrations sheet
   */
  async formatRegistrationsSheet(spreadsheetId, sheetId, registrations, eventData) {
    const sheetData = this.prepareSheetData(eventData || { custom_fields: [] }, registrations);
    const columnCount = sheetData.headers.length;
    const rowCount = registrations.length + 3; // Title, empty row, header, data

    const requests = [
      // Freeze header row
      {
        updateSheetProperties: {
          properties: {
            sheetId: sheetId,
            gridProperties: {
              frozenRowCount: 3
            }
          },
          fields: 'gridProperties.frozenRowCount'
        }
      },
      // Format title row
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.267, green: 0.447, blue: 0.769 }, // #4472C4
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontFamily: 'Arial',
                fontSize: 16
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      // Merge title row
      {
        mergeCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          mergeType: 'MERGE_ALL'
        }
      },
      // Format header row
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 2,
            endRowIndex: 3,
            startColumnIndex: 0,
            endColumnIndex: columnCount
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.357, green: 0.608, blue: 0.835 }, // #5B9BD5
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontFamily: 'Arial',
                fontSize: 11
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              borders: {
                top: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                bottom: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                left: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                right: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } }
              }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
        }
      }
    ];

    // Add alternating row colors for data rows (only if there are registrations)
    if (registrations.length > 0) {
      for (let i = 0; i < registrations.length; i++) {
        const actualRowIndex = i + 3; // Start from row 4 (index 3)
        const isEvenDataRow = i % 2 === 0;
        const backgroundColor = isEvenDataRow
          ? { red: 1, green: 1, blue: 1 } // White for even data rows
          : { red: 0.949, green: 0.949, blue: 0.949 }; // #F2F2F2 for odd data rows

        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: actualRowIndex,
              endRowIndex: actualRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: columnCount
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: backgroundColor,
                textFormat: {
                  fontFamily: 'Arial',
                  fontSize: 10
                }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        });
      }
    }

    // Add hyperlinks for payment screenshots (only if there are registrations)
    if (registrations.length > 0) {
      const paymentRequired = eventData.payment_required || eventData.requires_payment || false;
      const paymentScreenshotColumnIndex = sheetData.headers.indexOf('Payment Screenshot');

      if (paymentScreenshotColumnIndex !== -1 && paymentRequired) {
        for (let i = 0; i < registrations.length; i++) {
          const reg = registrations[i];
          const rowIndex = i + 3; // Start from row 4 (index 3) after title, empty row, and header

          // Only add hyperlink if there's a valid payment screenshot URL
          if (reg.payment_screenshot_url && reg.payment_screenshot_url !== 'N/A' && reg.payment_screenshot_url.startsWith('http')) {
            requests.push({
              updateCells: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: rowIndex,
                  endRowIndex: rowIndex + 1,
                  startColumnIndex: paymentScreenshotColumnIndex,
                  endColumnIndex: paymentScreenshotColumnIndex + 1
                },
                rows: [{
                  values: [{
                    userEnteredValue: {
                      formulaValue: `=HYPERLINK("${reg.payment_screenshot_url}", "View Payment")`
                    },
                    userEnteredFormat: {
                      textFormat: {
                        foregroundColor: { red: 0.0, green: 0.6, blue: 0.0 }, // Green color for payment links
                        underline: true
                      }
                    }
                  }]
                }],
                fields: 'userEnteredValue,userEnteredFormat.textFormat'
              }
            });
          }
        }
      }
    }

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests }
    });
  }

  /**
   * Format the Team Members sheet with clean professional styling
   */
  async formatTeamMembersSheet(spreadsheetId, sheetId, registrations, eventData) {
    // Count total team member rows for formatting
    let totalTeamMemberRows = 0;
    const supportsTeamRegistration = eventData?.participation_type === 'team' || eventData?.participation_type === 'both';

    registrations.forEach(reg => {
      const hasTeamMembers = reg.additional_info?.team_members?.length > 0;

      if (hasTeamMembers) {
        totalTeamMemberRows += 1 + reg.additional_info.team_members.length + 1; // team lead + members + separator
      } else if (supportsTeamRegistration && eventData?.participation_type === 'both') {
        totalTeamMemberRows += 2; // individual participant + separator
      }
    });

    const requests = [
      // Freeze header row
      {
        updateSheetProperties: {
          properties: {
            sheetId: sheetId,
            gridProperties: {
              frozenRowCount: 5
            }
          },
          fields: 'gridProperties.frozenRowCount'
        }
      },
      // Format title row
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 7
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.267, green: 0.447, blue: 0.769 }, // #4472C4
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontFamily: 'Arial',
                fontSize: 16
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      // Merge title row
      {
        mergeCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 7
          },
          mergeType: 'MERGE_ALL'
        }
      },
      // Format header row with enhanced styling
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 4,
            endRowIndex: 5,
            startColumnIndex: 0,
            endColumnIndex: 7
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.439, green: 0.678, blue: 0.278 }, // #70AD47 (green for team members)
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontFamily: 'Arial',
                fontSize: 11
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              borders: {
                top: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                bottom: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                left: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                right: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } }
              }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
        }
      },
      // Set column widths for better readability
      {
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 1
          },
          properties: {
            pixelSize: 80 // Team #
          },
          fields: 'pixelSize'
        }
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: 1,
            endIndex: 2
          },
          properties: {
            pixelSize: 220 // Team Name
          },
          fields: 'pixelSize'
        }
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: 2,
            endIndex: 3
          },
          properties: {
            pixelSize: 120 // Role
          },
          fields: 'pixelSize'
        }
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: 3,
            endIndex: 4
          },
          properties: {
            pixelSize: 200 // Member Name
          },
          fields: 'pixelSize'
        }
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: 4,
            endIndex: 5
          },
          properties: {
            pixelSize: 120 // Scholar ID
          },
          fields: 'pixelSize'
        }
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: 5,
            endIndex: 6
          },
          properties: {
            pixelSize: 120 // Department
          },
          fields: 'pixelSize'
        }
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: sheetId,
            dimension: 'COLUMNS',
            startIndex: 6,
            endIndex: 7
          },
          properties: {
            pixelSize: 80 // Year
          },
          fields: 'pixelSize'
        }
      }
    ];

    // Add professional styling for data rows with alternating colors and special formatting for team leads
    let currentRowIndex = 5; // Start after headers
    let teamRowCount = 0;

    registrations.forEach(reg => {
      const hasTeamMembers = reg.additional_info?.team_members?.length > 0;

      if (hasTeamMembers) {
        // Format team lead row with special styling (light blue background)
        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: currentRowIndex,
              endRowIndex: currentRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 7
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.847, green: 0.918, blue: 0.988 }, // Light blue #D8EAFC for team leads
                textFormat: {
                  bold: true,
                  fontFamily: 'Arial',
                  fontSize: 10,
                  foregroundColor: { red: 0.267, green: 0.447, blue: 0.769 } // Dark blue text
                },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE',
                borders: {
                  top: { style: 'SOLID', width: 1, color: { red: 0.6, green: 0.6, blue: 0.6 } },
                  bottom: { style: 'SOLID', width: 1, color: { red: 0.6, green: 0.6, blue: 0.6 } },
                  left: { style: 'SOLID', width: 1, color: { red: 0.6, green: 0.6, blue: 0.6 } },
                  right: { style: 'SOLID', width: 1, color: { red: 0.6, green: 0.6, blue: 0.6 } }
                }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
          }
        });
        currentRowIndex++;

        // Format team member rows with alternating colors
        reg.additional_info.team_members.forEach((member, memberIndex) => {
          const isEvenMember = memberIndex % 2 === 0;
          const backgroundColor = isEvenMember
            ? { red: 0.949, green: 0.976, blue: 0.929 } // Light green #F2F9ED for even members
            : { red: 1, green: 1, blue: 1 }; // White for odd members

          requests.push({
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: currentRowIndex,
                endRowIndex: currentRowIndex + 1,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: backgroundColor,
                  textFormat: {
                    fontFamily: 'Arial',
                    fontSize: 10,
                    foregroundColor: { red: 0.2, green: 0.2, blue: 0.2 } // Dark gray text
                  },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE',
                  borders: {
                    top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
                    right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } }
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
            }
          });
          currentRowIndex++;
        });

        // Skip separator row
        currentRowIndex++;
      } else if (supportsTeamRegistration && eventData?.participation_type === 'both') {
        // Format individual participant row with orange tint
        requests.push({
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: currentRowIndex,
              endRowIndex: currentRowIndex + 1,
              startColumnIndex: 0,
              endColumnIndex: 7
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.996, green: 0.929, blue: 0.847 }, // Light orange #FED7B8 for individuals
                textFormat: {
                  bold: true,
                  fontFamily: 'Arial',
                  fontSize: 10,
                  foregroundColor: { red: 0.929, green: 0.490, blue: 0.192 } // Orange text
                },
                horizontalAlignment: 'LEFT',
                verticalAlignment: 'MIDDLE',
                borders: {
                  top: { style: 'SOLID', width: 1, color: { red: 0.6, green: 0.6, blue: 0.6 } },
                  bottom: { style: 'SOLID', width: 1, color: { red: 0.6, green: 0.6, blue: 0.6 } },
                  left: { style: 'SOLID', width: 1, color: { red: 0.6, green: 0.6, blue: 0.6 } },
                  right: { style: 'SOLID', width: 1, color: { red: 0.6, green: 0.6, blue: 0.6 } }
                }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
          }
        });

        currentRowIndex += 2; // individual participant + separator
      }
    });

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests }
    });
  }

  /**
   * Format the Dashboard sheet
   */
  async formatDashboardSheet(spreadsheetId, sheetId) {
    const requests = [
      // Format title row
      {
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 5
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.929, green: 0.490, blue: 0.192 }, // #ED7D31
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontFamily: 'Arial',
                fontSize: 16
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      // Merge title row
      {
        mergeCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 5
          },
          mergeType: 'MERGE_ALL'
        }
      }
    ];

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests }
    });
  }

  /**
   * Make the sheet publicly editable by anyone
   */
  async makeSheetPublic(spreadsheetId) {
    try {
      await this.drive.permissions.create({
        fileId: spreadsheetId,
        resource: {
          role: 'writer', // Changed from 'reader' to 'writer' for edit access
          type: 'anyone'
        }
      });
      console.log(`Made sheet ${spreadsheetId} publicly editable`);
    } catch (error) {
      console.warn(`Could not make sheet public: ${error.message}`);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Get sheet information
   */
  async getSheetInfo(spreadsheetId) {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId
      });

      return {
        success: true,
        title: response.data.properties.title,
        shareableLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`,
        createdTime: response.data.properties.createdTime,
        lastModified: response.data.properties.updatedTime
      };
    } catch (error) {
      console.error('Error getting sheet info:', error);
      throw new Error(`Failed to get sheet information: ${error.message}`);
    }
  }

  /**
   * Delete a Google Sheet
   */
  async deleteSheet(spreadsheetId) {
    try {
      await this.drive.files.delete({
        fileId: spreadsheetId
      });

      return {
        success: true,
        message: 'Sheet deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting sheet:', error);
      throw new Error(`Failed to delete sheet: ${error.message}`);
    }
  }
}

export default new SheetsService();
