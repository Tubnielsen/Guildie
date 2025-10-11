# 📚 Guildie API - Complete Swagger Documentation

## 🎯 Overview
Your Guildie API now has comprehensive Swagger/OpenAPI documentation for all endpoints!

## 🌐 Access Documentation
- **Swagger UI**: http://localhost:3000/api/docs
- **API Root**: http://localhost:3000/
- **JSON Schema**: http://localhost:3000/api/docs.json

## 📋 Documented Endpoints

### 🔐 Authentication Routes
- `GET /auth/discord` - Get Discord OAuth URL
- `POST /auth/discord/callback` - Process Discord OAuth callback
- `GET /api/user/profile` - Get authenticated user profile
- `POST /auth/refresh` - Refresh Discord access tokens
- `POST /auth/logout` - Logout and destroy session

### 👥 Character Management
- `GET /api/character` - Get user's characters
- `GET /api/character/{id}` - Get specific character
- `POST /api/character` - Create new character
- `PUT /api/character/{id}` - Update character
- `DELETE /api/character/{id}` - Delete character
- `PUT /api/character/{id}/dkp` - Update character DKP

### 🎒 Item Management (Admin/Officer only)
- `GET /api/item` - Get all items (with pagination & search)
- `GET /api/item/{id}` - Get item details with wish count
- `POST /api/item` - Create item (Admin only)
- `PUT /api/item/{id}` - Update item (Admin only)
- `DELETE /api/item/{id}` - Delete item (Officer+)
- `DELETE /api/item/{id}/force` - Force delete with wishes (Admin only)
- `GET /api/item/{id}/wish` - Get all characters wanting this item

### 📅 Event Management
- `GET /api/event` - Get all events (with filtering)
- `GET /api/event/{id}` - Get event with attendances
- `POST /api/event` - Create event (with weekly recurrence support)
- `PUT /api/event/{id}` - Update event
- `DELETE /api/event/{id}` - Delete event
- `GET /api/event/upcoming/list` - Get upcoming events
- `GET /api/event/stats/summary` - Event statistics

### 📊 Attendance Tracking
- `GET /api/attendance` - Get attendance records (filtered by user)
- `GET /api/attendance/event/{eventId}` - Get event attendees
- `GET /api/attendance/character/{characterId}` - Get character's attendance history
- `POST /api/attendance` - Add attendance (auto-awards DKP)
- `POST /api/attendance/bulk` - Bulk add attendance (Officers+)
- `DELETE /api/attendance` - Remove attendance (reverses DKP)
- `GET /api/attendance/stats` - Attendance statistics (Officers+)

### ⭐ Wish Management
- `GET /api/wish` - Get wishlist entries (filtered by user)
- `POST /api/wish` - Add item to wishlist
- `DELETE /api/wish/{characterId}/{itemId}` - Remove specific wish
- `DELETE /api/wish/character/{characterId}` - Remove all character wishes

### ⚔️ Admin Operations (Admin only)
- `GET /api/admin/users` - Get all users with roles
- `PUT /api/admin/users/{userId}/role` - Update user role
- `POST /api/admin/users/{userId}/promote` - Promote user
- `POST /api/admin/users/{userId}/demote` - Demote user
- `GET /api/admin/stats` - Enhanced admin statistics

### 🏥 System Health
- `GET /health` - Health check endpoint
- `GET /` - API information and endpoint list

## 🔑 Key Features

### 🛡️ Security Documentation
- **Bearer Authentication**: All protected routes clearly marked
- **Role Requirements**: Admin/Officer requirements specified
- **Permission Descriptions**: Clear access control explanations

### 📊 Comprehensive Schemas
- **User**: Complete user model with Discord integration
- **Character**: Character stats, DKP, equipment, roles
- **Item**: Items with DKP costs and wish tracking
- **Event**: Events with recurrence and DKP rewards
- **Attendance**: Attendance tracking with relationships
- **Wish**: Wishlist relationships
- **Pagination**: Consistent pagination across endpoints

### 📝 Detailed Responses
- **Success Responses**: Proper 200/201 responses with examples
- **Error Handling**: Standardized 400/401/403/404/409/500 responses
- **Validation**: Input validation with constraints and examples
- **Examples**: Real-world request/response examples

### 🎯 Interactive Features
- **Try It Out**: Test endpoints directly in Swagger UI
- **Authentication**: Built-in auth with Bearer token support
- **Parameter Validation**: Real-time input validation
- **Response Preview**: See exact response formats

## 🚀 Usage Instructions

### 1. **Access Swagger UI**
   ```
   http://localhost:3000/api/docs
   ```

### 2. **Authenticate**
   - Click "Authorize" button in Swagger UI
   - Enter: `Bearer YOUR_SESSION_TOKEN`
   - Get token from Discord OAuth flow

### 3. **Test Endpoints**
   - Click any endpoint to expand
   - Click "Try it out"
   - Fill in parameters
   - Click "Execute"

### 4. **View Schemas**
   - Scroll to "Schemas" section
   - See all data models and relationships
   - Understand request/response formats

## 📈 Benefits

✅ **Developer Experience**: Easy API exploration and testing
✅ **Documentation**: Always up-to-date with code changes
✅ **Integration**: Generate client SDKs for different languages
✅ **Debugging**: Clear error messages and validation
✅ **Collaboration**: Share API specs with frontend developers
✅ **Standards**: OpenAPI 3.0 compliant documentation

## 🎮 Guild-Specific Features

- **DKP System**: Automatic DKP tracking through attendance
- **Role-Based Access**: Clear permission levels (Member/Officer/Admin)
- **Discord Integration**: OAuth2 authentication flow
- **Event Recurrence**: Weekly recurring event creation
- **Wishlist System**: Item demand tracking
- **Bulk Operations**: Efficient mass operations for officers

Your API is now fully documented and ready for production use! 🎉