import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Sheets API configuration and authentication
 */
class GoogleConfig {
  constructor() {
    this.credentials = null;
    this.auth = null;
    this.sheets = null;
    this.drive = null;
    this.initializeAuth();
  }

  /**
   * Initialize Google authentication using service account credentials
   */
  initializeAuth() {
    try {
      // Try to use JSON credentials first (easier for deployment)
      if (process.env.GOOGLE_CREDENTIALS_JSON) {
        try {
          this.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
          console.log('📄 Using JSON credentials from environment');
        } catch (jsonError) {
          console.error('❌ Failed to parse JSON credentials:', jsonError.message);
          throw new Error('Invalid JSON credentials format');
        }
      } else {
        // Fallback to individual environment variables
        console.log('🔧 Using individual environment variables for credentials');

        // Handle private key formatting - common issue with environment variables
        let privateKey = process.env.GOOGLE_CREDENTIALS_PRIVATE_KEY;
        if (privateKey) {
          // Replace literal \n with actual newlines
          privateKey = privateKey.replace(/\\n/g, '\n');

          // Ensure the key starts and ends with proper markers
          if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
            console.warn('⚠️ Private key may be missing BEGIN marker');
          }
          if (!privateKey.includes('-----END PRIVATE KEY-----')) {
            console.warn('⚠️ Private key may be missing END marker');
          }
        }

        // Build credentials object from environment variables
        this.credentials = {
          type: process.env.GOOGLE_CREDENTIALS_TYPE,
          project_id: process.env.GOOGLE_CREDENTIALS_PROJECT_ID,
          private_key_id: process.env.GOOGLE_CREDENTIALS_PRIVATE_KEY_ID,
          private_key: privateKey,
          client_email: process.env.GOOGLE_CREDENTIALS_CLIENT_EMAIL,
          client_id: process.env.GOOGLE_CREDENTIALS_CLIENT_ID,
          auth_uri: process.env.GOOGLE_CREDENTIALS_AUTH_URI,
          token_uri: process.env.GOOGLE_CREDENTIALS_TOKEN_URI,
          auth_provider_x509_cert_url: process.env.GOOGLE_CREDENTIALS_AUTH_PROVIDER_CERT_URL,
          client_x509_cert_url: process.env.GOOGLE_CREDENTIALS_CLIENT_CERT_URL
        };
      }

      // Validate required credentials
      const requiredFields = [
        'type', 'project_id', 'private_key_id', 'private_key',
        'client_email', 'client_id'
      ];

      const missingFields = requiredFields.filter(field => !this.credentials[field]);

      if (missingFields.length > 0) {
        throw new Error(`Missing required Google credentials: ${missingFields.join(', ')}`);
      }

      // Create JWT auth client
      this.auth = new google.auth.JWT(
        this.credentials.client_email,
        null,
        this.credentials.private_key,
        [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file'
        ]
      );

      // Initialize Google APIs
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.drive = google.drive({ version: 'v3', auth: this.auth });

      console.log('✅ Google APIs initialized successfully');
      console.log(`📧 Service account: ${this.credentials.client_email}`);
      console.log(`🔑 Private key length: ${this.credentials.private_key?.length || 0} characters`);
      console.log(`🔑 Private key starts with: ${this.credentials.private_key?.substring(0, 50)}...`);

    } catch (error) {
      console.error('❌ Failed to initialize Google APIs:', error.message);
      throw new Error(`Google API initialization failed: ${error.message}`);
    }
  }

  /**
   * Test the authentication by making a simple API call
   */
  async testAuthentication() {
    try {
      await this.auth.authorize();
      console.log('✅ Google authentication test successful');
      return true;
    } catch (error) {
      console.error('❌ Google authentication test failed:', error.message);
      throw new Error(`Authentication test failed: ${error.message}`);
    }
  }

  /**
   * Get the authenticated Sheets API client
   */
  getSheetsClient() {
    if (!this.sheets) {
      throw new Error('Google Sheets API not initialized');
    }
    return this.sheets;
  }

  /**
   * Get the authenticated Drive API client
   */
  getDriveClient() {
    if (!this.drive) {
      throw new Error('Google Drive API not initialized');
    }
    return this.drive;
  }

  /**
   * Get service account email
   */
  getServiceAccountEmail() {
    return this.credentials?.client_email;
  }
}

// Create and export a singleton instance
const googleConfig = new GoogleConfig();

export default googleConfig;
