# RAPTOR Production React Application

Production-ready React + TypeScript frontend for the RAPTOR track simulation platform.

## 🚀 Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Axios** - HTTP client
- **CSS3** - Premium motorsport styling

## 📦 Installation

```bash
cd raptor-frontend
npm install
```

## 🏃 Development

```bash
npm run dev
```

Runs the app at `http://localhost:3000` with hot module replacement.

The development server auto-proxies API requests to `http://localhost:8008`.

## 🏗️ Build

```bash
npm run build
```

Creates optimized production build in `dist/` directory.

```bash
npm run preview
```

Preview the production build locally.

## 📁 Project Structure

```
src/
├── components/          # React components
│   ├── Header/         # App header with logo & status
│   ├── TrackMap/       # Canvas-based track visualization
│   ├── Telemetry/      # Live telemetry dashboard
│   ├── Metrics/        # Performance metrics panel
│   └── Controls/       # Playback controls & export
├── contexts/           # React contexts
│   └── SimulationContext.tsx  # Global state management
├── services/           # API client layer
│   ├── api.ts         # Axios instance & interceptors
│   └── simulationService.ts   # Typed API methods
├── types/              # TypeScript definitions
│   └── simulation.ts  # Sensor data & response types
├── utils/              # Utility functions
│   ├── trackPath.ts   # Bezier curve calculations
│   └── formatters.ts  # Data formatting helpers
├── styles/             # Global styles
│   └── global.css      # Design tokens & resets
├── App.tsx             # Main application component
└── main.tsx            # Entry point
```

## 🔑 Environment Variables

Create `.env` file:

```env
VITE_API_URL=http://localhost:8008
```

## 🎨 Features

### Component Architecture
- ✅ Modular component structure
- ✅ Custom React hooks
- ✅ Context API for state management
- ✅ TypeScript strict mode

### State Management
- Global simulation state via Context API
- Playback controls (play/pause/reset)
- Variable speed playback (0.5x - 3x)
- Real-time data updates

### API Integration
- Axios client with interceptors
- Error handling & retry logic
- Request/response typing
- Environment-based URLs

### Performance
- Code splitting
- Tree shaking
- Optimized bundle size
- Canvas rendering at 60fps

## 🚀 Production Deployment

### Option 1: Static Hosting

```bash
npm run build
# Deploy dist/ folder to Netlify, Vercel, etc.
```

### Option 2: Docker

```bash
docker build -t raptor-frontend .
docker run -p 3000:80 raptor-frontend
```

## 🔧 Configuration

### Vite Config
- Dev server proxy for API calls
- Path aliases (`@/` → `src/`)
- Build optimizations
- Manual chunk splitting

### TypeScript
- Strict mode enabled
- Path aliases configured
- React JSX transform

## 📊 API Endpoints Used

- `GET /api/simulation/data` - Lap sensor data
- `GET /api/lap/{id}/metrics` - Performance metrics
- `GET /api/session/summary` - Session summary
- `POST /api/export/csv` - Export CSV
- `POST /api/export/json` - Export JSON

## 🧪 Testing

Make sure the backend API is running:

```bash
cd ../simulation
python api.py
```

Then start the frontend:

```bash
npm run dev
```

## 🎯 Development Tips

- Use React DevTools for debugging
- Check Network tab for API calls
- TypeScript will catch type errors
- Hot reload works for instant feedback

---

**RAPTOR** - Rider Analytics Platform for Track Optimization
