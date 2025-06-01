import express from 'express';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import googleConfig from '../config/google.js';

const router = express.Router();

/**
 * Email service using Gmail API with OAuth2
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      // For now, let's use a simple SMTP approach with app-specific password
      // This is more reliable than OAuth2 for service accounts with Gmail

      if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
          }
        });

        console.log('✅ Email transporter initialized with SMTP (app password)');
        return;
      }

      // If no app password, create a mock transporter for testing
      console.log('⚠️ No Gmail credentials found. Creating mock email service for testing.');
      console.log('📧 To enable email functionality:');
      console.log('   1. Set up Gmail App Password: https://support.google.com/accounts/answer/185833');
      console.log('   2. Add GMAIL_USER and GMAIL_APP_PASSWORD to your .env file');

      // Mock transporter that logs emails instead of sending them
      this.transporter = {
        sendMail: async (mailOptions) => {
          console.log('📧 MOCK EMAIL SERVICE - Email would be sent:');
          console.log('   To:', mailOptions.to);
          console.log('   Subject:', mailOptions.subject);
          console.log('   Content length:', mailOptions.html?.length || 0, 'characters');
          console.log('   Attachments:', mailOptions.attachments?.length || 0);

          return {
            messageId: `mock-${Date.now()}@test.com`,
            response: 'Mock email service - email logged to console'
          };
        }
      };

      console.log('✅ Mock email service initialized for testing');

    } catch (error) {
      console.error('❌ Failed to initialize email service:', error.message);
      throw new Error('Unable to initialize email service');
    }
  }

  async sendEmail(emailData) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const { to, subject, html, attachments = [] } = emailData;

      const mailOptions = {
        from: {
          name: 'NIT Silchar Event Manager',
          address: googleConfig.getServiceAccountEmail() || process.env.GMAIL_USER
        },
        to,
        subject,
        html,
        attachments: attachments.map(attachment => ({
          filename: attachment.filename,
          content: attachment.content,
          encoding: attachment.encoding || 'base64',
          cid: attachment.cid
        }))
      };

      const result = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: result.messageId,
        response: result.response
      };
    } catch (error) {
      console.error('Email sending error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

// Create email service instance
const emailService = new EmailService();

/**
 * POST /send-email
 * Send email with optional attachments
 */
