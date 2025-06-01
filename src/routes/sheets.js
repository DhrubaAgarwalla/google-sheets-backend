import express from 'express';
import Joi from 'joi';
import sheetsService from '../services/sheetsService.js';

const router = express.Router();

// Validation schemas - Made more flexible to handle real-world data
const createSheetSchema = Joi.object({
  eventData: Joi.object({
    id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    title: Joi.string().required(),
    // Make custom_fields more flexible
    custom_fields: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      label: Joi.string().required(),
      type: Joi.string().required()
    }).unknown(true)).optional().default([]),
    // Add payment-related fields
    requires_payment: Joi.boolean().optional(),
    payment_required: Joi.boolean().optional(),
    payment_amount: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null, '')
  }).unknown(true).required(),
  registrations: Joi.array().items(Joi.object({
    // Required fields
    participant_name: Joi.string().required(),
    participant_email: Joi.string().email().required(),

    // Optional fields from frontend - made more flexible
    id: Joi.alternatives().try(Joi.string(), Joi.number()).optional().allow('', null),
    participant_id: Joi.string().optional().allow('', null),
    participant_phone: Joi.string().optional().allow('', null),
    participant_student_id: Joi.string().optional().allow('', null),
    participant_department: Joi.string().optional().allow('', null),
    participant_year: Joi.alternatives().try(Joi.string(), Joi.number()).optional().allow('', null),
    registration_type: Joi.string().optional().default('Individual'),
    status: Joi.string().optional().default('Confirmed'),
    created_at: Joi.alternatives().try(Joi.string(), Joi.date()).optional().allow('', null),
    registration_date: Joi.alternatives().try(Joi.string(), Joi.date()).optional().allow('', null),
    updated_at: Joi.alternatives().try(Joi.string(), Joi.date()).optional().allow('', null),
    event_id: Joi.alternatives().try(Joi.string(), Joi.number()).optional().allow('', null),

    // Complex objects - made more flexible
    additional_info: Joi.object().optional().allow(null),
    custom_fields: Joi.object().optional().allow(null),

    // Payment fields - made more flexible
    payment_status: Joi.string().optional().allow('', null),
    payment_amount: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null, ''),
    payment_screenshot_url: Joi.string().optional().allow('', null),

    // Attendance fields
    attendance_status: Joi.string().optional().allow('', null),
    attendance_timestamp: Joi.alternatives().try(Joi.string(), Joi.date()).optional().allow('', null)
  }).unknown(true)).required()
});

const updateSheetSchema = Joi.object({
  eventData: Joi.object({
    id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    title: Joi.string().required(),
    custom_fields: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      label: Joi.string().required(),
      type: Joi.string().required()
    }).unknown(true)).optional().default([]),
    // Add payment-related fields
    requires_payment: Joi.boolean().optional(),
    payment_required: Joi.boolean().optional(),
    payment_amount: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null, '')
  }).unknown(true).required(),
  registrations: Joi.array().items(Joi.object({
    // Required fields
    participant_name: Joi.string().required(),
    participant_email: Joi.string().email().required(),

    // Optional fields from frontend - made more flexible
    id: Joi.alternatives().try(Joi.string(), Joi.number()).optional().allow('', null),
    participant_id: Joi.string().optional().allow('', null),
    participant_phone: Joi.string().optional().allow('', null),
    participant_student_id: Joi.string().optional().allow('', null),
    participant_department: Joi.string().optional().allow('', null),
    participant_year: Joi.alternatives().try(Joi.string(), Joi.number()).optional().allow('', null),
    registration_type: Joi.string().optional().default('Individual'),
    status: Joi.string().optional().default('Confirmed'),
    created_at: Joi.alternatives().try(Joi.string(), Joi.date()).optional().allow('', null),
    registration_date: Joi.alternatives().try(Joi.string(), Joi.date()).optional().allow('', null),
    updated_at: Joi.alternatives().try(Joi.string(), Joi.date()).optional().allow('', null),
    event_id: Joi.alternatives().try(Joi.string(), Joi.number()).optional().allow('', null),

    // Complex objects - made more flexible
    additional_info: Joi.object().optional().allow(null),
    custom_fields: Joi.object().optional().allow(null),

    // Payment fields - made more flexible
    payment_status: Joi.string().optional().allow('', null),
    payment_amount: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow(null, ''),
    payment_screenshot_url: Joi.string().optional().allow('', null),

    // Attendance fields
    attendance_status: Joi.string().optional().allow('', null),
    attendance_timestamp: Joi.alternatives().try(Joi.string(), Joi.date()).optional().allow('', null)
  }).unknown(true)).required()
});

/**
 * POST /api/v1/sheets/create
 * Create a new Google Sheet with event registration data
 */
