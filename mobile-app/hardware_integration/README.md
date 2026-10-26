# Hardware Integration Guide

This folder contains resources to integrate external hardware (Raspberry Pi, ESP32, etc.) with the Raptor app.

## Overview
The app acts as a **BLE Client** (Central). Your hardware must act as a **BLE Server** (Peripheral).
The app listens for **Notifications** on a specific Characteristic containing a **UTF-8 JSON String**.

## Data Format
Map your sensor data to this JSON structure:
```json
{
  "rpm": 4500,           // Integer
  "speed_kph": 65.5,     // Double
  "gear": 3,             // Integer
  "temp": 85.0,          // Double
  "battery": 12.4,       // Double
  "ride_time": 120,      // Integer (seconds)
  "lean_deg": 12.5       // Double
}
```

---

## Option 1: ESP32 (Recommended)
The ESP32 is ideal for this because it enables low-latency BLE and has analog/digital pins for reading real sensors.

### Setup
1.  **Hardware**: Any ESP32 Dev Kit (EPS32-WROOM, ESP32-C3, etc.).
2.  **Software**: Arduino IDE.
    *   Install **ESP32 Board Support** in Arduino IDE.
    *   Open `hardware_integration/esp32/pulse_craft_esp32.ino`.
3.  **Flash**: Upload the sketch to your board.
4.  **Connect**:
    *   Open Raptor App -> Settings.
    *   Scan for "Raptor NS200".
    *   Connect.

### Real Snesors
In the `.ino` file, look for `// --- SIMULATION LOGIC ---` and replace it with:
- **RPM**: Use `attachInterrupt` on a Hall Effect sensor pin to count spark pulses.
- **Speed**: Use a Hall Effect sensor on the wheel or read via UART from OBD-II.
- **Lean Angle**: Connect an MPU6050 via I2C and read the X-axis gyro/accel.

---

## Option 2: Raspberry Pi
Good for testing or if you want to run a full Python environment (e.g., for processing data before sending).

### Setup
1.  Run `sudo pip3 install bluezero` on your Pi.
2.  Run `python3 hardware_integration/ns200_emulator.py`.
3.  Connect via App.

---

## App Configuration
If you change the UUIDs in the code, update them here:
- **Service UUID**: `12345678-1234-5678-1234-56789abc0000`
- **Char UUID**: `12345678-1234-5678-1234-56789abc0001`
