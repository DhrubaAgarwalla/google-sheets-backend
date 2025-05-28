# Event Manager Sheets Backend

A Node.js backend service for Google Sheets integration with the Event Manager application. This service provides REST API endpoints to create, update, and manage Google Sheets for event registration data.

## Features

- 🔐 Google Service Account authentication
- 📊 Create Google Sheets with event registration data
- 🔄 Update existing sheets with new registrations
- 🎨 Professional formatting and styling
- 🔗 Generate shareable links
- 🛡️ Input validation and error handling
- 🚀 Rate limiting and security middleware
- 📈 Health check endpoints

## Prerequisites

- Node.js 18+ 
- Google Cloud Project with Sheets API enabled
- Service Account with appropriate permissions
- Google Service Account credentials JSON file

## Installation

1. Clone or navigate to the backend directory:
   ```bash
   cd sheets-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure your `.env` file with Google Service Account credentials and other settings.

## Configuration

### Environment Variables

Copy the `.env.example` file to `.env` and configure the following variables:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Google Service Account Credentials
GOOGLE_CREDENTIALS_TYPE=service_account
GOOGLE_CREDENTIALS_PROJECT_ID=your-project-id
GOOGLE_CREDENTIALS_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_CREDENTIALS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
GOOGLE_CREDENTIALS_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_CREDENTIALS_CLIENT_ID=your-client-id
GOOGLE_CREDENTIALS_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GOOGLE_CREDENTIALS_TOKEN_URI=https://oauth2.googleapis.com/token
GOOGLE_CREDENTIALS_AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
GOOGLE_CREDENTIALS_CLIENT_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend-domain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# API Configuration
API_PREFIX=/api/v1
```

### Google Cloud Setup

1. Create a Google Cloud Project
2. Enable the Google Sheets API and Google Drive API
3. Create a Service Account
4. Download the Service Account credentials JSON file
5. Extract the values and add them to your `.env` file

## Usage

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

The server will start on the port specified in your `.env` file (default: 3001).

## API Endpoints

### Health Check

- **GET** `/api/v1/health` - Basic health check
- **GET** `/api/v1/health/detailed` - Detailed system information

### Google Sheets

- **POST** `/api/v1/sheets/create` - Create a new Google Sheet
- **PUT** `/api/v1/sheets/:spreadsheetId/update` - Update an existing sheet
- **GET** `/api/v1/sheets/:spreadsheetId` - Get sheet information
- **DELETE** `/api/v1/sheets/:spreadsheetId` - Delete a sheet

### Example Request

```javascript
// Create a new Google Sheet
const response = await fetch('http://localhost:3001/api/v1/sheets/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    eventData: {
      id: 1,
      title: 'Tech Conference 2024',
      custom_fields: [
        { id: 'field1', label: 'T-Shirt Size', type: 'select' }
      ]
    },
    registrations: [
      {
        participant_name: 'John Doe',
        participant_email: 'john@example.com',
        participant_phone: '+1234567890',
        participant_student_id: 'STU001',
        participant_department: 'Computer Science',
        participant_year: '3rd Year',
        registration_type: 'Individual',
        status: 'Confirmed',
        created_at: '2024-01-15T10:30:00Z'
      }
    ]
  })
});

const result = await response.json();
console.log(result.data.shareableLink);
```

## Deployment

### Vercel

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Set environment variables in Vercel dashboard

### Other Platforms

The service can be deployed to any Node.js hosting platform like Railway, Render, or Heroku. Make sure to:

1. Set all required environment variables
2. Ensure Node.js 18+ is available
3. Configure the correct start command: `npm start`

## Security

- Rate limiting (100 requests per 15 minutes by default)
- CORS protection
- Input validation using Joi
- Helmet.js security headers
- Environment-based configuration

## Error Handling

The API provides detailed error responses:

```json
{
  "success": false,
  "error": "Validation error",
  "details": ["participant_name is required"],
  "message": "Request validation failed"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
