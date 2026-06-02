🚀 LunchBox Delivery Platform - NEW SYSTEM SETUP
Complete Guide to Run Everything on a Fresh System
✅ Prerequisites Checklist
Before starting, ensure you have:

[ ] Node.js 20.x or higher - Download from https://nodejs.org

node --version    # Should show v20.x.x or higher
npm --version     # Should show 10.x.x or higher
[ ] .NET 10.0 or higher - Download from https://dotnet.microsoft.com

dotnet --version  # Should show 10.0.0 or higher
[ ] Angular CLI (optional, might be installed globally)

ng --version      # Should show latest version
[ ] Git - For version control (optional)

git --version
[ ] 4 Terminal Windows - Or use VS Code with multiple terminals

📥 Project Setup
Step 0: Extract and Navigate
# If not already done, extract the zip files
cd c:\TEST\zip.worktrees\agents-login-test-frontend-backend

# Extract both zips
Expand-Archive -Path Ekart.zip -DestinationPath Ekart
Expand-Archive -Path LunchBox-KrishnaProject.zip -DestinationPath LunchBox

# Navigate to the main project
cd Ekart\Ekart
🔧 Installation Phase
Install All Dependencies (Do This First)
Terminal Window 1 - Install Auth Service:

cd Backend\microservices\services\auth-service
npm install
mkdir data
Terminal Window 2 - Install Frontend:

cd Frontend\lunchbox-app
npm install
(This might take 2-5 minutes - wait for it to complete)

Terminal Window 3 - Build Parcel Service:

cd Backend\dotnet\ParcelService
dotnet build
🚀 Starting All Services
Once installations are complete, keep 3 terminal windows open for running services.

Terminal 1: Backend Auth Service (Node.js)
# Windows PowerShell
cd Backend\microservices

npm run dev:auth

# Or if that doesn't work, use:
# cd services/auth-service
# $env:AUTH_DB_FILE="./data/auth.sqlite"
# $env:OTP_DEBUG_MODE="1"
# npm run dev
Expected Output:

> auth-service@1.0.0 dev
> nodemon src/index.js
[nodemon] 3.1.14
[nodemon] starting `node src/index.js`
auth-service listening on :3003
✅ Backend is ready when you see: auth-service listening on :3003

Terminal 2: Frontend (Angular)
cd Frontend\lunchbox-app
ng serve --port 4300
Expected Output:

✔ Compiled successfully.
Watch mode enabled. Watching for file changes...
NOTE: Raw file sizes do not reflect development server per-request transformations.
  ➜  Local:   http://localhost:4300/
  ➜  press h + enter to show help
✅ Frontend is ready when you see: http://localhost:4300/

Terminal 3: Parcel Service (.NET)
cd Backend\dotnet\ParcelService
dotnet run
Expected Output:

Building...
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://localhost:5156
info: Microsoft.Hosting.Lifetime[0]
      Application started. Press Ctrl+C to shut down.
✅ Parcel Service is ready when you see: Now listening on: http://localhost:5156

🧪 Verify All Services Are Running
Method 1: Check Ports (Terminal 4)
netstat -ano | findstr ":3003"    # Should show something
netstat -ano | findstr ":4300"    # Should show something
netstat -ano | findstr ":5156"    # Should show something
Method 2: Test URLs (Browser or curl)
# Backend health check
curl http://localhost:3003/health

# Frontend (should load the login page)
curl http://localhost:4300

# Parcel service
curl http://localhost:5156
Method 3: Visual Check
If all three terminals show no errors and are listening on the ports, you're good to go!

🧑‍💻 Test Application Workflow
Step 1: Open Frontend in Browser
http://localhost:4300
You should see the Login Page.

Step 2: Login with Test Credentials
Username: user
Password: user123
Click Login button.

Step 3: Verify You're Logged In
You should be redirected to the Home Page
You should see the dashboard with available services
Step 4: Create a Booking
Click "Book Now" or navigate to Bookings
Fill in the form:
Pickup Address: 123 Main Street
Delivery Address: 456 Park Avenue
Service Type: Select one (food, parcel, document)
Vehicle Type: Select one (bike, auto, car)
Payment Method: Select one
Click Submit or Book
You should see a confirmation
Step 5: Check Booking History
Navigate to Bookings or My Bookings
You should see the booking you just created
Click on it to see details
Step 6: Test Parcel Tracking
If available, click on Track Parcel or similar option
Enter a booking ID or parcel number
You should see tracking information with:
Current status
Location (latitude/longitude)
Estimated delivery time
Tracking events history
Step 7: Test Admin Features (Optional)
Logout first
Login with admin credentials:
Username: admin
Password: admin123
You should see admin dashboard with:
All bookings
User management
Statistics/reports
System settings
Step 8: Logout
Click your profile or logout button
You should be redirected to login page
📊 Service Reference
Service Ports & URLs
Service	URL	Port	Technology	Database	Status
Frontend	http://localhost:4300	4300	Angular 20	Browser	🟢 Running
Auth API	http://localhost:3003	3003	Node.js/Express	SQLite	🟢 Running
Parcel API	http://localhost:5156	5156	.NET 10	SQLite	🟢 Running
API Base URLs for Testing
// In your app or API tests:
const API_URL = "http://localhost:3003";
const PARCEL_API_URL = "http://localhost:5156";

