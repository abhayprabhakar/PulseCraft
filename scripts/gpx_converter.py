"""
GPX to RAPTOR Track Converter
Converts GPX files to GPS coordinate array for RAPTOR simulation
"""

import xml.etree.ElementTree as ET
import sys

def parse_gpx_file(gpx_file_path):
    """Parse GPX file and extract GPS coordinates"""
    
    # Parse the GPX XML file
    tree = ET.parse(gpx_file_path)
    root = tree.getroot()
    
    # GPX namespace
    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
    
    # Try to find namespace in root if not default
    if not root.findall('.//gpx:trkpt', ns):
        # Try without namespace
        ns = {'gpx': ''}
        if root.tag.startswith('{'):
            ns_uri = root.tag.split('}')[0].strip('{')
            ns = {'gpx': ns_uri}
    
    coordinates = []
    
    # Find all track points
    for trkpt in root.findall('.//gpx:trkpt', ns) or root.findall('.//trkpt'):
        lat = float(trkpt.get('lat'))
        lon = float(trkpt.get('lon'))
        coordinates.append({'lat': lat, 'lng': lon})
    
    # If no track points found, try route points
    if not coordinates:
        for rtept in root.findall('.//gpx:rtept', ns) or root.findall('.//rtept'):
            lat = float(rtept.get('lat'))
            lon = float(rtept.get('lon'))
            coordinates.append({'lat': lat, 'lng': lon})
    
    # If still no points, try waypoints
    if not coordinates:
        for wpt in root.findall('.//gpx:wpt', ns) or root.findall('.//wpt'):
            lat = float(wpt.get('lat'))
            lon = float(wpt.get('lon'))
            coordinates.append({'lat': lat, 'lng': lon})
    
    return coordinates

def simplify_track(coordinates, max_points=50):
    """Simplify track by reducing number of points while maintaining shape"""
    if len(coordinates) <= max_points:
        return coordinates
    
    # Simple decimation - take every Nth point
    step = len(coordinates) // max_points
    simplified = coordinates[::step]
    
    # Always include first and last point
    if simplified[0] != coordinates[0]:
        simplified.insert(0, coordinates[0])
    if simplified[-1] != coordinates[-1]:
        simplified.append(coordinates[-1])
    
    return simplified

def generate_typescript_code(coordinates, track_name="myTrack"):
    """Generate TypeScript code for trackPath.ts"""
    
    print(f"\n// Generated GPS coordinates for {track_name}")
    print(f"// Total points: {len(coordinates)}")
    print("\nexport const trackGPSData: GPSCoordinate[] = [")
    
    for i, coord in enumerate(coordinates):
        lat = f"{coord['lat']:.6f}"
        lng = f"{coord['lng']:.6f}"
        comment = ""
        
        # Add comments for key points
        if i == 0:
            comment = "  // Start/Finish"
        elif i == len(coordinates) - 1:
            comment = "  // End"
        
        print(f"  {{ lat: {lat}, lng: {lng} }},{comment}")
    
    print("];")
    
    # Print stats
    lats = [c['lat'] for c in coordinates]
    lngs = [c['lng'] for c in coordinates]
    
    print(f"\n// Track bounds:")
    print(f"// Latitude: {min(lats):.6f} to {max(lats):.6f}")
    print(f"// Longitude: {min(lngs):.6f} to {max(lngs):.6f}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python gpx_converter.py <path_to_gpx_file> [max_points]")
        print("\nExample:")
        print("  python gpx_converter.py my_track.gpx 50")
        print("\nOptions:")
        print("  max_points: Maximum number of points to use (default: 50)")
        sys.exit(1)
    
    gpx_file = sys.argv[1]
    max_points = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    
    try:
        print(f"Reading GPX file: {gpx_file}")
        coordinates = parse_gpx_file(gpx_file)
        
        if not coordinates:
            print("ERROR: No GPS coordinates found in GPX file!")
            sys.exit(1)
        
        print(f"Found {len(coordinates)} GPS points")
        
        # Simplify if needed
        if len(coordinates) > max_points:
            print(f"Simplifying to {max_points} points...")
            coordinates = simplify_track(coordinates, max_points)
        
        # Generate TypeScript code
        generate_typescript_code(coordinates)
        
        print("\n✅ Conversion complete!")
        print("\nNext steps:")
        print("1. Copy the generated code above")
        print("2. Open: raptor-frontend/src/utils/trackPath.ts")
        print("3. Replace the 'trackGPSData' array with the code above")
        print("4. Save the file - the app will hot-reload automatically!")
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
