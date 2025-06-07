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
 * POST /send-club-approval
 * Send club approval confirmation email with login credentials
 */
router.post('/send-club-approval', async (req, res) => {
  try {
    const {
      clubName,
      contactPerson,
      email,
      password,
      passwordResetLink
    } = req.body;

    // Validate required fields
    const requiredFields = ['clubName', 'contactPerson', 'email', 'password'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: `Missing fields: ${missingFields.join(', ')}`
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }

    // Generate email HTML content
    const emailHtml = generateClubApprovalEmailHTML({
      clubName,
      contactPerson,
      email,
      password,
      passwordResetLink: passwordResetLink || `${process.env.FRONTEND_URL || 'https://nits-event-manager.vercel.app'}?forgot-password=true`
    });

    // Send email
    const result = await emailService.sendEmail({
      to: email,
      subject: `🎉 Club Account Approved - ${clubName} | NITS Event Manager`,
      html: emailHtml
    });

    res.json({
      success: true,
      message: 'Club approval email sent successfully',
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Send club approval email error:', error);
    res.status(500).json({
      error: 'Failed to send club approval email',
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

/**
 * Generate HTML for club approval confirmation email
 */
function generateClubApprovalEmailHTML(data) {
  const { clubName, contactPerson, email, password, passwordResetLink } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Club Account Approved - NIT Silchar</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #2c3e50;
            background-color: #f8fafc;
            padding: 20px;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            padding: 40px 30px;
        }
        .header h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header p {
            font-size: 16px;
            opacity: 0.9;
            font-weight: 300;
        }
        .success-badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            margin-bottom: 20px;
            backdrop-filter: blur(10px);
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 18px;
            margin-bottom: 25px;
            color: #2c3e50;
        }
        .club-info {
            background: #f8fafc;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
        }
        .credentials-section {
            background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
            border: 2px solid #667eea;
            border-radius: 12px;
            padding: 25px;
            margin: 30px 0;
            position: relative;
        }
        .credentials-section::before {
            content: "🔐";
            position: absolute;
            top: -15px;
            left: 20px;
            background: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 20px;
        }
        .credentials-section h3 {
            color: #667eea;
            margin: 0 0 15px 0;
            font-size: 20px;
            font-weight: 600;
        }
        .credential-row {
            display: flex;
            align-items: center;
            background: white;
            border-radius: 8px;
            padding: 15px;
            margin: 12px 0;
            border: 1px solid #e1e8ed;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .credential-label {
            font-weight: 600;
            color: #667eea;
            min-width: 120px;
            font-size: 14px;
        }
        .credential-value {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 15px;
            color: #2c3e50;
            background: #f8fafc;
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #e1e8ed;
            flex: 1;
            margin-left: 15px;
        }
        .security-notice {
            background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
            border: 1px solid #f39c12;
            border-radius: 10px;
            padding: 20px;
            margin: 25px 0;
            position: relative;
        }
        .security-notice::before {
            content: "⚠️";
            position: absolute;
            top: -12px;
            left: 20px;
            background: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 18px;
        }
        .security-notice h4 {
            color: #d68910;
            margin: 0 0 10px 0;
            font-size: 16px;
            font-weight: 600;
        }
        .security-notice p {
            color: #7d6608;
            margin: 0;
            font-size: 14px;
        }
        .action-section {
            text-align: center;
            margin: 40px 0;
            padding: 30px 0;
            background: #f8fafc;
            border-radius: 12px;
        }
        .action-section h3 {
            color: #2c3e50;
            margin-bottom: 20px;
            font-size: 20px;
        }
        .btn {
            display: inline-block;
            padding: 15px 30px;
            margin: 8px 12px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
            min-width: 180px;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }
        .btn-secondary {
            background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
            color: white !important;
            box-shadow: 0 4px 15px rgba(116, 185, 255, 0.4);
        }
        .btn-secondary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(116, 185, 255, 0.6);
        }
        .features-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 30px 0;
        }
        .feature-card {
            background: white;
            border: 1px solid #e1e8ed;
            border-radius: 10px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .feature-icon {
            font-size: 32px;
            margin-bottom: 10px;
        }
        .feature-title {
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 8px;
        }
        .feature-desc {
            font-size: 14px;
            color: #7f8c8d;
            line-height: 1.4;
        }
        .steps-section {
            background: white;
            border: 1px solid #e1e8ed;
            border-radius: 12px;
            padding: 25px;
            margin: 25px 0;
        }
        .steps-section h4 {
            color: #667eea;
            margin-bottom: 20px;
            font-size: 18px;
            display: flex;
            align-items: center;
        }
        .steps-section h4::before {
            content: "📋";
            margin-right: 10px;
            font-size: 20px;
        }
        .step-item {
            display: flex;
            align-items: flex-start;
            margin: 15px 0;
            padding: 12px;
            background: #f8fafc;
            border-radius: 8px;
            border-left: 3px solid #667eea;
        }
        .step-number {
            background: #667eea;
            color: white;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            margin-right: 15px;
            flex-shrink: 0;
        }
        .step-content {
            flex: 1;
        }
        .step-title {
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 4px;
        }
        .step-desc {
            font-size: 14px;
            color: #7f8c8d;
        }
        .footer {
            background: #2c3e50;
            color: #bdc3c7;
            text-align: center;
            padding: 30px;
            font-size: 14px;
        }
        .footer strong {
            color: white;
        }
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, #e1e8ed, transparent);
            margin: 30px 0;
        }
        @media (max-width: 600px) {
            .email-container { margin: 10px; }
            .content { padding: 30px 20px; }
            .features-grid { grid-template-columns: 1fr; }
            .btn { min-width: auto; width: 100%; margin: 8px 0; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="success-badge">✅ Account Approved</div>
            <h1>Welcome to NIT Silchar</h1>
            <p>Event Management System</p>
        </div>

        <div class="content">
            <div class="greeting">
                Dear <strong>${contactPerson}</strong>,
            </div>

            <p>We are pleased to inform you that your club registration request for <strong>${clubName}</strong> has been approved by the administration. Your club account has been successfully created in the NIT Silchar Event Management System.</p>

            <div class="club-info">
                <h4 style="margin: 0 0 10px 0; color: #667eea;">🏛️ Club Registration Details</h4>
                <p><strong>Club Name:</strong> ${clubName}</p>
                <p><strong>Contact Person:</strong> ${contactPerson}</p>
                <p><strong>Account Email:</strong> ${email}</p>
                <p><strong>Status:</strong> <span style="color: #27ae60; font-weight: 600;">Active</span></p>
            </div>

            <div class="credentials-section">
                <h3>Your Login Credentials</h3>
                <p style="margin-bottom: 20px; color: #7f8c8d;">Use these credentials to access your club dashboard:</p>

                <div class="credential-row">
                    <div class="credential-label">Email Address:</div>
                    <div class="credential-value">${email}</div>
                </div>

                <div class="credential-row">
                    <div class="credential-label">Temporary Password:</div>
                    <div class="credential-value">${password}</div>
                </div>
            </div>

            <div class="security-notice">
                <h4>Security Requirement</h4>
                <p><strong>Please change your password immediately after your first login</strong> for security reasons. The temporary password provided above should only be used for your initial login session.</p>
            </div>

            <div class="action-section">
                <h3>Get Started</h3>
                <a href="${process.env.FRONTEND_URL || 'https://nits-event-manager.vercel.app'}" class="btn btn-primary">
                    🚀 Access Dashboard
                </a>
                <a href="${passwordResetLink}" class="btn btn-secondary">
                    🔑 Change Password
                </a>
            </div>

            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-icon">📅</div>
                    <div class="feature-title">Event Management</div>
                    <div class="feature-desc">Create and manage club events with registration tracking</div>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">📊</div>
                    <div class="feature-title">Analytics & Reports</div>
                    <div class="feature-desc">Generate detailed attendance and registration reports</div>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">📱</div>
                    <div class="feature-title">QR Code System</div>
                    <div class="feature-desc">Seamless attendance tracking with QR codes</div>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">📢</div>
                    <div class="feature-title">Live Updates</div>
                    <div class="feature-desc">Send real-time announcements to participants</div>
                </div>
            </div>

            <div class="steps-section">
                <h4>Next Steps</h4>

                <div class="step-item">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <div class="step-title">Login to Your Dashboard</div>
                        <div class="step-desc">Use the credentials provided above to access your club dashboard</div>
                    </div>
                </div>

                <div class="step-item">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <div class="step-title">Change Your Password</div>
                        <div class="step-desc">Update your password immediately for security purposes</div>
                    </div>
                </div>

                <div class="step-item">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <div class="step-title">Complete Club Profile</div>
                        <div class="step-desc">Add club description, contact details, and upload your logo</div>
                    </div>
                </div>

                <div class="step-item">
                    <div class="step-number">4</div>
                    <div class="step-content">
                        <div class="step-title">Create Your First Event</div>
                        <div class="step-desc">Start organizing events and managing registrations</div>
                    </div>
                </div>
            </div>

            <div class="divider"></div>

            <p style="text-align: center; color: #7f8c8d; font-size: 14px;">
                If you encounter any issues during login or need assistance with the platform, please contact the system administrators. We're here to help you make the most of the event management system.
            </p>

            <p style="text-align: center; font-weight: 600; color: #2c3e50; margin-top: 25px;">
                Welcome aboard! We're excited to see the amazing events your club will organize.
            </p>
        </div>

        <div class="footer">
            <p><strong>NIT Silchar Event Management System</strong></p>
            <p style="margin: 8px 0;">This is an automated email. Please do not reply to this message.</p>
            <p>For technical support, contact the system administrators.</p>
        </div>
    </div>
</body>
</html>`;
}

export default router;
