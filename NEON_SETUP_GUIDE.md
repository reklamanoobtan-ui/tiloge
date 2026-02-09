# 🗄️ Neon Database Setup Guide

## ახალი Neon Database-ის შექმნა და კონფიგურაცია

### 📋 ნაბიჯ-ნაბიჯ ინსტრუქცია:

---

## 1️⃣ **Neon Project-ის შექმნა**

1. **გადადით:** https://console.neon.tech
2. **შედით** ან **დარეგისტრირდით**
3. **დააჭირეთ:** "Create a project" ან "New Project"
4. **შეავსეთ:**
   - **Project Name:** `tilo-game` (ან სასურველი სახელი)
   - **Region:** აირჩიეთ ყველაზე ახლო (მაგ: `AWS EU Central (Frankfurt)`)
   - **Postgres Version:** 16 (უახლესი)
5. **დააჭირეთ:** "Create Project"

---

## 2️⃣ **Connection String-ის კოპირება**

პროექტის შექმნის შემდეგ ნახავთ Connection String-ს:

```
postgresql://username:password@host/database?sslmode=require
```

**მაგალითი:**
```
postgresql://neondb_owner:npg_ABC123xyz@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

📋 **დააკოპირეთ** ეს string - დაგჭირდებათ!

---

## 3️⃣ **Database Tables-ის შექმნა**

### ვარიანტი A: SQL Editor-ში (რეკომენდებული)

1. **Neon Console-ში** გადადით **"SQL Editor"** tab-ზე
2. **გახსენით** `database_setup.sql` ფაილი (ეს repository-ში)
3. **დააკოპირეთ** მთელი კოდი
4. **ჩასვით** Neon SQL Editor-ში
5. **დააჭირეთ** "Run" ან Ctrl+Enter
6. **დაელოდეთ** - უნდა ნახოთ: `✅ Database setup complete!`

### ვარიანტი B: ნაბიჯ-ნაბიჯ

თუ გსურთ ცალ-ცალკე გაშვება:

**1. შექმენით Users ცხრილი:**
```sql
CREATE TABLE users (
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
```

**2. შექმენით Chat Messages ცხრილი:**
```sql
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**3. შექმენით Global Events ცხრილი:**
```sql
CREATE TABLE global_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    event_value VARCHAR(50) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**4. შექმენით Indexes (Performance-ისთვის):**
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_score ON users(score DESC);
CREATE INDEX idx_chat_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_events_expires ON global_events(expires_at);
```

---

## 4️⃣ **Connection String-ის განახლება კოდში**

თქვენი ახალი Connection String უნდა ჩასვათ 3 ფაილში:

### 📄 **1. script.js** (ხაზი 8)
```javascript
const sql = neon("თქვენი_connection_string_აქ");
```

### 📄 **2. admin.html** (ხაზი 141)
```javascript
const sql = neon("თქვენი_connection_string_აქ");
```

### 📄 **3. server.py** (ხაზი 34)
```python
DATABASE_URL = "თქვენი_connection_string_აქ"
```

---

## 5️⃣ **შემოწმება**

### Neon Console-ში:
```sql
-- ცხრილების სია
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- უნდა ნახოთ:
-- users
-- chat_messages
-- global_events
```

### Admin Panel-ში:
1. გახსენით `admin.html`
2. შედით admin პაროლით
3. გადადით "👥 Players Database"
4. უნდა ნახოთ: "Total Players: 1" (admin user)

---

## 6️⃣ **Test Data-ის დამატება (Optional)**

```sql
-- Test მოთამაშეები
INSERT INTO users (email, password, nickname, score, coins, is_vip)
VALUES 
    ('test1@tilo.life', 'pass123', 'TestPlayer1', 1000, 100, false),
    ('test2@tilo.life', 'pass123', 'TestPlayer2', 2000, 200, false),
    ('vip@tilo.life', 'pass123', 'VIPPlayer', 5000, 500, true);

-- Test მესიჯები
INSERT INTO chat_messages (nickname, message)
VALUES 
    ('TestPlayer1', 'Hello everyone! 👋'),
    ('TestPlayer2', 'Good luck! 🎮'),
    ('📢 SYSTEM', 'Welcome to Tilo.life! 🧼');
```

---

## 🔧 **Troubleshooting**

### ❌ "relation already exists"
- ეს ნორმალურია თუ ცხრილები უკვე არსებობს
- გამოიყენეთ: `DROP TABLE table_name CASCADE;` (ფრთხილად!)

### ❌ "permission denied"
- დარწმუნდით რომ სწორ database-ზე ხართ
- შეამოწმეთ user permissions

### ❌ "connection timeout"
- Neon-ის free plan ჩერდება 5 წუთის შემდეგ
- პირველი query 2-3 წამი სჭირდება

---

## 📊 **Database Structure**

```
📁 neondb
├── 📋 users (მოთამაშეები)
│   ├── id (PRIMARY KEY)
│   ├── email (UNIQUE)
│   ├── password
│   ├── nickname
│   ├── score
│   ├── coins
│   ├── is_vip
│   ├── survival_time
│   ├── best_score
│   ├── last_active
│   └── created_at
│
├── 📋 chat_messages (ჩატი)
│   ├── id (PRIMARY KEY)
│   ├── nickname
│   ├── message
│   └── created_at
│
└── 📋 global_events (ივენთები)
    ├── id (PRIMARY KEY)
    ├── event_type
    ├── event_value
    ├── expires_at
    └── created_at
```

---

## ✅ **Checklist**

- [ ] Neon project შექმნილია
- [ ] Connection string დაკოპირებულია
- [ ] `database_setup.sql` გაშვებულია
- [ ] ყველა 3 ცხრილი შექმნილია
- [ ] Indexes დამატებულია
- [ ] Connection string განახლებულია კოდში
- [ ] Admin panel მუშაობს
- [ ] Test data დამატებულია (optional)

---

## 🚀 **შემდეგი ნაბიჯები**

1. ✅ Database მზადაა
2. 🔄 განაახლეთ connection strings კოდში
3. 🧪 ატესტეთ თამაში
4. 🎮 ისიამოვნეთ!

---

## 📞 **დახმარება**

თუ რაიმე პრობლემა გაქვთ:
1. შეამოწმეთ Neon Console → SQL Editor
2. გაუშვით: `SELECT * FROM users LIMIT 5;`
3. თუ მუშაობს - database კარგადაა!
4. თუ არა - დამიწერეთ error message

---

**შექმნილია:** 2026-02-09  
**ვერსია:** 1.0  
**პროექტი:** Tilo.life 🧼
