# How to Use Your GPX File

## Quick Start

### Step 1: Run the Converter

```bash
cd raptor-frontend
python gpx_converter.py path/to/your/track.gpx 50
```

Replace `path/to/your/track.gpx` with your actual GPX file path.

The number `50` is optional - it's how many points to use (fewer = smoother, more = more accurate).

### Step 2: Copy the Output

The script will print TypeScript code like this:

```typescript
export const trackGPSData: GPSCoordinate[] = [
  { lat: 28.350000, lng: 77.530000 },  // Start/Finish
  { lat: 28.350200, lng: 77.530500 },
  // ... etc
];
```

### Step 3: Update trackPath.ts

1. Open `src/utils/trackPath.ts`
2. Find the `trackGPSData` array (around line 9)
3. Replace it with the generated code
4. Save the file

The app will automatically reload with your track!

## Example

```bash
# If your GPX file is on desktop:
python gpx_converter.py C:\Users\abhay\Desktop\my_track.gpx 50

# Use more points for complex tracks:
python gpx_converter.py my_track.gpx 100

# Use fewer points for simple tracks:
python gpx_converter.py my_track.gpx 20
```

## Troubleshooting

**"No GPS coordinates found"**
- Make sure your GPX file contains track points (<trkpt> tags)
- Try opening the GPX in a text editor to verify it has coordinates

**Track looks wrong**
- Try adjusting the number of points (more or fewer)
- Make sure points go in the correct lap direction

**Need help?**
Just ask! I can help you parse your specific GPX file.

---

## Where is your GPX file?

Let me know the path to your GPX file and I'll run the converter for you!
