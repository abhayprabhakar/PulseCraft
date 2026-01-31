# GPS Track Configuration

## Using GPS Coordinates for Track Visualization

The RAPTOR sim now supports **real GPS coordinates** for track visualization!

## How It Works

### 1. GPS Coordinate System

Add your track as an array of latitude/longitude points:

```typescript
export const trackGPSData: GPSCoordinate[] = [
  { lat: 28.3500, lng: 77.5300 }, // Start/Finish
  { lat: 28.3502, lng: 77.5305 }, // Turn 1
  { lat: 28.3503, lng: 77.5312 }, // Turn 2
  // ... add more points
];
```

### 2. Coordinate Transformation

The system automatically:
1. **Finds bounds** - Min/max lat/lng
2. **Normalizes** - Converts to 0-1 range
3. **Adds padding** - 10% margin on all sides
4. **Flips Y-axis** - GPS north = canvas top
5. **Renders** - Draws on canvas

### 3. Bike Positioning

- Uses linear interpolation between GPS points
- Calculates heading angle automatically
- Updates in real-time with telemetry

## Adding Your Own Track

### Option 1: From GPX File

1. Record a lap with GPS tracker/phone
2. Export as GPX file
3. Extract coordinates:

```python
import gpxpy

with open('my_track.gpx') as f:
    gpx = gpxpy.parse(f)
    for point in gpx.tracks[0].segments[0].points:
        print(f"{{ lat: {point.latitude}, lng: {point.longitude} }},")
```

### Option 2: From Google Maps

1. Right-click points on the track
2. Copy lat/lng coordinates
3. Add to `trackGPSData` array

### Option 3: From Strava/Ride With GPS

1. Export ride as GPX
2. Use converter tool
3. Paste coordinates

## Real Track Examples

### Buddh International Circuit (India)
```typescript
export const buddhCircuit: GPSCoordinate[] = [
  { lat: 28.3489, lng: 77.5340 }, // Turn 1
  { lat: 28.3492, lng: 77.5365 }, // Turn 2
  { lat: 28.3498, lng: 77.5388 }, // Turn 3
  // ... full track
];
```

### Kart Track Example
```typescript
export const kartTrack: GPSCoordinate[] = [
  { lat: 28.5500, lng: 77.2500 },
  { lat: 28.5502, lng: 77.2505 },
  // ... smaller circuit
];
```

## Configuration File

Edit `src/utils/trackPath.ts`:

```typescript
// Replace this array with your track:
export const trackGPSData: GPSCoordinate[] = [
  // Your GPS points here
];
```

## Tips for Best Results

1. **Point Density**: Use more points for complex corners
2. **Closed Loop**: Last point should match first point
3. **Accuracy**: Use high-precision GPS (6+ decimal places)
4. **Direction**: Points should flow in lap direction
5. **Testing**: Start with 10-20 points, refine as needed

## Features

✅ **Automatic scaling** - Works with any track size  
✅ **Real GPS data** - Use actual circuit coordinates  
✅ **Linear interpolation** - Smooth bike movement  
✅ **Angle calculation** - Automatic heading from GPS  
✅ **Easy updates** - Just edit the coordinate array

## Future Enhancements

- [ ] GPX file upload in UI
- [ ] Multiple track selection
- [ ] Track elevation data
- [ ] Sector markers from GPS
- [ ] Lap time validation zones