router.post('/send-email', async (req, res) => {
  try {
    const { to, subject, html, attachments } = req.body;

    // Validate required fields
    if (!to || !subject || !html) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'to, subject, and html are required fields'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }

    // Send email
    const result = await emailService.sendEmail({
      to,
      subject,
      html,
      attachments
    });

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({
      error: 'Failed to send email',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /send-qr-email
 * Send QR code email specifically for event registration
 */
router.post('/send-qr-email', async (req, res) => {
  try {
    const {
      participantEmail,
      participantName,
      eventTitle,
      eventDate,
      eventLocation,
      qrCodeImageUrl,
      registrationId
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'participantEmail',
      'participantName',
      'eventTitle',
      'eventDate',
      'eventLocation',
      'qrCodeImageUrl',
      'registrationId'
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: `Missing fields: ${missingFields.join(', ')}`
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(participantEmail)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid participant email address'
      });
    }

    // Extract base64 data from QR code image URL
    const base64Data = qrCodeImageUrl.split(',')[1];
    if (!base64Data) {
      return res.status(400).json({
        error: 'Invalid QR code image',
        message: 'QR code image must be a valid base64 data URL'
      });
    }

    // Generate email HTML content
    const emailHtml = generateQRCodeEmailHTML({
      participantName,
      eventTitle,
      eventDate,
      eventLocation,
      registrationId
    });

    // Send email with QR code attachment
    const result = await emailService.sendEmail({
      to: participantEmail,
      subject: `🎫 Your QR Code for ${eventTitle} - NITS Event Manager`,
      html: emailHtml,
      attachments: [
        {
          filename: `${eventTitle.replace(/[^a-z0-9]/gi, '_')}_qr_code.png`,
          content: base64Data,
          encoding: 'base64',
          cid: 'qr_code_image'
        }
      ]
    });

    res.json({
      success: true,
      message: 'QR code email sent successfully',
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Send QR email error:', error);
    res.status(500).json({
      error: 'Failed to send QR code email',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /send-attendance-confirmation
 * Send attendance confirmation email
 */
router.post('/send-attendance-confirmation', async (req, res) => {
  try {
    const {
      participantEmail,
      participantName,
      eventTitle,
      attendanceTimestamp
    } = req.body;

    // Validate required fields
    const requiredFields = ['participantEmail', 'participantName', 'eventTitle', 'attendanceTimestamp'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: `Missing fields: ${missingFields.join(', ')}`
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(participantEmail)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid participant email address'
      });
    }

    // Generate email HTML content
    const emailHtml = generateAttendanceConfirmationHTML({
      participantName,
      eventTitle,
      attendanceTimestamp
    });

    // Send email
    const result = await emailService.sendEmail({
      to: participantEmail,
      subject: `✅ Attendance Confirmed - ${eventTitle}`,
      html: emailHtml
    });

    res.json({
      success: true,
      message: 'Attendance confirmation email sent successfully',
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Send attendance confirmation error:', error);
    res.status(500).json({
      error: 'Failed to send attendance confirmation email',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /test-email
 * Test email configuration
 */
router.get('/test-email', async (req, res) => {
  try {
    const testEmail = req.query.email || 'test@example.com';

    const result = await emailService.sendEmail({
      to: testEmail,
      subject: 'Test Email - NITS Event Manager',
      html: `
        <h2>Email Configuration Test</h2>
        <p>This is a test email to verify the email service is working correctly.</p>
        <p>Sent at: ${new Date().toISOString()}</p>
        <p>From: NIT Silchar Event Management System</p>
      `
    });

    res.json({
      success: true,
      message: 'Test email sent successfully',
      messageId: result.messageId,
      sentTo: testEmail,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      error: 'Failed to send test email',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Generate HTML content for QR code email
 */
function generateQRCodeEmailHTML(data) {
  const { participantName, eventTitle, eventDate, eventLocation, registrationId } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Event QR Code</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; }
        .container { background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .header { text-align: center; border-bottom: 3px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #007bff; margin: 0; font-size: 28px; }
        .qr-section { text-align: center; background: #f8f9fa; border-radius: 8px; padding: 30px; margin: 30px 0; }
        .qr-code { max-width: 200px; height: auto; border: 3px solid #007bff; border-radius: 8px; padding: 10px; background: white; }
        .event-details { background: #e3f2fd; border-left: 4px solid #007bff; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .instructions { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #dee2e6; }
        .instructions h4 { color: #007bff; margin-top: 0; }
        .instructions ul { margin: 15px 0; padding-left: 20px; }
        .instructions li { margin: 8px 0; color: #555; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎫 Event Registration Confirmed!</h1>
            <p>NIT Silchar Event Management System</p>
        </div>
        <p>Dear <strong>${participantName}</strong>,</p>
        <p>Thank you for registering for <strong>${eventTitle}</strong>! Your registration has been confirmed and your unique QR code is ready.</p>
        <div class="event-details">
            <h3>📅 Event Details</h3>
            <p><strong>Event:</strong> ${eventTitle}</p>
            <p><strong>Date:</strong> ${new Date(eventDate).toLocaleDateString()}</p>
            <p><strong>Location:</strong> ${eventLocation}</p>
            <p><strong>Registration ID:</strong> ${registrationId}</p>
        </div>
        <div class="qr-section">
            <h3>📱 Your Attendance QR Code</h3>
            <p>Present this QR code at the event for attendance marking:</p>
            <img src="cid:qr_code_image" alt="Event QR Code" class="qr-code">
            <p><small>Save this image to your phone for easy access</small></p>
        </div>

        <div class="instructions">
            <h4>📋 Important Instructions</h4>
            <ul>
                <li><strong>Save this email</strong> or download the QR code image to your phone</li>
                <li><strong>Arrive on time</strong> - QR codes will be scanned at the event entrance</li>
                <li><strong>Bring a backup</strong> - You can also show your registration ID if needed</li>
                <li><strong>Contact support</strong> if you face any issues with your QR code</li>
                <li><strong>QR code is valid until the event date</strong> - keep it safe!</li>
            </ul>
        </div>

        <p>We're excited to see you at the event! If you have any questions or need assistance, please don't hesitate to contact the event organizers.</p>

        <div class="footer">
            <p><strong>NIT Silchar Event Management System</strong></p>
            <p>This is an automated email. Please do not reply to this message.</p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate HTML for attendance confirmation email
 */
function generateAttendanceConfirmationHTML(data) {
  const { participantName, eventTitle, attendanceTimestamp } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Attendance Confirmed</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; }
        .container { background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .header { text-align: center; border-bottom: 3px solid #28a745; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #28a745; margin: 0; font-size: 28px; }
        .success-icon { font-size: 48px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="success-icon">✅</div>
            <h1>Attendance Confirmed!</h1>
        </div>
        <p>Dear <strong>${participantName}</strong>,</p>
        <p>Your attendance for <strong>${eventTitle}</strong> has been successfully recorded!</p>
        <p><strong>Attendance Time:</strong> ${new Date(attendanceTimestamp).toLocaleString()}</p>
        <p>Thank you for participating in the event. We hope you have a great experience!</p>
        <div class="footer">
            <p><strong>NIT Silchar Event Management System</strong></p>
            <p>This is an automated confirmation email.</p>
        </div>
    </div>
</body>
</html>`;
}

export default router;
