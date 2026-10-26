/*
  Raptor Bike - TELMETRY TRANSMITTER (ESP32)
  
  This sketch turns an ESP32 into a BLE Peripheral for the Raptor app.
  It generates simulated telemetry data (RPM, Speed, Gear, etc.) and broadcasts
  it via BLE Notifications.
  
  HARDWARE:
  - Any ESP32 Dev Board (ESP32-WROOM-32, ESP32-C3, etc.)
  
  DEPENDENCIES:
  - Connectivity/BLE (Built-in to ESP32 Arduino Core)
*/

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h> // Make sure to install ArduinoJson library

// UUIDs matching the mobile app defaults
#define SERVICE_UUID        "12345678-1234-5678-1234-56789abc0000"
#define CHARACTERISTIC_UUID "12345678-1234-5678-1234-56789abc0001"

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Simulation State
float rpm = 1400.0;
float speed_kph = 0.0;
int gear = 1;
float temp = 85.0;
float battery = 12.6;
long ride_time = 0;
float lean_angle = 0.0;
float pitch_angle = 0.0;
float yaw_angle = 0.0;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Device Connected");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Device Disconnected");
    }
};

void setup() {
  Serial.begin(115200);
  Serial.println("Starting Raptor ESP32...");

  // Create the BLE Device
  BLEDevice::init("Raptor NS200");

  // Create the BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create the BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create the BLE Characteristic
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_WRITE  |
                      BLECharacteristic::PROPERTY_NOTIFY |
                      BLECharacteristic::PROPERTY_INDICATE
                    );

  // Create a BLE Descriptor (needed for notifications)
  pCharacteristic->addDescriptor(new BLE2902());

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);  // set value to 0x00 to not advertise this parameter
  BLEDevice::startAdvertising();
  Serial.println("Waiting for a client connection...");
}

void loop() {
    // Notify changed value
    if (deviceConnected) {
        // --- SIMULATION LOGIC START ---
        // (Replace this with real sensor reads)
        
        // Rev the engine a bit
        rpm += random(-100, 300);
        if (rpm > 10500) rpm = 10000;
        if (rpm < 1400) rpm = 1400;

        // Speed relative to gear (very rough)
        speed_kph = (rpm / 150.0) * gear;

        ride_time = millis() / 1000;
        
        // Gentle lean weave simulation
        lean_angle = 5.0 * sin(millis() / 1000.0);
        
        // Pitch changes with simulated accel/decel
        pitch_angle = (random(-100, 100) / 100.0) * 2.0;

        // Yaw slowly rotates
        yaw_angle += 0.5;
        if (yaw_angle > 360) yaw_angle = 0;
        
        // --- SIMULATION LOGIC END ---

        // Prepare JSON Payload
        // We use a simple string construction to avoid overhead, 
        // or you can use ArduinoJson if preferred.
        // Format: {"rpm":4500, "speed_kph":60.5, ...}
        
        String json = "{";
        json += "\"rpm\":" + String((int)rpm) + ",";
        json += "\"speed_kph\":" + String(speed_kph, 1) + ",";
        json += "\"gear\":" + String(gear) + ",";
        json += "\"temp\":" + String(temp, 1) + ",";
        json += "\"battery\":" + String(battery, 1) + ",";
        json += "\"ride_time\":" + String(ride_time) + ",";
        json += "\"lean_deg\":" + String(lean_angle, 1) + ",";
        json += "\"pitch_deg\":" + String(pitch_angle, 1) + ",";
        json += "\"yaw_deg\":" + String(yaw_angle, 1);
        json += "}";

        // Send Notification
        pCharacteristic->setValue(json.c_str());
        pCharacteristic->notify();
        
        // Update rate: 10Hz (fast enough for smooth UI)
        delay(100); 
    }

    // Disconnecting
    if (!deviceConnected && oldDeviceConnected) {
        delay(500); // give the bluetooth stack the chance to get things ready
        pServer->startAdvertising(); // restart advertising
        Serial.println("Start advertising");
        oldDeviceConnected = deviceConnected;
    }
    // Connecting
    if (deviceConnected && !oldDeviceConnected) {
        // do stuff here on connecting
        oldDeviceConnected = deviceConnected;
    }
}
