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
  async createEventSheet(eventData, registrations) {
    try {
      console.log(`Creating Google Sheet for event: ${eventData.title}`);

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
      if (registrations.length === 0) {
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

      // Only add Team Members sheet if there are team registrations
      if (hasTeamRegistrations) {
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

      if (hasTeamRegistrations) {
        teamMembersSheetId = spreadsheetResponse.data.sheets[1].properties.sheetId;
        dashboardSheetId = spreadsheetResponse.data.sheets[2].properties.sheetId;
      } else {
        dashboardSheetId = spreadsheetResponse.data.sheets[1].properties.sheetId;
      }

      // Populate sheets - continue even if some fail
      try {
        await this.populateRegistrationsSheet(spreadsheetId, eventData, registrations);
        console.log('Successfully populated registrations sheet');
      } catch (error) {
        console.error('Failed to populate registrations sheet:', error.message);
        // Continue anyway - the sheet exists, just might be empty
      }

      if (hasTeamRegistrations) {
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
        // Continue anyway
      }

      if (hasTeamRegistrations) {
        try {
          await this.formatTeamMembersSheet(spreadsheetId, teamMembersSheetId, registrations);
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
      console.log(`Updating Google Sheet: ${spreadsheetId}`);

      // Clear existing data (except headers)
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Registrations!A2:Z'
      });

      // Prepare new data
      const sheetData = this.prepareSheetData(eventData, registrations);

      // Update with new data
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Registrations!A1',
        valueInputOption: 'RAW',
        resource: {
          values: [sheetData.headers, ...sheetData.rows]
        }
      });

      // Get the sheet ID for formatting
      const spreadsheetInfo = await this.sheets.spreadsheets.get({ spreadsheetId });
      const sheetId = spreadsheetInfo.data.sheets[0].properties.sheetId;

      // Re-format the sheet
      await this.formatSheet(spreadsheetId, sheetId, sheetData.headers.length, registrations.length);

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

      if (registrations.length === 0) {
        console.error('No registrations provided');
        throw new Error('At least one registration is required');
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

      // Add payment headers if needed - with error handling
      try {
        if (hasPaymentInfo || paymentRequired) {
          headers.push('Payment Status', 'Payment Amount');

          // Check for payment QR code or UPI ID safely
          try {
            if (eventData.payment_qr_code || eventData.payment_upi_id) {
              headers.push('Payment Link');
            }
          } catch (paymentLinkError) {
            console.warn('Error checking payment link info:', paymentLinkError.message);
          }

          headers.push('Payment Screenshot');
          console.log('Added payment headers to sheet');
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

              console.log(`Processing custom field ${field.id} for ${reg.participant_name}:`, customFieldValue);

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

          // Add payment information - with error handling
          try {
            if (hasPaymentInfo || paymentRequired) {
              // Payment status
              let paymentStatus = 'Pending';
              try {
                if (reg.payment_status) {
                  paymentStatus = reg.payment_status.charAt(0).toUpperCase() + reg.payment_status.slice(1);
                }
              } catch (statusError) {
                console.warn(`Error processing payment status for ${reg.participant_name}:`, statusError.message);
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

              row.push(paymentStatus, paymentAmount);

              // Add payment link if event has payment info
              try {
                if (eventData.payment_qr_code || eventData.payment_upi_id) {
                  row.push('Payment Link'); // We'll add the hyperlink later via batchUpdate
                }
              } catch (linkError) {
                console.warn(`Error processing payment link for ${reg.participant_name}:`, linkError.message);
              }

              // Payment screenshot
              try {
                row.push(reg.payment_screenshot_url || 'N/A');
              } catch (screenshotError) {
                console.warn(`Error processing payment screenshot for ${reg.participant_name}:`, screenshotError.message);
                row.push('N/A');
              }
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

          // Add empty values for payment fields if needed
          if (hasPaymentInfo || paymentRequired) {
            errorRow.push('ERROR', 'ERROR');
            if (eventData.payment_qr_code || eventData.payment_upi_id) {
              errorRow.push('ERROR');
            }
            errorRow.push('ERROR');
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
  async populateRegistrationsSheet(spreadsheetId, eventData, registrations) {
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
  }

  /**
   * Populate the Team Members sheet
   */
  async populateTeamMembersSheet(spreadsheetId, eventData, registrations) {
    const teamData = [
      [`TEAM MEMBERS DETAILS`], // Title row
      [`Event: ${eventData.title}`], // Event info
      [`Generated: ${new Date().toLocaleString('en-IN')}`], // Generated date
      [], // Empty row
      ['Serial No.', 'Team Name', 'Team Lead', 'Team Lead Email', 'Team Lead Phone', 'Member Name', 'Scholar ID', 'Department', 'Year', 'Notes'] // Headers
    ];

    // Add team member data
    let serialNo = 1;
    registrations.forEach(reg => {
      if (reg.additional_info?.team_members?.length > 0) {
        const teamName = reg.additional_info.team_name || `Team ${reg.participant_name}`;
        const teamLead = reg.participant_name;
        const teamLeadEmail = reg.participant_email;
        const teamLeadPhone = reg.participant_phone || 'N/A';

        // Add team lead as first member
        teamData.push([
          serialNo++,
          teamName,
          teamLead,
          teamLeadEmail,
          teamLeadPhone,
          teamLead,
          reg.participant_id || 'N/A',
          reg.additional_info?.department || 'N/A',
          reg.additional_info?.year || 'N/A',
          'Team Lead'
        ]);

        // Add team members
        reg.additional_info.team_members.forEach(member => {
          teamData.push([
            serialNo++,
            teamName,
            teamLead,
            teamLeadEmail,
            teamLeadPhone,
            member.name || 'N/A',
            member.rollNumber || 'N/A',
            member.department || 'N/A',
            member.year || 'N/A',
            'Team Member'
          ]);
        });

        // Add separator row
        teamData.push(['', '', '', '', '', '', '', '', '', '']);
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

    // Add alternating row colors for data rows
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

    // Add hyperlinks for payment links if event has payment info
    // Handle both property names for backward compatibility
    const paymentRequired = eventData.payment_required || eventData.requires_payment || false;
    if ((eventData.payment_qr_code || eventData.payment_upi_id) && paymentRequired) {
      const paymentLink = eventData.payment_qr_code || `upi://pay?pa=${eventData.payment_upi_id}`;
      const paymentLinkColumnIndex = sheetData.headers.indexOf('Payment Link');

      if (paymentLinkColumnIndex !== -1) {
        // Add hyperlinks for each registration row
        for (let i = 0; i < registrations.length; i++) {
          const rowIndex = i + 3; // Start from row 4 (index 3) after title, empty row, and header
          requests.push({
            updateCells: {
              range: {
                sheetId: sheetId,
                startRowIndex: rowIndex,
                endRowIndex: rowIndex + 1,
                startColumnIndex: paymentLinkColumnIndex,
                endColumnIndex: paymentLinkColumnIndex + 1
              },
              rows: [{
                values: [{
                  userEnteredValue: {
                    formulaValue: `=HYPERLINK("${paymentLink}", "Payment Link")`
                  },
                  userEnteredFormat: {
                    textFormat: {
                      foregroundColor: { red: 0.0, green: 0.0, blue: 1.0 }, // Blue color for links
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

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests }
    });
  }

  /**
   * Format the Team Members sheet with enhanced styling
   */
  async formatTeamMembersSheet(spreadsheetId, sheetId, registrations) {
    // Count total team member rows for formatting
    let totalTeamMemberRows = 0;
    registrations.forEach(reg => {
      if (reg.additional_info?.team_members?.length > 0) {
        totalTeamMemberRows += 1 + reg.additional_info.team_members.length + 1; // team lead + members + separator
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
            endColumnIndex: 10
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
            endColumnIndex: 10
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
            endColumnIndex: 10
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
            pixelSize: 80 // Serial No.
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
            pixelSize: 180 // Team Name
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
            pixelSize: 200 // Team Lead
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
            pixelSize: 250 // Team Lead Email
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
            pixelSize: 200 // Member Name
          },
          fields: 'pixelSize'
        }
      }
    ];

    // Add alternating row colors for data rows (starting from row 6, index 5)
    for (let i = 0; i < totalTeamMemberRows; i++) {
      const actualRowIndex = i + 5; // Start from row 6 (index 5)
      const isEvenDataRow = i % 2 === 0;
      const backgroundColor = isEvenDataRow
        ? { red: 0.949, green: 0.976, blue: 0.929 } // Light green #F2F9ED for even rows
        : { red: 1, green: 1, blue: 1 }; // White for odd rows

      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetId,
            startRowIndex: actualRowIndex,
            endRowIndex: actualRowIndex + 1,
            startColumnIndex: 0,
            endColumnIndex: 10
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: backgroundColor,
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
          fields: 'userEnteredFormat(backgroundColor,textFormat,borders)'
        }
      });
    }

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
