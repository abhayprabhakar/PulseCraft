
# PULSECRAFT  
![ESP32](https://img.shields.io/badge/ESP32-Embedded-blue)
![Flutter](https://img.shields.io/badge/Flutter-Mobile-blue)
![BLE](https://img.shields.io/badge/Bluetooth-Low_Energy-0082FC)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Active_Development-orange)
### Crafting Intelligence Into Your Ride

**PULSECRAFT** is a DIY smart-bike system that transforms a conventional motorcycle into a connected, insight-driven machine using **ESP32**, **Bluetooth**, and a **mobile app** — without touching or modifying the bike’s ECU.

Built and tested with the **Bajaj Pulsar NS200 (BS4)**, PULSECRAFT focuses on real-world usability, safety, and extensibility.

> Simple bike. Smart brain. Zero compromises.

---

## ✨ What is PULSECRAFT?

PULSECRAFT is a **read-only, non-intrusive bike telemetry and rider-assistance platform** that provides:

- Real-time bike health monitoring  
- Ride data logging  
- Intelligent alerts  
- A foundation for riding analytics and ML-based insights  

All of this is achieved using external sensors and software intelligence — **no ECU hacking, no permanent modifications**.

---

## 🎯 Why PULSECRAFT?

Most mid-range motorcycles lack accessible diagnostics and rider feedback. Riders rely on guesswork for:

- Engine overheating
- Battery health
- Riding habits
- Long-term wear patterns

PULSECRAFT bridges this gap by giving riders **visibility, awareness, and data-driven confidence** — built by a rider, for riders.

---

## 🚀 Core Features (v1)

### 🔴 Real-Time Monitoring
- Engine RPM  
- Engine temperature  
- Battery voltage  
- Ride duration  

### ⚠️ Smart Alerts
- Engine overheating warning  
- Low battery / charging system alert  

### 📱 Mobile Connectivity
- Bluetooth Low Energy (BLE)
- Live dashboard on phone
- Ride start / stop control

### 📝 Ride Logging
- Per-ride statistics
- Historical summaries stored on phone

---

## 🧠 Future Roadmap
PULSECRAFT is designed as a **platform**, not a one-off gadget.

Planned expansions include:
- Riding style classification (eco / normal / aggressive)
- Gear estimation (RPM–speed mapping)
- Lean angle & braking analysis (IMU)
- Theft detection & motion alerts
- ML-based ride scoring
- Cloud sync & analytics

---

## 🏗️ System Architecture

### High-Level Design
```

[ Bike Sensors ]
|   |   |
v   v   v
[ Signal Conditioning ]
|
v
[ ESP32 Microcontroller ]
|
+--> Bluetooth (BLE)
|
v
[ Mobile Application ]

```

### Design Principles
- Read-only monitoring
- Fully reversible installation
- Electrical isolation & protection
- Bike must function normally without the system

---

## 🔧 Hardware Stack

### Microcontroller
- **ESP32 Dev Module**
  - Dual-core MCU
  - BLE + WiFi
  - Low power
  - Rich open-source ecosystem

### Power System
- 12V bike battery
- Inline fuse (1–2A)
- Buck converter (12V → 5V)
- Common ground with bike

### Sensors
- **Battery Voltage** → Voltage divider + ADC  
- **Engine Temperature** → External NTC sensor  
- **RPM** → Inductive pickup or optocoupler-isolated tach signal  

### Optional Add-ons
- MPU6050 (accelerometer + gyroscope)
- Hall-effect wheel speed sensor
- OLED display (local readout)

---

## 💻 Firmware Architecture

```

/firmware
├── sensors/
│    ├── battery.cpp
│    ├── temperature.cpp
│    ├── rpm.cpp
│
├── bluetooth/
│    ├── ble_service.cpp
│
├── logic/
│    ├── alerts.cpp
│    ├── ride_stats.cpp
│
└── main.cpp

```

### Responsibilities
- Sensor sampling & filtering
- Ride state tracking
- Alert generation
- BLE data streaming

---

## 📡 Communication Protocol

### BLE Payload (JSON)
```json
{
  "rpm": 5200,
  "temp": 93,
  "battery": 13.7,
  "ride_time": 1180,
  "alert": "OK"
}
```

* Human-readable
* Easy to extend
* Backward compatible

---

## 📱 Mobile Application

### Purpose

* Live bike dashboard
* Visual alerts
* Ride summaries

### Tech Stack

* **Flutter**

  * Android-first
  * Cross-platform ready
  * BLE support

### Screens

* Dashboard (RPM, temp, voltage)
* Ride summary
* Settings & thresholds

---

## 🛡️ Safety First

### Electrical Safety

* No ECU wire cutting
* Optocouplers for high-voltage signals
* Fused power input
* Noise-resistant power regulation

### Mechanical Safety

* Heat-resistant wiring
* Secure sensor mounting
* Waterproof enclosure

### Operational Safety

* System failure must not affect bike operation
* Monitoring-only design

---

## 🧪 Testing Strategy

1. Bench testing (external power supply)
2. Ignition ON, engine OFF
3. Idle validation
4. Short test rides
5. Extended real-world logging
6. Threshold tuning

---

## 🎓 Why This Project Matters

* Real-world embedded systems application
* Combines hardware, firmware, mobile apps, and data analysis
* Highly extensible
* Strong portfolio and open-source value
* Built on an actual motorcycle, not a simulator

---

## 👤 Built By

A rider.
An engineer.
Someone who believes bikes deserve better software.

---

## ⚠️ Disclaimer

This project is for **educational and personal use only**.
Install and use at your own risk.

---

## 📄 License

MIT License

