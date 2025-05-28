#!/bin/bash

# Google Sheets Backend Deployment Script
# This script helps deploy the backend service to various platforms

echo "🚀 Google Sheets Backend Deployment Helper"
echo "==========================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create one from .env.example"
    echo "   cp .env.example .env"
    exit 1
fi

# Load environment variables
source .env

echo "📋 Current Configuration:"
echo "   Project ID: $GOOGLE_CREDENTIALS_PROJECT_ID"
echo "   Client Email: $GOOGLE_CREDENTIALS_CLIENT_EMAIL"
echo "   Allowed Origins: $ALLOWED_ORIGINS"
echo ""

# Platform selection
echo "🌐 Select deployment platform:"
echo "1) Vercel"
echo "2) Railway"
echo "3) Render"
echo "4) Manual setup info"
echo "5) 🆕 Setup New Git Repository"
echo ""
read -p "Enter your choice (1-5): " platform

case $platform in
    1)
        echo "🔧 Deploying to Vercel..."
        if ! command -v vercel &> /dev/null; then
            echo "Installing Vercel CLI..."
            npm install -g vercel
        fi

        echo "Setting up environment variables..."
        vercel env add GOOGLE_CREDENTIALS_TYPE production
        vercel env add GOOGLE_CREDENTIALS_PROJECT_ID production
        vercel env add GOOGLE_CREDENTIALS_PRIVATE_KEY_ID production
        vercel env add GOOGLE_CREDENTIALS_PRIVATE_KEY production
        vercel env add GOOGLE_CREDENTIALS_CLIENT_EMAIL production
        vercel env add GOOGLE_CREDENTIALS_CLIENT_ID production
        vercel env add GOOGLE_CREDENTIALS_AUTH_URI production
        vercel env add GOOGLE_CREDENTIALS_TOKEN_URI production
        vercel env add GOOGLE_CREDENTIALS_AUTH_PROVIDER_CERT_URL production
        vercel env add GOOGLE_CREDENTIALS_CLIENT_CERT_URL production
        vercel env add ALLOWED_ORIGINS production
        vercel env add NODE_ENV production

        echo "Deploying..."
        vercel --prod
        ;;
    2)
        echo "🚂 Railway deployment instructions:"
        echo "1. Install Railway CLI: npm install -g @railway/cli"
        echo "2. Login: railway login"
        echo "3. Initialize: railway init"
        echo "4. Set environment variables using: railway variables set KEY=VALUE"
        echo "5. Deploy: railway up"
        ;;
    3)
        echo "🎨 Render deployment instructions:"
        echo "1. Connect your GitHub repository to Render"
        echo "2. Create a new Web Service"
        echo "3. Set build command: npm install"
        echo "4. Set start command: npm start"
        echo "5. Add environment variables in Render dashboard"
        ;;
    4)
        echo "📖 Manual deployment checklist:"
        echo "✅ Node.js 18+ installed"
        echo "✅ Environment variables configured"
        echo "✅ Google Service Account credentials set up"
        echo "✅ CORS origins include your frontend domain"
        echo "✅ Firewall allows port 3001 (or your chosen port)"
        echo ""
        echo "Commands to run:"
        echo "  npm install"
        echo "  npm start"
        ;;
    5)
        echo "🆕 Setting up new Git repository..."
        echo "=================================="

        # Check if git is installed
        if ! command -v git &> /dev/null; then
            echo "❌ Error: Git is not installed. Please install Git first."
            exit 1
        fi

        # Get repository name
        read -p "Enter repository name (e.g., event-manager-backend): " repo_name
        if [ -z "$repo_name" ]; then
            echo "❌ Error: Repository name cannot be empty."
            exit 1
        fi

        # Create new directory for the repository
        echo "📁 Creating new repository directory: $repo_name"
        mkdir -p "../$repo_name"

        # Copy files (excluding node_modules, .env, and other ignored files)
        echo "📋 Copying backend files..."
        rsync -av --exclude-from='.gitignore' --exclude='.git' --exclude='node_modules' --exclude='.env*' . "../$repo_name/"

        # Navigate to new directory
        cd "../$repo_name"

        # Initialize git repository
        echo "🔧 Initializing Git repository..."
        git init

        # Add all files
        echo "📝 Adding files to Git..."
        git add .

        # Create initial commit
        echo "💾 Creating initial commit..."
        git commit -m "Initial commit: Event Manager Sheets Backend"

        # Instructions for remote repository
        echo ""
        echo "✅ Local Git repository created successfully!"
        echo ""
        echo "🔗 Next steps to connect to remote repository:"
        echo "=============================================="
        echo "1. Create a new repository on GitHub/GitLab/etc."
        echo "2. Copy the repository URL"
        echo "3. Run these commands in the new directory ($repo_name):"
        echo ""
        echo "   cd ../$repo_name"
        echo "   git remote add origin <your-repository-url>"
        echo "   git branch -M main"
        echo "   git push -u origin main"
        echo ""
        echo "📁 Repository location: $(pwd)"
        echo ""
        echo "⚠️  Important reminders:"
        echo "   - Create .env file with your credentials before deploying"
        echo "   - Never commit .env files to the repository"
        echo "   - Set environment variables on your hosting platform"
        echo "   - Update ALLOWED_ORIGINS with your frontend URL"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Deployment process initiated!"
echo "📝 Don't forget to:"
echo "   1. Update VITE_SHEETS_BACKEND_URL in your frontend"
echo "   2. Test the health endpoint: /api/v1/health"
echo "   3. Verify CORS settings work with your frontend domain"
