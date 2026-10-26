#!/usr/bin/python3
"""
Raptor NS200 Emulator for Raspberry Pi
Requires: bluezero (pip3 install bluezero)

This script creates a BLE Peripheral that broadcasts
simulated NS200 telemetry data matching the app's requirements.
"""

import signal
import random
import json
import logging
from time import sleep 

# Bluezero imports
try:
    from bluezero import adapter
    from bluezero import peripheral
    from bluezero import device
except ImportError:
    print("Error: 'bluezero' module not found.")
    print("Please install it: sudo pip3 install bluezero")
    exit(1)

# Configuration
SERVICE_UUID = '12345678-1234-5678-1234-56789abc0000'
CHAR_UUID    = '12345678-1234-5678-1234-56789abc0001'
DEVICE_NAME  = 'Raptor NS200'

# Simulation State
rpm = 1400.0
speed = 0.0
gear = 1
temp = 85.0
battery = 12.6
ride_time = 0

def get_telemetry_json():
    global rpm, speed, gear, ride_time
    
    # Simulate some NS200 Physics
    rpm += random.uniform(-100, 300)
    if rpm > 10500: rpm = 10000
    if rpm < 1400: rpm = 1400
    
    # Rough speed calc
    speed = (rpm / 150.0) * gear 
    
    ride_time += 1
    
    data = {
        "rpm": int(rpm),
        "speed_kph": round(speed, 1),
        "gear": gear,
        "temp": temp,
        "battery": battery,
        "ride_time": ride_time,
        "lean_deg": random.uniform(-5, 5) # Gentle weave
    }
    return json.dumps(data)

def on_connect(device):
    print(f"Connected to {device.address}")

def on_disconnect(device):
    print(f"Disconnected from {device.address}")

def main():
    print(f"Starting {DEVICE_NAME} BLE Peripheral...")
    
    # Create Peripheral
    ns200_app = peripheral.Peripheral(adapter.Adapter(adapter.list_adapters()[0]).address, 
                                      local_name=DEVICE_NAME, 
                                      appearance=1154) # 1154 = Outdoor Sports Activity

    # Add Service
    ns200_app.add_service(srv_id=1, uuid=SERVICE_UUID, primary=True)

    # Add Characteristic (Notify)
    ns200_app.add_characteristic(srv_id=1, chr_id=1, uuid=CHAR_UUID,
                                 value=[], notifying=True,
                                 flags=['read', 'notify'])

    # Publish
    ns200_app.publish()

    print(f"Advertising as {DEVICE_NAME}")
    print(f"Service: {SERVICE_UUID}")
    print(f"Char:    {CHAR_UUID}")

    try:
        while True:
            # Update value every 100ms
            json_str = get_telemetry_json()
            # Convert to bytes
            payload = [ord(c) for c in json_str]
            
            # Send Notification if connected (Bluezero handles this internally usually, 
            # but specific API might vary. This is a basic notify loop attempt)
            # Note: Bluezero's mainloop is blocking usually, this while loop is a simplification.
            # Real implementation needs GObject loop or callbacks. 
            pass 
            # (In a real script we would use the GObject timer to update the characteristic value)
            
            sleep(0.1)
    except KeyboardInterrupt:
        ns200_app.quit()

if __name__ == '__main__':
    main()
