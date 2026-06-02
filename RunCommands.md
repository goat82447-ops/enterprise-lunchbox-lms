🚀 BACKEND SERVICE - STARTUP COMMANDS
Quick Copy-Paste Commands
STEP 1: Navigate to Backend
cd c:\TEST\zip.worktrees\agents-login-test-frontend-backend\Ekart\Ekart\Backend\microservices
STEP 2: Install Dependencies (First time only)
npm install
STEP 3: Go to Auth Service
cd services\auth-service
STEP 4: Create Data Folder (First time only)
mkdir data
STEP 5: START BACKEND - Choose ONE Option
✅ OPTION A - Best (With auto-restart on file changes)
npm run dev
Option B - Simple start
npm start
Option C - Direct node command
$env:AUTH_DB_FILE="./data/auth.sqlite"
$env:OTP_DEBUG_MODE="1"
node src/index.js
Option D - From parent folder
cd ..
npm run dev:auth
✅ When Backend is Ready
You will see this message:

[nodemon] starting `node src/index.js`
auth-service listening on :3003
🧪 Test Backend is Running
# In another terminal/PowerShell:
curl http://localhost:3003/health
Or open in browser:

http://localhost:3003/health
Expected response:

{"service":"auth-service","status":"ok"}
🛑 Stop Backend
Press: Ctrl + C

📍 All Commands Summary (Copy-Paste Ready)
# Go to backend folder
cd c:\TEST\zip.worktrees\agents-login-test-frontend-backend\Ekart\Ekart\Backend\microservices

# Install (first time)
npm install

# Go to auth service
cd services\auth-service

# Create data folder (first time)
mkdir data

# Start backend (best option)
npm run dev

# OR shorter way from microservices folder:
cd ..
npm run dev:auth
💡 What Each Part Does
Command	What it does
cd ...Backend\microservices	Navigates to microservices folder
npm install	Downloads all dependencies
cd services\auth-service	Goes to auth service
mkdir data	Creates SQLite database folder
npm run dev	Starts server with auto-restart (nodemon)
npm start	Starts server without auto-restart
🎯 Fastest Way (If everything installed)
Just run from services\auth-service folder:

npm run dev
Done! Backend running on http://localhost:3003 ✅
