# Supabase Setup Guide for TypeCount Cloud Sync

This guide will walk you through setting up Supabase for TypeCount's cloud sync functionality.

## Prerequisites

- A Supabase account (free tier available)
- Node.js and npm installed
- TypeCount project cloned and set up

## Step 1: Create Supabase Project

1. **Sign up/Login to Supabase**
   - Go to [supabase.com](https://supabase.com)
   - Create an account or login to existing account

2. **Create New Project**
   - Click "New Project"
   - Choose your organization
   - Fill in project details:
     - **Name**: `typecount-cloud` (or your preferred name)
     - **Database Password**: Generate a strong password (save this!)
     - **Region**: Choose closest to your users
   - Click "Create new project"
   - Wait for project to initialize (2-3 minutes)

## Step 2: Database Setup

1. **Navigate to SQL Editor**
   - In your Supabase dashboard, go to "SQL Editor"
   - Click "New Query"

2. **Run Database Schema**
   - Copy the entire contents of `docs/supabase-schema.sql`
   - Paste into the SQL editor
   - Click "Run" to execute the schema
   - Verify tables are created in the "Table Editor"

3. **Verify Tables Created**
   You should see these tables:
   - `user_typing_data` - Stores user keystroke data
   - `sync_log` - Tracks sync operations
   - `user_preferences` - User settings and preferences

## Step 3: Authentication Configuration

1. **Configure Auth Settings**
   - Go to "Authentication" > "Settings"
   - Enable "Email confirmations" (optional)
   - Set "Site URL" to your app's URL (for production)

2. **Configure Email Templates** (Optional)
   - Customize signup/login email templates
   - Add your branding if desired

## Step 4: Get API Keys

1. **Copy Project Credentials**
   - Go to "Settings" > "API"
   - Copy the following values:
     - **Project URL**: `https://your-project.supabase.co`
     - **Public anon key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Step 5: Environment Configuration

1. **Create Environment File**
   Create a `.env` file in your TypeCount project root:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional: Development settings
NODE_ENV=development
```

2. **Update .gitignore**
   Ensure your `.gitignore` includes:
```gitignore
.env
.env.local
.env.production
```

3. **Configure Vite for Environment Variables**
   In your `vite.config.ts`, environment variables starting with `VITE_` are automatically available.

## Step 6: Install Dependencies

Install Supabase client in your project:

```bash
npm install @supabase/supabase-js
```

## Step 7: Initialize Cloud Sync in App

Add this to your main process initialization:

```typescript
import { cloudSync } from './cloudSync';

// Initialize cloud sync with environment variables
const initCloudSync = async () => {
  const config = {
    enabled: true,
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
    autoSync: true,
    syncInterval: 24 // hours
  };

  await cloudSync.initialize(config);
};

// Call during app startup
initCloudSync();
```

## Step 8: Test the Setup

1. **Test Database Connection**
   - Run your TypeCount app
   - Open the settings and try to enable cloud sync
   - Check browser console for any connection errors

2. **Test Authentication**
   - Try creating a test account
   - Check Supabase dashboard > Authentication > Users
   - Verify user appears in the list

3. **Test Data Sync**
   - Type some keystrokes to generate data
   - Use manual backup feature in settings
   - Check Supabase dashboard > Table Editor > user_typing_data
   - Verify data appears in the table

## Step 9: Production Deployment

For production deployment:

1. **Update Environment Variables**
   - Set production Supabase URL and keys
   - Configure proper CORS settings in Supabase

2. **Security Considerations**
   - Enable RLS policies (already included in schema)
   - Review and test all security policies
   - Enable SSL certificate verification

3. **Performance Optimization**
   - Configure connection pooling if needed
   - Set up database indexes (included in schema)
   - Monitor usage in Supabase dashboard

## Troubleshooting

### Common Issues

1. **"Invalid API key" Error**
   - Verify environment variables are correctly set
   - Ensure you're using the public anon key, not service role key

2. **CORS Errors**
   - Check Supabase Auth settings
   - Verify Site URL is correctly configured

3. **Database Permission Errors**
   - Ensure RLS policies are properly applied
   - Check user authentication status

4. **Sync Not Working**
   - Verify user is authenticated
   - Check browser network tab for API errors
   - Review Supabase logs in dashboard

### Getting Help

- **Supabase Documentation**: [docs.supabase.com](https://docs.supabase.com)
- **TypeCount Issues**: Check project's GitHub issues
- **Community Support**: Supabase Discord community

## Security Best Practices

1. **Never commit environment files**
2. **Use Row Level Security** (enabled by default)
3. **Regularly rotate API keys** in production
4. **Monitor usage** in Supabase dashboard
5. **Enable email confirmations** for production
6. **Set up proper backup strategies**

## Cost Considerations

- **Free Tier**: Includes 500MB database, 2GB bandwidth/month
- **Pro Tier**: $25/month for production use
- **Monitor usage** in Supabase dashboard to avoid overages

Your TypeCount cloud sync is now ready to use! Users can optionally sign up for accounts to sync their typing data across devices.