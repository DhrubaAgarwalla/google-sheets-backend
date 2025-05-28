import express from 'express';
import googleConfig from '../config/google.js';

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      services: {
        api: 'healthy',
        googleAuth: 'unknown'
      }
    };

    // Test Google authentication
    try {
      await googleConfig.testAuthentication();
      healthStatus.services.googleAuth = 'healthy';
      healthStatus.serviceAccount = googleConfig.getServiceAccountEmail();
    } catch (error) {
      healthStatus.services.googleAuth = 'unhealthy';
      healthStatus.googleAuthError = error.message;
      healthStatus.status = 'degraded';
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);

  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      services: {
        api: 'unhealthy',
        googleAuth: 'unknown'
      }
    });
  }
});

/**
 * Detailed system information endpoint
 */
router.get('/detailed', async (req, res) => {
  try {
    const systemInfo = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3001,
        apiPrefix: process.env.API_PREFIX || '/api/v1'
      },
      services: {
        api: 'healthy',
        googleAuth: 'unknown',
        googleSheets: 'unknown',
        googleDrive: 'unknown'
      },
      configuration: {
        hasGoogleCredentials: !!process.env.GOOGLE_CREDENTIALS_CLIENT_EMAIL,
        serviceAccountEmail: process.env.GOOGLE_CREDENTIALS_CLIENT_EMAIL || 'not configured',
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['not configured']
      }
    };

    // Test Google services
    try {
      await googleConfig.testAuthentication();
      systemInfo.services.googleAuth = 'healthy';
      
      // Test Sheets API
      try {
        const sheets = googleConfig.getSheetsClient();
        systemInfo.services.googleSheets = 'healthy';
      } catch (error) {
        systemInfo.services.googleSheets = 'unhealthy';
      }

      // Test Drive API
      try {
        const drive = googleConfig.getDriveClient();
        systemInfo.services.googleDrive = 'healthy';
      } catch (error) {
        systemInfo.services.googleDrive = 'unhealthy';
      }

    } catch (error) {
      systemInfo.services.googleAuth = 'unhealthy';
      systemInfo.services.googleSheets = 'unhealthy';
      systemInfo.services.googleDrive = 'unhealthy';
      systemInfo.googleAuthError = error.message;
      systemInfo.status = 'degraded';
    }

    const statusCode = systemInfo.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(systemInfo);

  } catch (error) {
    console.error('Detailed health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

export default router;
