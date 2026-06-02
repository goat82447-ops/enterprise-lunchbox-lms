LunchBox Delivery Platform - Complete Setup Guide
📋 System Requirements
Minimum Hardware
Component	Minimum	Recommended
RAM	4 GB	8 GB
Disk Space	2 GB	5 GB
CPU	Dual Core	Quad Core
OS	Windows 10 / macOS 12 / Ubuntu 20	Latest
Required Software
Software	Version	Purpose
Node.js	20.x or higher	JavaScript runtime
npm	10.x or higher	Package manager
.NET	10.0 or higher	Parcel Service runtime
Angular CLI	20.x	Frontend build tool
Git	Any	Version control
🚀 Quick Start (All Services)
Step 1: Navigate to Project Root
cd c:\TEST\zip.worktrees\agents-login-test-frontend-backend\Ekart\Ekart
Step 2: Open 4 Terminal Windows
You need 4 separate terminals to run all services in parallel:

Terminal 1: Backend Auth Service
Terminal 2: Frontend (Angular)
Terminal 3: Parcel Service
Terminal 4: (Optional) For testing APIs
🔧 Installation & Setup
TERMINAL 1: Backend Auth Service (Node.js)
Step 1.1: Navigate to Auth Service
cd Backend\microservices\services\auth-service
Step 1.2: Install Dependencies
npm install
Step 1.3: Create Data Directory
mkdir data
Step 1.4: Start the Backend
Windows (PowerShell):

$env:AUTH_DB_FILE="./data/auth.sqlite"
$env:OTP_DEBUG_MODE="1"
npm run dev
Windows (Command Prompt):

set AUTH_DB_FILE=./data/auth.sqlite
set OTP_DEBUG_MODE=1
npm run dev
Expected Output:

[nodemon] starting `node src/index.js`
auth-service listening on :3003
TERMINAL 2: Frontend (Angular)
Step 2.1: Navigate to Frontend
cd Frontend\lunchbox-app
Step 2.2: Install Dependencies
npm install
(This will take 2-5 minutes)

Step 2.3: Start the Frontend
ng serve --port 4300
Expected Output:

✔ Compiled successfully.
Watch mode enabled. Watching for file changes...
  ➜  Local: http://localhost:4300/
TERMINAL 3: Parcel Service (.NET)
Step 3.1: Navigate to Parcel Service
cd Backend\dotnet\ParcelService
Step 3.2: Build the Project
dotnet build
Step 3.3: Start the Service
dotnet run
Expected Output:

info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://localhost:5156
info: Microsoft.Hosting.Lifetime[0]
      Application started. Press Ctrl+C to shut down.
📡 Service URLs & Ports
Service	URL	Port	Status
Frontend (Angular)	http://localhost:4300	4300	Main UI
Auth Service Backend	http://localhost:3003	3003	API Gateway
Parcel Service	http://localhost:5156	5156	Parcel Tracking
Health Check	http://localhost:3003/health	3003	Backend Status
🔐 Test Credentials
User Account (Customer)
Username: user
Password: user123
Admin Account
Username: admin
Password: admin123
Database: Both users are auto-seeded in SQLite when backend starts.

🧪 Testing the Application
Step 1: Open Frontend
Open your browser and navigate to:

http://localhost:4300
You should see the Login Page.

Step 2: Test Login
Enter username: user
Enter password: user123
Click Login
You'll be redirected to the Home Page
Step 3: Test API (Optional)
Check backend health:

curl http://localhost:3003/health
Expected Response:

{"service":"auth-service","status":"ok"}
Step 4: Test Features
✅ Create a Booking
✅ View Booking History
✅ Check Parcel Status
✅ Update Profile
✅ Logout
🛑 Stopping the Services
To stop all services:

Terminal 1: Press Ctrl + C (Auth Service)
Terminal 2: Press Ctrl + C (Frontend)
Terminal 3: Press Ctrl + C (Parcel Service)
📂 Project Structure
Ekart/
├── Backend/
│   ├── microservices/
│   │   ├── services/
│   │   │   ├── api-gateway/          # API Gateway (optional)
│   │   │   ├── auth-service/         # Auth Service (Node.js) - PORT 3003
│   │   │   ├── menu-service/         # Menu Service (optional)
│   │   │   ├── order-service/        # Order Service (optional)
│   │   │   └── worker-service/       # Worker Service (optional)
│   │   ├── docker-compose.yml        # Docker setup (optional)
│   │   └── package.json              # Workspace config
│   └── dotnet/
│       ├── AuthService/              # Auth Service (.NET)
│       ├── ParcelService/            # Parcel Service (.NET) - PORT 5156
│       └── LunchBox.slnx             # Solution file
├── Frontend/
│   └── lunchbox-app/                 # Angular 20 App - PORT 4300
│       ├── src/
│       ├── package.json
│       ├── angular.json
│       └── tsconfig.json
└── complete-project-setup.md         # Extended documentation
🔄 Service Dependencies
Frontend (Angular) 
    ↓
    └→ Auth Service (Node.js)
        ├→ Parcel Service (.NET)
        └→ Database (SQLite)
