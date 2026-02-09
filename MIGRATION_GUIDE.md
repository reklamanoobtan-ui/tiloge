# 🔄 Database Migration Guide

## ძველი Neon Database-დან ახალში მონაცემების გადატანა

---

## 📋 **3 გზა მონაცემების გადასატანად:**

### 1️⃣ **Python Script (ავტომატური) - რეკომენდებული**
### 2️⃣ **SQL Script (ხელით)**
### 3️⃣ **JSON Backup & Restore**

---

## 1️⃣ **Python Migration Tool (ავტომატური)**

### ✅ **უპირატესობები:**
- ✨ სრულად ავტომატური
- 💾 ავტომატური backup JSON-ში
- 🔍 ავტომატური verification
- ⚡ სწრაფი და უსაფრთხო
- 🔄 Duplicate-ების ავტომატური merge

### 📝 **როგორ გამოვიყენოთ:**

#### **ნაბიჯი 1: დააინსტალირეთ Python**
```bash
# Windows-ზე:
# გადადით https://www.python.org/downloads/
# ან Microsoft Store-დან

# შემდეგ:
pip install asyncpg
```

#### **ნაბიჯი 2: განაახლეთ Connection Strings**

გახსენით `migrate_database.py` და შეცვალეთ:

```python
# OLD DATABASE (ძველი)
OLD_DB_URL = "postgresql://old_user:old_pass@old-host/old_db?sslmode=require"

# NEW DATABASE (ახალი)  
NEW_DB_URL = "postgresql://new_user:new_pass@new-host/new_db?sslmode=require"
```

#### **ნაბიჯი 3: გაუშვით Migration**
```bash
python migrate_database.py
```

#### **რას აკეთებს:**
```
🔄 TILO.LIFE DATABASE MIGRATION TOOL
====================================

📡 Connecting to databases...
   ✅ Connected to OLD database
   ✅ Connected to NEW database

💾 Creating JSON backup: backup.json
   ✅ Backup saved

👥 Migrating users...
   Found 150 users in old database
   ✅ Migrated: 150 users

💬 Migrating last 100 chat messages...
   ✅ Migrated: 100 messages

🎉 Migrating active global events...
   ✅ Migrated: 2 events

🔍 Verifying migration...
   ✅ Total users: 150
   ✅ Total score: 245000
   ✅ VIP users: 5

✅ MIGRATION COMPLETE!
```

---

## 2️⃣ **SQL Script (ხელით)**

### **ნაბიჯი 1: Export ძველი Database-დან**

**ძველ Neon Console-ში (SQL Editor):**

```sql
-- Export Users to JSON
SELECT json_agg(row_to_json(t))
FROM (
    SELECT 
        email, password, nickname, score, coins,
        is_vip, survival_time, best_score,
        last_active, created_at
    FROM users
    ORDER BY id
) t;
```

📋 **დააკოპირეთ** შედეგი და შეინახეთ `users_export.json`

```sql
-- Export Chat Messages
SELECT json_agg(row_to_json(t))
FROM (
    SELECT nickname, message, created_at
    FROM chat_messages
    ORDER BY created_at DESC
    LIMIT 100
) t;
```

📋 **დააკოპირეთ** და შეინახეთ `messages_export.json`

### **ნაბიჯი 2: Import ახალ Database-ში**

**ახალ Neon Console-ში:**

```sql
-- Import Users (მაგალითი)
INSERT INTO users (email, password, nickname, score, coins, is_vip, survival_time, best_score, last_active, created_at)
VALUES 
    ('user1@example.com', 'pass123', 'Player1', 1000, 100, false, 300, 1000, NOW(), NOW()),
    ('user2@example.com', 'pass123', 'Player2', 2000, 200, true, 600, 2000, NOW(), NOW())
    -- დაამატეთ დანარჩენი მონაცემები...
ON CONFLICT (email) DO UPDATE SET
    score = GREATEST(users.score, EXCLUDED.score),
    coins = users.coins + EXCLUDED.coins,
    best_score = GREATEST(users.best_score, EXCLUDED.best_score);
```

⚠️ **შენიშვნა:** ეს მეთოდი შრომატევადია დიდი რაოდენობის მონაცემებისთვის.

---

## 3️⃣ **JSON Backup & Restore**

### **ნაბიჯი 1: შექმენით Backup**

გაუშვით Python script backup mode-ში:

```python
# migrate_database.py-ში დაამატეთ:
await export_to_json(old_conn, "tilo_backup.json")
```

ან გამოიყენეთ SQL:
```sql
SELECT json_build_object(
    'users', (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM users) t),
    'messages', (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM chat_messages LIMIT 100) t),
    'events', (SELECT json_agg(row_to_json(t)) FROM (SELECT * FROM global_events WHERE expires_at > NOW()) t)
);
```

