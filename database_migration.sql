-- ============================================
-- DATABASE MIGRATION SCRIPT
-- ძველი Neon Database-დან ახალში მონაცემების გადატანა
-- ============================================

-- ============================================
-- STEP 1: Export Data from OLD Database
-- ============================================
-- გაუშვით ეს ძველ database-ში და შეინახეთ შედეგები

-- Export Users
COPY (
    SELECT 
        email,
        password,
        nickname,
        score,
        coins,
        is_vip,
        survival_time,
        best_score,
        last_active,
        created_at
    FROM users
    ORDER BY id
) TO STDOUT WITH CSV HEADER;

-- ან JSON ფორმატში:
SELECT json_agg(row_to_json(t))
FROM (
    SELECT 
        email,
        password,
        nickname,
        score,
        coins,
        is_vip,
        survival_time,
        best_score,
        last_active,
        created_at
    FROM users
    ORDER BY id
) t;

-- Export Chat Messages (ბოლო 100)
SELECT json_agg(row_to_json(t))
FROM (
    SELECT 
        nickname,
        message,
        created_at
    FROM chat_messages
    ORDER BY created_at DESC
    LIMIT 100
) t;

-- Export Global Events (აქტიური)
SELECT json_agg(row_to_json(t))
FROM (
    SELECT 
        event_type,
        event_value,
        expires_at,
        created_at
    FROM global_events
    WHERE expires_at > NOW()
) t;

-- ============================================
-- STEP 2: Import Data to NEW Database
-- ============================================
-- გაუშვით ეს ახალ database-ში

-- Import Users (მაგალითი - ჩასვით თქვენი მონაცემები)
INSERT INTO users (email, password, nickname, score, coins, is_vip, survival_time, best_score, last_active, created_at)
VALUES 
    -- ჩასვით თქვენი მონაცემები აქ
    ('user1@example.com', 'pass123', 'Player1', 1000, 100, false, 300, 1000, NOW(), NOW()),
    ('user2@example.com', 'pass123', 'Player2', 2000, 200, true, 600, 2000, NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
    score = GREATEST(users.score, EXCLUDED.score),
    coins = users.coins + EXCLUDED.coins,
    survival_time = GREATEST(users.survival_time, EXCLUDED.survival_time),
    best_score = GREATEST(users.best_score, EXCLUDED.best_score),
    last_active = EXCLUDED.last_active;

-- Import Chat Messages
INSERT INTO chat_messages (nickname, message, created_at)
VALUES 
    -- ჩასვით თქვენი მონაცემები აქ
    ('Player1', 'Hello!', NOW()),
    ('Player2', 'Welcome!', NOW());

-- Import Global Events
INSERT INTO global_events (event_type, event_value, expires_at, created_at)
VALUES 
    -- ჩასვით თქვენი მონაცემები აქ
    ('multiplier', '2', NOW() + INTERVAL '5 minutes', NOW());

-- ============================================
-- VERIFICATION
-- ============================================

-- შეამოწმეთ რამდენი მოთამაშე გადმოვიდა
SELECT 
    'Users migrated' as status,
    COUNT(*) as count,
    SUM(score) as total_score,
    SUM(coins) as total_coins
FROM users;

-- შეამოწმეთ TOP 10
SELECT 
    nickname,
    score,
    coins,
    is_vip
FROM users
ORDER BY score DESC
LIMIT 10;

-- შეამოწმეთ VIP მოთამაშეები
SELECT 
    COUNT(*) as vip_count
FROM users
WHERE is_vip = true;