Flow:

User opens Frontend (http://localhost:4300)
Frontend authenticates with Auth Service (http://localhost:3003)
Auth Service handles login & sessions
Frontend can also interact with Parcel Service (http://localhost:5156) for tracking
🐛 Troubleshooting
Port Already in Use
If you get "Port 3003/4300/5156 already in use":

Windows:

# Kill process on port 3003
netstat -ano | findstr :3003
taskkill /PID <PID> /F

# Kill process on port 4300
netstat -ano | findstr :4300
taskkill /PID <PID> /F

# Kill process on port 5156
netstat -ano | findstr :5156
taskkill /PID <PID> /F
npm install fails
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
Angular build fails
# Clear Angular cache
rm -rf .angular
ng serve --port 4300
.NET build fails
dotnet clean
dotnet build
Cannot connect to services
Verify all 3 terminals are running
Check port numbers match (3003, 4300, 5156)
Check firewall is not blocking ports
Restart all services
📊 Database Information
Auth Service Database
Type: SQLite
Location: Backend/microservices/services/auth-service/data/auth.sqlite
Tables: users, bookings, sessions, etc.
Default Users: user / user123, admin / admin123
Parcel Service Database
Type: SQLite (with Entity Framework Core)
Location: Auto-created in Parcel Service folder
Tables: Bookings, TrackingEvents
Sample Data: Pre-seeded with test parcel
🔧 Advanced Setup Options
Option A: Run with Docker (Microservices Only)
cd Backend/microservices
docker compose up --build
Option B: Run Individual Microservices
# In separate terminals:

# Auth Service
cd Backend/microservices/services/auth-service
npm run dev

# Menu Service
cd Backend/microservices/services/menu-service
npm run dev

# Orders Service
cd Backend/microservices/services/order-service
npm run dev

# Worker Service
cd Backend/microservices/services/worker-service
npm run dev
Option C: Production Build
# Frontend
cd Frontend/lunchbox-app
ng build --configuration production

# Parcel Service
cd Backend/dotnet/ParcelService
dotnet publish -c Release
📚 API Endpoints (Auth Service)
Health Check
GET http://localhost:3003/health
User Login
POST http://localhost:3003/login
Content-Type: application/json

{
  "username": "user",
  "password": "user123"
}
User Logout
POST http://localhost:3003/logout
Create Booking
POST http://localhost:3003/bookings
Authorization: Bearer <token>
Content-Type: application/json

{
  "pickupAddress": "123 Main St",
  "deliveryAddress": "456 Park Ave",
  "serviceType": "food",
  "vehicleType": "bike"
}
✅ Verification Checklist
After starting all services, verify:

[ ] Auth Service running on http://localhost:3003/health
[ ] Frontend accessible at http://localhost:4300
[ ] Parcel Service running on http://localhost:5156
[ ] Can login with user / user123
[ ] Can create a booking
[ ] Can view booking history
[ ] Can check parcel tracking
📞 Support & Debugging
Check Service Logs
Auth Service: Check Terminal 1 output
Frontend: Check Terminal 2 output
Parcel Service: Check Terminal 3 output
Common Issues
Services won't start → Check Node.js/npm/dotnet versions
Port conflicts → Use different ports or kill existing processes
CORS errors → Check Auth Service has CORS enabled
Database errors → Delete data folder and restart
🎯 Next Steps
✅ Run all services (steps above)
✅ Test login and basic features
✅ Create sample bookings
✅ Test parcel tracking
✅ Explore admin features
✅ Check API responses in browser console
Version: 1.0
Last Updated: June 2, 2026
Platform: LunchBox Delivery
Author: Development Team

📝 Notes
All services use SQLite for data persistence
Frontend is built with Angular 20
Backend uses Node.js + Express for APIs
Parcel Service uses .NET 10 with Entity Framework
All data is auto-seeded on first run
No external database required (everything local)
