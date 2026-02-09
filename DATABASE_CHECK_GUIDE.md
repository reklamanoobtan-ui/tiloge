# როგორ შევამოწმოთ Neon Database

## 🔍 3 გზა მონაცემების შესამოწმებლად:

### 1️⃣ **Neon Console-ში (ყველაზე მარტივი)**

1. გადადით: https://console.neon.tech
2. შედით თქვენი account-ით
3. აირჩიეთ თქვენი project (neondb)
4. გადადით **SQL Editor** ან **Tables** tab-ზე
5. გაუშვით query:

```sql
-- ყველა მოთამაშე
SELECT COUNT(*) FROM users;

-- რეგისტრირებული მოთამაშეები
SELECT COUNT(*) FROM users WHERE email NOT LIKE 'guest_%';

-- TOP 10
SELECT nickname, score, coins, survival_time, is_vip 
FROM users 
WHERE email NOT LIKE 'guest_%'
ORDER BY score DESC 
LIMIT 10;

-- ყველა ცხრილი
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

### 2️⃣ **Admin Panel-ში (უკვე მზადაა)**

1. გახსენით: `admin.html`
2. შედით admin პაროლით
3. გადახვიდით **"👥 Players Database"** სექციაზე
4. დააჭირეთ **🔄 Refresh**
5. უნდა ჩანდეს ყველა რეგისტრირებული მოთამაშე

თუ არ ჩანს:
- გახსენით Browser Console (F12)
- ნახეთ არის თუ არა errors
- შეამოწმეთ ინტერნეტ კავშირი

### 3️⃣ **Browser Console-ში (სწრაფი შემოწმება)**

1. გახსენით `admin.html` ან `index.html`
2. დააჭირეთ F12 (Developer Tools)
3. გადადით **Console** tab-ზე
4. ჩასვით და გაუშვით:

```javascript
// სწრაფი შემოწმება
import { neon } from 'https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.9.4/+esm';
const sql = neon("postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

// მოთამაშეების რაოდენობა
const users = await sql`SELECT COUNT(*) FROM users`;
console.log('Total users:', users[0].count);

// TOP 5
const top = await sql`SELECT nickname, score FROM users WHERE email NOT LIKE 'guest_%' ORDER BY score DESC LIMIT 5`;
console.table(top);
```

## 📊 რას უნდა ხედავდეთ:

### თუ ყველაფერი კარგადაა:
```
✅ Total Users: 150
✅ Registered Users: 45
✅ Guest Users: 105

🏆 Top 5 Players:
1. 👑 NikaGamer - Score: 15420, Coins: 1250
2.    Luka123 - Score: 12300, Coins: 980
3.    Mari_Pro - Score: 10500, Coins: 750
...
```

### თუ პრობლემაა:
```
❌ Database Error: connection timeout
❌ Database Error: table "users" does not exist
❌ No registered players found
```

## 🔧 რა გავაკეთოთ თუ მონაცემები არ ჩანს:

### შემთხვევა 1: "No players found"
- ეს ნორმალურია თუ ჯერ არავინ დარეგისტრირებულა
- სცადეთ თამაშის დაწყება და რეგისტრაცია

### შემთხვევა 2: "Connection error"
- შეამოწმეთ ინტერნეტი
- დარწმუნდით რომ Neon database აქტიურია
- Neon-ის უფასო plan-ს აქვს auto-suspend (5 წუთის უმოქმედობის შემდეგ)
- პირველი query შეიძლება 2-3 წამი დასჭირდეს

### შემთხვევა 3: "Table does not exist"
- Database-ში არ არის შექმნილი tables
- საჭიროა migration-ის გაშვება

## 🎯 Database Structure:

თქვენი database უნდა შეიცავდეს:

### Tables:
1. **users** - მოთამაშეების მონაცემები
   - id, email, password, nickname, score, coins, is_vip, survival_time, best_score, last_active

2. **chat_messages** - ჩატის მესიჯები
   - id, nickname, message, created_at

3. **global_events** - გლობალური ივენთები
   - id, event_type, event_value, expires_at, created_at

## 📝 სასარგებლო Commands:

```sql
-- ყველა ცხრილის სია
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- users ცხრილის სტრუქტურა
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users';

-- ბოლო 10 რეგისტრაცია
SELECT nickname, email, created_at FROM users ORDER BY id DESC LIMIT 10;

-- VIP მოთამაშეები
SELECT nickname, score, coins FROM users WHERE is_vip = true;

-- აქტიური ივენთები
SELECT * FROM global_events WHERE expires_at > NOW();
```

## 🚀 რჩევები:

1. **Neon Console** - ყველაზე სანდო და ვიზუალური
2. **Admin Panel** - მოსახერხებელი ყოველდღიური გამოყენებისთვის
3. **Browser Console** - სწრაფი debugging-ისთვის

---

**შენიშვნა:** Neon-ის უფასო plan ავტომატურად ჩერდება (suspend) 5 წუთის უმოქმედობის შემდეგ. პირველი query-ს შეიძლება 2-3 წამი დასჭირდეს database-ის გასააქტიურებლად.
