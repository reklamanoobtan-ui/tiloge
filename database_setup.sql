-- ============================================
-- TILO.LIFE DATABASE SETUP SCRIPT
-- ============================================
-- Run this in Neon SQL Editor to create all tables

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    score INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    is_vip BOOLEAN DEFAULT FALSE,
    survival_time INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    last_active TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC);
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);

-- ============================================
-- 2. CHAT MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_created_at ON chat_messages(created_at DESC);

-- ============================================
-- 3. GLOBAL EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS global_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    event_value VARCHAR(50) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for active events
CREATE INDEX IF NOT EXISTS idx_events_expires ON global_events(expires_at);

-- ============================================
-- 4. LEADERBOARD VIEW (Optional)
-- ============================================
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
    nickname,
    score,
    survival_time,
    coins,
    is_vip,
    last_active
FROM users
WHERE email NOT LIKE 'guest_%'
ORDER BY score DESC
LIMIT 100;

-- ============================================
-- 5. INSERT SAMPLE DATA (Optional)
-- ============================================

-- Sample admin user (password: admin123)
INSERT INTO users (email, password, nickname, score, coins, is_vip)
VALUES ('admin@tilo.life', 'admin123', 'Admin', 0, 10000, true)
ON CONFLICT (email) DO NOTHING;

-- Sample system messages
INSERT INTO chat_messages (nickname, message)
VALUES 
    ('📢 SYSTEM', 'Welcome to Tilo.life! 🧼'),
    ('📢 SYSTEM', 'Clean the stains and collect coins! 🪙'),
    ('📢 SYSTEM', 'Good luck! 🎮')
ON CONFLICT DO NOTHING;

-- ============================================
-- 6. CLEANUP FUNCTION (Auto-delete old messages)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM chat_messages
    WHERE created_at < NOW() - INTERVAL '10 seconds';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check users count
SELECT COUNT(*) as total_users FROM users;

-- Check chat messages count
SELECT COUNT(*) as total_messages FROM chat_messages;

-- Check global events count
SELECT COUNT(*) as total_events FROM global_events;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT '✅ Database setup complete!' as status;
