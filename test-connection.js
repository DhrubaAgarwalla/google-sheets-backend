#!/usr/bin/env node

/**
 * Connection Test Script
 * Tests the deployed backend service connectivity
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const BACKEND_URL = process.argv[2] || process.env.BACKEND_URL || 'http://localhost:3001';
const API_PREFIX = '/api/v1';

console.log('🔍 Testing Google Sheets Backend Connection');
console.log('==========================================');
console.log(`Backend URL: ${BACKEND_URL}`);
console.log('');

async function testEndpoint(endpoint, method = 'GET', body = null) {
    try {
        const url = `${BACKEND_URL}${API_PREFIX}${endpoint}`;
        console.log(`Testing ${method} ${url}...`);
        
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (response.ok) {
            console.log(`✅ ${endpoint} - Status: ${response.status}`);
            if (endpoint === '/health') {
                console.log(`   Status: ${data.status}`);
                console.log(`   Services: ${JSON.stringify(data.services)}`);
            }
        } else {
            console.log(`❌ ${endpoint} - Status: ${response.status}`);
            console.log(`   Error: ${data.error || data.message}`);
        }
        
        return response.ok;
    } catch (error) {
        console.log(`❌ ${endpoint} - Connection Error: ${error.message}`);
        return false;
    }
}

async function testCORS() {
    try {
        console.log('\n🌐 Testing CORS...');
        const response = await fetch(`${BACKEND_URL}${API_PREFIX}/health`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:3000',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'Content-Type'
            }
        });
        
        if (response.ok) {
            console.log('✅ CORS - Preflight request successful');
        } else {
            console.log('❌ CORS - Preflight request failed');
        }
        
        return response.ok;
    } catch (error) {
        console.log(`❌ CORS - Error: ${error.message}`);
        return false;
    }
}

async function runTests() {
    console.log('Starting connection tests...\n');
    
    const results = {
        root: await testEndpoint(''),
        health: await testEndpoint('/health'),
        healthDetailed: await testEndpoint('/health/detailed'),
        cors: await testCORS()
    };
    
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    Object.entries(results).forEach(([test, passed]) => {
        console.log(`${passed ? '✅' : '❌'} ${test}`);
    });
    
    const allPassed = Object.values(results).every(result => result);
    
    console.log('\n' + (allPassed ? '🎉 All tests passed!' : '⚠️  Some tests failed'));
    
    if (!allPassed) {
        console.log('\n🔧 Troubleshooting tips:');
        console.log('- Check if the backend service is running');
        console.log('- Verify the URL is correct');
        console.log('- Check firewall and network settings');
        console.log('- Ensure environment variables are set correctly');
        console.log('- Check CORS configuration for your frontend domain');
    }
    
    return allPassed;
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { testEndpoint, testCORS, runTests };