router.post('/create', async (req, res) => {
  try {
    // Log incoming request for debugging
    console.log('📊 Incoming Google Sheets create request:');
    console.log('Event Data:', JSON.stringify(req.body.eventData, null, 2));
    console.log('Registrations count:', req.body.registrations?.length || 0);
    if (req.body.registrations?.length > 0) {
      console.log('Sample registration:', JSON.stringify(req.body.registrations[0], null, 2));
    }

    // Validate request body with detailed error reporting
    const { error, value } = createSheetSchema.validate(req.body, {
      abortEarly: false, // Get all validation errors
      allowUnknown: true, // Allow unknown properties
      stripUnknown: false // Keep unknown properties for debugging
    });

    if (error) {
      console.error('❌ Validation failed:', error.details);
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details.map(detail => ({
          message: detail.message,
          path: detail.path,
          value: detail.context?.value
        })),
        receivedData: {
          eventDataKeys: Object.keys(req.body.eventData || {}),
          registrationSample: req.body.registrations?.[0] ? Object.keys(req.body.registrations[0]) : []
        }
      });
    }

    const { eventData, registrations } = value;

    // Check if registrations array is not empty
    if (registrations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No registrations provided',
        message: 'Cannot create a sheet without registration data'
      });
    }

    console.log(`✅ Validation passed. Creating sheet for event: ${eventData.title} with ${registrations.length} registrations`);

    // Create the Google Sheet
    const result = await sheetsService.createEventSheet(eventData, registrations);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Google Sheet created successfully'
    });

  } catch (error) {
    console.error('❌ Error in create sheet endpoint:', error);

    // Determine appropriate HTTP status code and provide detailed error information
    let statusCode = 500;
    let errorType = 'Internal server error';
    let details = undefined;

    if (error.message.includes('Event data is required') ||
        error.message.includes('Registrations must be provided') ||
        error.message.includes('Custom field') ||
        error.message.includes('validation error')) {
      statusCode = 400;
      errorType = 'Validation error';
      if (error.message.includes('Custom field')) {
        details = 'Please check your custom field configuration. Ensure all custom fields have valid id and label properties.';
      }
    } else if (error.message.includes('Authentication failed') || error.message.includes('Insufficient permissions')) {
      statusCode = 401;
      errorType = 'Authentication error';
      details = 'Please check your Google service account credentials and permissions.';
    } else if (error.message.includes('rate limit')) {
      statusCode = 429;
      errorType = 'Rate limit exceeded';
      details = 'Google API rate limit exceeded. Please try again later.';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      statusCode = 503;
      errorType = 'Service unavailable';
      details = 'Network error. Please check your internet connection and try again.';
    }

    res.status(statusCode).json({
      success: false,
      error: errorType,
      message: error.message,
      details: details
    });
  }
});

/**
 * PUT /api/v1/sheets/:spreadsheetId/update
 * Update an existing Google Sheet with new registration data
 */
router.put('/:spreadsheetId/update', async (req, res) => {
  try {
    const { spreadsheetId } = req.params;

    // Validate spreadsheet ID
    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid spreadsheet ID',
        message: 'Spreadsheet ID must be a valid string'
      });
    }

    // Validate request body
    const { error, value } = updateSheetSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }

    const { eventData, registrations } = value;

    console.log(`Updating sheet ${spreadsheetId} for event: ${eventData.title} with ${registrations.length} registrations`);

    // Update the Google Sheet
    const result = await sheetsService.updateEventSheet(spreadsheetId, eventData, registrations);

    res.json({
      success: true,
      data: result,
      message: 'Google Sheet updated successfully'
    });

  } catch (error) {
    console.error('Error in update sheet endpoint:', error);

    // Handle specific Google API errors
    if (error.message.includes('not found') || error.code === 404) {
      return res.status(404).json({
        success: false,
        error: 'Sheet not found',
        message: 'The specified Google Sheet could not be found'
      });
    }

    if (error.message.includes('permission') || error.code === 403) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'Insufficient permissions to update the Google Sheet'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/sheets/:spreadsheetId
 * Get information about a Google Sheet
 */
router.get('/:spreadsheetId', async (req, res) => {
  try {
    const { spreadsheetId } = req.params;

    // Validate spreadsheet ID
    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid spreadsheet ID',
        message: 'Spreadsheet ID must be a valid string'
      });
    }

    console.log(`Getting info for sheet: ${spreadsheetId}`);

    // Get sheet information
    const result = await sheetsService.getSheetInfo(spreadsheetId);

    res.json({
      success: true,
      data: result,
      message: 'Sheet information retrieved successfully'
    });

  } catch (error) {
    console.error('Error in get sheet info endpoint:', error);

    // Handle specific Google API errors
    if (error.message.includes('not found') || error.code === 404) {
      return res.status(404).json({
        success: false,
        error: 'Sheet not found',
        message: 'The specified Google Sheet could not be found'
      });
    }

    if (error.message.includes('permission') || error.code === 403) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'Insufficient permissions to access the Google Sheet'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v1/sheets/:spreadsheetId
 * Delete a Google Sheet
 */
router.delete('/:spreadsheetId', async (req, res) => {
  try {
    const { spreadsheetId } = req.params;

    // Validate spreadsheet ID
    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid spreadsheet ID',
        message: 'Spreadsheet ID must be a valid string'
      });
    }

    console.log(`Deleting sheet: ${spreadsheetId}`);

    // Delete the Google Sheet
    const result = await sheetsService.deleteSheet(spreadsheetId);

    res.json({
      success: true,
      data: result,
      message: 'Google Sheet deleted successfully'
    });

  } catch (error) {
    console.error('Error in delete sheet endpoint:', error);

    // Handle specific Google API errors
    if (error.message.includes('not found') || error.code === 404) {
      return res.status(404).json({
        success: false,
        error: 'Sheet not found',
        message: 'The specified Google Sheet could not be found'
      });
    }

    if (error.message.includes('permission') || error.code === 403) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: 'Insufficient permissions to delete the Google Sheet'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router;
