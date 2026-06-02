# 🚀 LunchBox Delivery Platform - QUICK START REFERENCE

## 📦 What's Running Now

| Service | URL | Port | Status | Terminal |
|---------|-----|------|--------|----------|
| **Backend Auth** | http://localhost:3003 | 3003 | ✅ Running | Terminal 1 |
| **Frontend** | http://localhost:4300 | 4300 | ✅ Running | Terminal 2 |
| **Parcel Service** | http://localhost:5156 | 5156 | ✅ Running | Terminal 3 |

---

## 🔐 Login Credentials

```
User Account:
  Username: user
  Password: user123

Admin Account:
  Username: admin
  Password: admin123
```

---

## 🧪 Test Application Now

### 1. Open Frontend
```
http://localhost:4300
```

### 2. Login
- Use credentials above
- Should redirect to Home page

### 3. Create Booking
- Click "Book Now"
- Fill pickup/delivery address
- Select service type (food/parcel/document)
- Submit booking

### 4. Check Parcel Tracking
- View tracking status
- Monitor real-time updates

### 5. View History
- Check previous bookings
- View booking details

---

## 📂 Project Paths

```
Project Root:
c:\TEST\zip.worktrees\agents-login-test-frontend-backend\Ekart\Ekart

├── Backend/
│   ├── microservices/
│   │   ├── services/auth-service/        ← Terminal 1 (npm run dev)
│   │   ├── services/api-gateway/
│   │   ├── services/menu-service/
│   │   ├── services/order-service/
│   │   └── services/worker-service/
│   └── dotnet/
│       └── ParcelService/                ← Terminal 3 (dotnet run)
│
├── Frontend/
│   └── lunchbox-app/                     ← Terminal 2 (ng serve)
│
└── SETUP_GUIDE.md                        ← Full documentation
```

---

## ⚡ Terminal Commands

### Terminal 1: Backend Auth Service
```bash
cd Backend\microservices\services\auth-service
$env:AUTH_DB_FILE="./data/auth.sqlite"
$env:OTP_DEBUG_MODE="1"
npm run dev
```

### Terminal 2: Frontend
```bash
cd Frontend\lunchbox-app
ng serve --port 4300
```

### Terminal 3: Parcel Service
```bash
cd Backend\dotnet\ParcelService
dotnet run
```

---

## 🔗 API Endpoints

### Health Check
```bash
curl http://localhost:3003/health
```

### Login
```bash
curl -X POST http://localhost:3003/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"user123"}'
```

### Create Booking
```bash
curl -X POST http://localhost:3003/bookings \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickupAddress":"123 Main St",
    "deliveryAddress":"456 Park Ave",
    "serviceType":"food",
    "vehicleType":"bike"
  }'
```

---

## 🛠️ Troubleshooting

### Port Already in Use?
```powershell
# Check port
netstat -ano | findstr :3003

# Kill process
taskkill /PID <PID> /F
```

### Services Won't Start?
1. Check Node.js version: `node --version` (need 20.x+)
2. Check npm version: `npm --version` (need 10.x+)
3. Check .NET version: `dotnet --version` (need 10.0+)
4. Delete `node_modules` and run `npm install` again

### Clear Cache
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

---

## 📊 Database Info

### Auth Service
- **Type:** SQLite
- **File:** `Backend/microservices/services/auth-service/data/auth.sqlite`
- **Tables:** users, bookings, sessions
- **Seeded:** user / user123, admin / admin123

### Parcel Service
- **Type:** SQLite with Entity Framework Core
- **Tables:** Bookings, TrackingEvents
- **Seeded:** Sample parcel with tracking events

---

## ✅ Verification Checklist

- [ ] Auth Service responds on port 3003
- [ ] Frontend loads on port 4300
- [ ] Parcel Service runs on port 5156
- [ ] Can login with user/user123
- [ ] Can create a booking
- [ ] Can view tracking info
- [ ] Can logout

---

## 📞 Need Full Setup Instructions?

See **SETUP_GUIDE.md** for:
- Step-by-step installation
- All available microservices
- Advanced configuration
- Docker setup
- Production deployment
- API documentation

---

## 🎯 What to Test

1. **Authentication**
   - Login with user credentials
   - Verify session token
   - Check auto-logout

2. **Booking System**
   - Create new booking
   - View booking list
   - Update booking details
   - Cancel booking

3. **Parcel Tracking**
   - View parcel status
   - Monitor tracking events
   - Check real-time updates
   - View delivery estimates

4. **Profile**
   - View user profile
   - Update user info
   - Change password
   - Manage preferences

5. **Admin Features** (if logged in as admin)
   - View all bookings
   - Manage users
   - View statistics
   - System settings

---

## 🚀 Next Steps

1. ✅ All services are running
2. ✅ Test login functionality
3. ✅ Create sample bookings
4. ✅ Explore all features
5. ✅ Check browser console for errors
6. ✅ Monitor terminal logs

---

**Ready to go! Open http://localhost:4300 now! 🎉**

