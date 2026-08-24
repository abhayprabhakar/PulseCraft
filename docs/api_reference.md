# API Reference

The RAPTOR backend exposes a RESTful API powered by FastAPI.

> [!NOTE]
> All authenticated endpoints require a valid JWT token sent in the `Authorization` header as `Bearer <token>`.

## 1. Authentication & Users (`/api/v1/auth`)

### `POST /register`
Creates a new user account.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword",
    "username": "fastrider",
    "phone_number": "1234567890",
    "full_name": "John Doe"
  }
  ```
- **Response:** Returns the created `User` object.

### `POST /login`
Standard OAuth2 password flow to obtain a JWT.
- **Request Body (Form Data):** `username` (can be email or username), `password`
- **Response:**
  ```json
  {
    "access_token": "jwt_token_string",
    "token_type": "bearer"
  }
  ```

### `GET /username-availability`
Checks if a username is available for registration.
- **Query Params:** `username`
- **Response:** `{"available": true, "message": "..."}`

### `GET /me`
Retrieves the profile of the currently authenticated user.

### `PUT /me`
Updates user profile fields (`full_name`, `email`, `username`, `phone_number`).

### `POST /users/me/avatar`
Uploads a profile picture for the user. Expects `multipart/form-data` with a `file` field.

### `GET /users/me/stats`
Returns aggregated statistics for the user (total rides, total distance, max speed, total hours, following/followers count).

### `PUT /me/location`
Updates the user's last known location for discovery features.
- **Request Body:** `{"lat": float, "lng": float, "label": "string"}`

---

## 2. Rides & Telemetry (`/api/v1/rides`)

### `GET /`
Lists all rides belonging to the current user.
- **Query Params:** `bike_id` (optional, filter by bike)

### `GET /{ride_id}`
Retrieves detailed information about a specific ride, including the raw telemetry JSON blob.

### `DELETE /{ride_id}`
Deletes a ride and associated telemetry data.

### `PUT /{ride_id}`
Updates a ride's metadata (e.g. `title`).

### `GET /{ride_id}/analysis`
Processes the ride's telemetry and returns track segments, time deltas, braking/throttle reports, coaching insights, and map traces.
- **Query Params:** `force_refresh=true` (forces recalculation of analytics).
- **Response:** `RideAnalysisResponse` (includes segment analytics, LLM coaching, events, and scorecards).

### `POST /{ride_id}/chat`
Queries the Time Series AI with a specific time window from the ride.
- **Request Body:**
  ```json
  {
    "prompt": "Why was I slow in segment 3?",
    "start_time_ms": 1000,
    "end_time_ms": 15000,
    "llm_provider": "gemini-default",
    "history": []
  }
  ```
- **Response:** `{"answer": "...", "tools_used": []}`

### `GET /llm/providers`
Lists available LLM providers configured on the backend (e.g., Gemini, Groq).

### `POST /upload_csv`
Allows manual uploading of CSV telemetry logs. Converts the CSV to standard JSON frames and creates a new Ride.

---

## 3. Garage & Bikes (`/api/v1/bikes`)

### `GET /`
Lists all bikes belonging to the user.

### `POST /`
Registers a new bike in the garage.
- **Request Body:** `{"name": "...", "make": "...", "model": "...", "year": 2021, "color": "#ff0000"}`

### `PUT /{bike_id}` and `DELETE /{bike_id}`
Updates or removes a bike from the garage.

### `POST /{bike_id}/image`
Uploads a profile image for the bike. Expects `multipart/form-data`.

### `GET /{bike_id}/documents`
Retrieves document metadata (registration, insurance, license) for the specific bike.

### `PUT /{bike_id}/documents`
Updates the textual document metadata.

### `POST /{bike_id}/documents/{doc_type}/pdf`
Uploads a PDF file for a specific document category (e.g. `driving_license`, `insurance`).

---

## 4. Friends & Social (`/api/v1/friends`)

### `GET /`
Lists the user's accepted friends.

### `GET /requests/incoming` & `GET /requests/outgoing`
Lists pending friend requests.

### `POST /requests`
Sends a friend request to a target user via `target_username` or `target_email`.

### `POST /requests/{request_id}/accept` & `POST /requests/{request_id}/reject`
Accepts or rejects an incoming friend request.

### `GET /discover`
Searches for other riders by username, full name, or email.

### `GET /recommendations`
Suggests new friends based on mutual connections and geographic proximity (`last_known_lat/lng`).

### `POST /recommendations/contacts`
Matches phonebook contacts to existing RAPTOR accounts using phone numbers, emails, or names.

### `GET /profiles/{username}` & `GET /profiles/{username}/rides`
Retrieves public profile statistics and visible rides for another user.

---

## 5. Favorites (`/api/v1/favorites`)
- `GET /`: Lists saved favorite locations/tracks.
- `POST /`: Adds a new favorite (`{"name": "Track A", "lat": 12.3, "lng": 45.6}`).
- `DELETE /{favorite_id}`: Removes a favorite.

---

## 6. Files (`/api/v1/files`)

### `GET /{file_id}`
Serves statically uploaded assets (images, PDFs) directly from the database or filesystem.