// Health check
GET ${API_URL}/health

// Login
POST ${API_URL}/login
Body: { username: "user", password: "user123" }

// Bookings
GET ${API_URL}/bookings
POST ${API_URL}/bookings
GET ${API_URL}/bookings/:id
🛑 Stopping Services
To stop all services gracefully:

Terminal 1 (Backend): Press Ctrl + C

Nodemon will stop
Node process will terminate
Terminal 2 (Frontend): Press Ctrl + C

Angular dev server will stop
Webpack will terminate
Terminal 3 (Parcel Service): Press Ctrl + C

.NET runtime will stop
Application will shut down
🗄️ Database Information
Authentication Service Database
Location: Backend\microservices\services\auth-service\data\auth.sqlite

Default Users (Auto-seeded):

Table: users
├─ user (password: user123, role: customer)
└─ admin (password: admin123, role: admin)
Tables:

users - User accounts and authentication
bookings - All booking records
sessions - Active user sessions
otps - OTP codes for verification
Parcel Service Database
Location: Auto-created in Parcel Service folder

Tables:

Bookings - Parcel booking records

Fields: TrackingNumber, SenderName, ReceiverName, Status, Price, etc.
Sample Data: Pre-seeded with example parcel
TrackingEvents - Tracking history

Fields: ParcelBookingId, Status, Message, Location, Timestamp
Sample Data: Multiple events showing parcel journey
🐛 Troubleshooting
Issue: Port Already in Use
Error: EADDRINUSE: address already in use :::3003

Solution:

# Find process using port
netstat -ano | findstr :3003

# Kill the process (replace XXXX with PID)
taskkill /PID XXXX /F

# Try again
npm run dev:auth
Issue: npm install fails
Error: npm ERR! code ERESOLVE

Solution:

npm cache clean --force
rm -rf node_modules package-lock.json
npm install
Issue: Angular build fails
Error: NG0300: error TS1205

Solution:

rm -rf .angular
ng cache clean
ng serve --port 4300
Issue: .NET build fails
Error: The target framework is not installed

Solution:

# Install correct .NET version
dotnet --list-sdks

# Or download from https://dotnet.microsoft.com/download
dotnet clean
dotnet build
Issue: Cannot connect to services
Checklist:

[ ] All 3 terminals show "listening" messages?
[ ] No red error messages in terminals?
[ ] Correct ports (3003, 4300, 5156)?
[ ] Firewall not blocking ports?
[ ] Try restarting services?
📝 Commands Summary
Quick Copy-Paste Setup (4 Terminals)
Terminal 1:

cd Backend\microservices
npm run dev:auth
Terminal 2:

cd Frontend\lunchbox-app
npm install
ng serve --port 4300
Terminal 3:

cd Backend\dotnet\ParcelService
dotnet build
dotnet run
Terminal 4 (Testing):

# Test health
curl http://localhost:3003/health
curl http://localhost:4300
curl http://localhost:5156
🎯 Testing Scenarios
Scenario 1: Basic Login Test
1. Open http://localhost:4300
2. Enter: user / user123
3. Click Login
4. Should see Home page
5. Check browser console (F12) for any errors
Scenario 2: Create Booking
1. Login as user
2. Click "Book Now"
3. Fill form and submit
4. Should see success message
5. Check booking appears in history
Scenario 3: Parcel Tracking
1. Create a booking (or use existing)
2. View tracking information
3. Check real-time status updates
4. Verify location coordinates
5. Check estimated delivery time
Scenario 4: Admin Operations
1. Login as admin / admin123
2. View all bookings
3. View user list
4. Check statistics
5. Test admin-specific features
📚 Additional Resources
Configuration Files to Know
Frontend/lunchbox-app/angular.json - Angular configuration
Frontend/lunchbox-app/tsconfig.json - TypeScript config
Frontend/lunchbox-app/src/main.ts - Entry point
Backend/microservices/services/auth-service/src/index.js - Backend entry
Backend/dotnet/ParcelService/Program.cs - .NET entry
Backend/dotnet/ParcelService/appsettings.json - .NET config
Environment Variables
# Auth Service
AUTH_DB_FILE=./data/auth.sqlite
OTP_DEBUG_MODE=1

# Frontend
ANGULAR_CLI_ANALYTICS=false

# Parcel Service
ASPNETCORE_ENVIRONMENT=Development
✅ Final Checklist Before Production
[ ] All services start without errors
[ ] Can login with test credentials
[ ] Can create and view bookings
[ ] Parcel tracking works
[ ] All features tested
[ ] No console errors (F12)
[ ] Database populated with test data
[ ] Admin features verified
[ ] Logout works correctly
[ ] Performance acceptable
🚀 You're All Set!
Services Running:

✅ Backend Auth Service (Port 3003)
✅ Frontend (Port 4300)
✅ Parcel Service (Port 5156)
Next Steps:

Open http://localhost:4300
Login with user/user123
Test all features
Check console for errors
Create bookings and track parcels
Version: 1.0
Last Updated: June 2, 2026
Platform: LunchBox Delivery System
