# Frontend Architecture

The RAPTOR frontend is a modern React Single Page Application (SPA) built with Vite and TypeScript. It is designed to be highly responsive, providing rich data visualization for complex telemetry.

## 1. Directory Structure

```text
raptor-frontend/src/
├── components/     # Reusable UI components (buttons, modals, stat cards)
├── contexts/       # Global state management (AuthContext)
├── hooks/          # Custom React hooks
├── layouts/        # Page layouts (e.g., DashboardLayout with Sidebar)
├── pages/          # Top-level route components
├── services/       # API integration layer (axios configurations)
├── styles/         # Global CSS and variables
├── types/          # TypeScript interfaces for API payloads
├── App.tsx         # Routing configuration
└── main.tsx        # React DOM entry point
```

## 2. Core Technologies

- **Vite & React 18**: Chosen for lightning-fast HMR during development and optimized production builds.
- **TypeScript**: Ensures type safety across complex telemetry schemas (e.g., matching frontend `RideAnalysis` interface to the backend `RideAnalysisResponse` schema).
- **React Router v7**: Handles client-side routing and protected routes.
- **Recharts**: The primary charting library for rendering line charts (Speed vs Time, Throttle vs RPM).
- **React-Leaflet**: Renders interactive map traces from GPS coordinates using OpenStreetMap layers.
- **Lucide React**: Iconography.

## 3. State Management

RAPTOR avoids heavy state-management libraries (like Redux) in favor of standard React Contexts and Hooks, keeping the architecture lean.

### `AuthContext`
Wraps the entire application. It maintains:
- The `isAuthenticated` boolean.
- The `User` object (retrieved via `/api/v1/auth/me`).
- Login/Logout helper functions.

Protected routes in `App.tsx` listen to this context and automatically redirect unauthenticated users to `/signin`.

## 4. Key Pages

- **`DashboardPage.tsx`**: The main hub. Uses `ridesApi.list()` and `authApi.getStats()` to render aggregated statistics and a list of recent rides.
- **`RidePage.tsx`**: The most complex view. It fetches `ridesApi.getAnalysis()` and renders the Leaflet map trace, synchronized Recharts (Speed/Throttle), and the AI Coaching Summary.
- **`TimeSeriesChatPage.tsx`**: Implements a conversational UI where riders can select a time window and query the LLM about their performance.
- **`BikeSelectionPage.tsx` / `BikeDocumentsPage.tsx`**: UI for managing the virtual garage and uploading PDFs.

## 5. API Layer (`services/api.ts`)

All external network requests are centralized in `api.ts`.
- **Axios Interceptors**: Automatically inject the JWT token from `localStorage` into every outgoing request's `Authorization` header.
- **Error Handling**: A response interceptor catches `401 Unauthorized` errors globally, clearing local state and redirecting to the login page.
- **Domain Services**: API calls are grouped into logical objects (`authApi`, `ridesApi`, `bikesApi`) mirroring backend routers.
