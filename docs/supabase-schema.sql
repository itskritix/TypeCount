-- Supabase Database Schema for TypeCount Cloud Sync
-- This file contains the SQL schema needed to set up the cloud sync functionality

-- Enable Row Level Security
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Create user typing data table
CREATE TABLE IF NOT EXISTS public.user_typing_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    total_keystrokes BIGINT DEFAULT 0,
    daily_keystrokes JSONB DEFAULT '{}',
    hourly_keystrokes JSONB DEFAULT '{}',
    achievements TEXT[] DEFAULT '{}',
    challenges JSONB DEFAULT '[]',
    goals JSONB DEFAULT '[]',
    user_level INTEGER DEFAULT 1,
    user_xp BIGINT DEFAULT 0,
    personality_type VARCHAR(100) DEFAULT '',
    streak_days INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    first_used_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    device_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_typing_data_user_id ON public.user_typing_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_typing_data_device_id ON public.user_typing_data(device_id);
CREATE INDEX IF NOT EXISTS idx_user_typing_data_last_updated ON public.user_typing_data(last_updated);

-- Create sync log table for tracking sync events
CREATE TABLE IF NOT EXISTS public.sync_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    sync_type VARCHAR(50) NOT NULL, -- 'backup', 'restore', 'sync'
    sync_status VARCHAR(50) NOT NULL, -- 'success', 'error', 'conflict_resolved'
    data_size_bytes BIGINT DEFAULT 0,
    error_message TEXT,
    sync_duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for sync log
CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON public.sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_created_at ON public.sync_log(created_at);

-- Create user preferences table for cloud sync settings
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    sync_enabled BOOLEAN DEFAULT true,
    auto_sync BOOLEAN DEFAULT true,
    sync_interval_hours INTEGER DEFAULT 24,
    privacy_mode BOOLEAN DEFAULT false,
    share_analytics BOOLEAN DEFAULT false,
    last_privacy_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_typing_data_updated_at
    BEFORE UPDATE ON public.user_typing_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security Policies

-- Users can only access their own typing data
CREATE POLICY "Users can view own typing data" ON public.user_typing_data
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own typing data" ON public.user_typing_data
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own typing data" ON public.user_typing_data
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own typing data" ON public.user_typing_data
    FOR DELETE USING (auth.uid() = user_id);

-- Users can only access their own sync logs
CREATE POLICY "Users can view own sync logs" ON public.sync_log
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync logs" ON public.sync_log
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only access their own preferences
CREATE POLICY "Users can view own preferences" ON public.user_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON public.user_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON public.user_preferences
    FOR UPDATE USING (auth.uid() = user_id);

-- Enable RLS on all tables
ALTER TABLE public.user_typing_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Create function to automatically create user preferences on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_preferences (user_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to get user stats (for analytics)
CREATE OR REPLACE FUNCTION public.get_user_stats(user_id_param UUID)
RETURNS TABLE (
    total_devices INTEGER,
    total_keystrokes BIGINT,
    sync_count BIGINT,
    last_sync TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT device_id)::INTEGER as total_devices,
        COALESCE(MAX(total_keystrokes), 0) as total_keystrokes,
        COUNT(sl.id) as sync_count,
        MAX(sl.created_at) as last_sync
    FROM public.user_typing_data utd
    LEFT JOIN public.sync_log sl ON sl.user_id = utd.user_id
    WHERE utd.user_id = user_id_param
    GROUP BY utd.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean up old sync logs (keep last 100 per user)
CREATE OR REPLACE FUNCTION public.cleanup_old_sync_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    WITH ranked_logs AS (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
        FROM public.sync_log
    ),
    logs_to_delete AS (
        SELECT id FROM ranked_logs WHERE rn > 100
    )
    DELETE FROM public.sync_log
    WHERE id IN (SELECT id FROM logs_to_delete);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.user_typing_data TO authenticated;
GRANT ALL ON TABLE public.sync_log TO authenticated;
GRANT ALL ON TABLE public.user_preferences TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_sync_logs() TO authenticated;