### **ნაბიჯი 2: Restore Backup**

შექმენით restore script ან ხელით ჩასვით მონაცემები.

---

## 🔍 **Verification (შემოწმება)**

### **ახალ Database-ში გაუშვით:**

```sql
-- მთლიანი სტატისტიკა
SELECT 
    'Total Users' as metric,
    COUNT(*) as value
FROM users
UNION ALL
SELECT 
    'Registered Users',
    COUNT(*)
FROM users
WHERE email NOT LIKE 'guest_%'
UNION ALL
SELECT 
    'VIP Users',
    COUNT(*)
FROM users
WHERE is_vip = true
UNION ALL
SELECT 
    'Total Score',
    SUM(score)::TEXT
FROM users
UNION ALL
SELECT 
    'Total Coins',
    SUM(coins)::TEXT
FROM users;
```

```sql
-- TOP 10 შედარება
SELECT 
    nickname,
    score,
    coins,
    is_vip
FROM users
WHERE email NOT LIKE 'guest_%'
ORDER BY score DESC
LIMIT 10;
```

---

## ⚠️ **მნიშვნელოვანი შენიშვნები:**

### **1. Duplicate Emails:**
- თუ ერთი email ორივე database-ში არსებობს
- Migration script ინახავს უმაღლეს score-ს
- Coins-ები ემატება ერთმანეთს

### **2. Guest Users:**
- Guest users (`guest_XXX@tilo.life`) ასევე გადაინაცვლებს
- თუ არ გსურთ, გამოიყენეთ filter:
```sql
WHERE email NOT LIKE 'guest_%'
```

### **3. Chat Messages:**
- Default: ბოლო 100 მესიჯი
- ძველი მესიჯები არ არის საჭირო

### **4. Global Events:**
- მხოლოდ აქტიური events გადაინაცვლებს
- Expired events იგნორირდება

---

## 📊 **Migration Checklist:**

- [ ] ძველი database connection string მზადაა
- [ ] ახალი database connection string მზადაა
- [ ] ახალ database-ში tables შექმნილია (`database_setup.sql`)
- [ ] Python დაინსტალირებულია (თუ იყენებთ Python method-ს)
- [ ] `asyncpg` დაინსტალირებულია (`pip install asyncpg`)
- [ ] Connection strings განახლებულია `migrate_database.py`-ში
- [ ] Backup შექმნილია (უსაფრთხოებისთვის)
- [ ] Migration გაშვებულია
- [ ] Verification queries გაშვებულია
- [ ] TOP 10 players ემთხვევა ძველ database-ს
- [ ] Connection strings განახლებულია თამაშის კოდში

---

## 🚀 **რეკომენდებული Workflow:**

### **1. Preparation (მომზადება)**
```bash
# 1. შექმენით ახალი Neon database
# 2. გაუშვით database_setup.sql
# 3. დააინსტალირეთ Python და asyncpg
```

### **2. Backup (უსაფრთხოება)**
```bash
# შექმენით JSON backup
python migrate_database.py
# ან SQL export
```

### **3. Migration (გადატანა)**
```bash
# გაუშვით migration
python migrate_database.py
```

### **4. Verification (შემოწმება)**
```sql
-- შეამოწმეთ რაოდენობები
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM chat_messages;

-- შეამოწმეთ TOP players
SELECT * FROM users ORDER BY score DESC LIMIT 10;
```

### **5. Update Code (კოდის განახლება)**
```javascript
// script.js, admin.html, server.py
const sql = neon("ახალი_connection_string");
```

### **6. Test (ტესტირება)**
```
# გაუშვით თამაში
# დარეგისტრირდით
# შეამოწმეთ admin panel
```

---

## 🐛 **Troubleshooting:**

### **❌ "Connection timeout"**
- Neon free plan ჩერდება 5 წუთის შემდეგ
- პირველი connection 2-3 წამი სჭირდება

### **❌ "Table does not exist"**
- გაუშვით `database_setup.sql` ახალ database-ში

### **❌ "Duplicate key violation"**
- გამოიყენეთ `ON CONFLICT` clause
- ან წაშალეთ duplicates ძველ database-ში

### **❌ "Permission denied"**
- შეამოწმეთ database credentials
- დარწმუნდით რომ user-ს აქვს INSERT rights

---

## 📞 **დახმარება:**

თუ პრობლემა გაქვთ:
1. შეამოწმეთ `backup.json` - მონაცემები შენახულია
2. გაუშვით verification queries
3. შეადარეთ ძველი და ახალი database-ის COUNT-ები
4. დამიწერეთ error message

---

**შექმნილია:** 2026-02-09  
**ვერსია:** 1.0  
**პროექტი:** Tilo.life 🧼
