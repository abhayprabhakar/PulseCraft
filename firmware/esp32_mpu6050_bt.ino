#include <Wire.h>
#include "I2Cdev.h"
#include "MPU6050.h"
#include <BluetoothSerial.h>

// ==================== PINS ====================
#define SDA_PIN 21
#define SCL_PIN 22

// ==================== BLUETOOTH ====================
BluetoothSerial SerialBT;
bool btConnected = false;

// ==================== SENSOR ====================
MPU6050 mpu;

// Raw sensor data
int16_t ax, ay, az;
int16_t gx, gy, gz;

// Calculated angles
float roll = 0, pitch = 0, yaw = 0;
float gyroBiasRoll = 0, gyroBiasPitch = 0, gyroBiasYaw = 0;

// Lean angle specific additions
float previousLeanAngle = 0;
bool cornerDetected = false;
float peakLeanAngle = 0;
unsigned long cornerStartTime = 0;
unsigned long cornerDuration = 0;

// Timing
unsigned long lastMicros;
unsigned long lastSend = 0;

// Complementary filter weights
#define GYRO_WEIGHT 0.98
#define ACC_WEIGHT  0.02

// Noise filter weights
#define NOISE_FILTER_PREV 0.9
#define NOISE_FILTER_NEW 0.1

// Mock bike data (replace with real sensors if available)
int mockRpm = 0;
float mockTemp = 85.0;
float mockBattery = 13.5;

// ==================== BLUETOOTH CALLBACKS ====================
void btCallback(esp_spp_cb_event_t event, esp_spp_cb_param_t *param) {
  if (event == ESP_SPP_SRV_OPEN_EVT) {
    btConnected = true;
    Serial.println("✅ Bluetooth client connected!");
  } else if (event == ESP_SPP_CLOSE_EVT) {
    btConnected = false;
    Serial.println("❌ Bluetooth client disconnected");
  }
}

// ==================== CALIBRATION ====================
void calibrateGyroBias() {
  Serial.println("📐 Calibrating Gyro Bias... keep bike completely stationary");
  
  float gxSum = 0, gySum = 0, gzSum = 0;
  const int NUM_SAMPLES = 1000;
  
  for (int i = 0; i < NUM_SAMPLES; i++) {
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
    
    gxSum += (gx / 131.0);
    gySum += (gy / 131.0);
    gzSum += (gz / 131.0);
    
    delay(2);
  }
  
  gyroBiasRoll = gxSum / NUM_SAMPLES;
  gyroBiasPitch = gySum / NUM_SAMPLES;
  gyroBiasYaw = gzSum / NUM_SAMPLES;
  
  Serial.println("✅ Calibration complete!");
  Serial.print("Gyro Bias - Roll: "); Serial.print(gyroBiasRoll);
  Serial.print(" Pitch: "); Serial.print(gyroBiasPitch);
  Serial.print(" Yaw: "); Serial.println(gyroBiasYaw);
}

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("🏍️ Raptor Bike - ESP32 Bluetooth Classic");
  Serial.println("============================================");
  
  // Initialize I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000); // 400kHz I2C speed
  
  // Initialize MPU6050
  Serial.println("🔧 Initializing MPU6050...");
  mpu.initialize();
  mpu.setSleepEnabled(false);
  
  // Set Digital Low Pass Filter (DLPF) to 20Hz to reduce engine vibration noise
  mpu.setDLPFMode(4); // 4 = 21Hz approx

  // Set Gyro range to ±500 °/s
  mpu.setFullScaleGyroRange(MPU6050_GYRO_FS_500);

  // Set Accelerometer range to ±4g
  mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_4);
  
  Serial.println("✅ MPU6050 connected and configured (DLPF, Range)");
  
  // Calibrate sensor (Gyro Bias)
  calibrateGyroBias();
  
  // Initialize Bluetooth Classic
  Serial.println("📡 Initializing Bluetooth...");
  SerialBT.begin("Raptor Bike"); // Device name
  SerialBT.register_callback(btCallback);
  Serial.println("✅ Bluetooth started: Raptor Bike");
  Serial.println("Waiting for connection...");
  
  lastMicros = micros();
}

// ==================== LOOP ====================
void loop() {
  // ==================== TIMING ====================
  unsigned long now = micros();
  float dt = (now - lastMicros) / 1000000.0;
  lastMicros = now;
  
  // ==================== READ SENSOR ====================
  // Ensure ~100Hz Loop (if not blocking on BT sending, we can strictly enforce this)
  if (dt < 0.01) {
     delayMicroseconds((0.01 - dt) * 1000000);
     now = micros();
     dt = (now - lastMicros) / 1000000.0;
     lastMicros = now;
  }

  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
  
  // Convert gyro to deg/s and subtract bias
  // Using custom sensitivity scale (MPU6050_GYRO_FS_500 is 65.5 LSB/(deg/s))
  float gx_dps = (gx / 65.5) - gyroBiasRoll;
  float gy_dps = (gy / 65.5) - gyroBiasPitch;
  float gz_dps = (gz / 65.5) - gyroBiasYaw;
  
  // Convert acceleration to G-force (MPU6050_ACCEL_FS_4 is 8192 LSB/g)
  float accelX = ax / 8192.0;
  float accelY = ay / 8192.0;
  float accelZ = az / 8192.0;

  // Calculate angles from accelerometer
  // Accel X -> forward, Accel Y -> left/right, Accel Z -> vertical
  float angle_accel = atan2(accelY, accelZ) * 180 / PI;
  float pitch_accel = atan2(-accelX, sqrt(accelY*accelY + accelZ*accelZ)) * 180 / PI;
  
  // Integrate gyro rates
  float angle_gyro = previousLeanAngle + gx_dps * dt;
  float pitch_gyro = pitch + gy_dps * dt; // Assuming pitch is secondary
  yaw   += gz_dps * dt; // Simple integration for yaw
  
  // Apply complementary filter
  float raw_lean_angle = GYRO_WEIGHT * angle_gyro + ACC_WEIGHT * angle_accel;
  pitch = GYRO_WEIGHT * pitch_gyro + ACC_WEIGHT * pitch_accel;
  
  // Apply additional low pass noise filter to smooth out vibration spikes
  float leanAngle = NOISE_FILTER_PREV * previousLeanAngle + NOISE_FILTER_NEW * raw_lean_angle;
  previousLeanAngle = leanAngle;
  
  float pitchAngle = pitch;

  // ==================== CORNER DETECTION ====================
  if (abs(leanAngle) > 15.0) {
    if (!cornerDetected) {
      cornerDetected = true;
      cornerStartTime = millis();
      peakLeanAngle = abs(leanAngle);
    } else {
      if (abs(leanAngle) > peakLeanAngle) {
        peakLeanAngle = abs(leanAngle);
      }
    }
  } else {
    if (cornerDetected) {
      cornerDetected = false;
      cornerDuration = millis() - cornerStartTime;
      // You could log or broadcast corner completion info here
      // Serial.printf("Corner! Peak Lean: %.1f deg, Duration: %lu ms\n", peakLeanAngle, cornerDuration);
    }
  }
  
  // ==================== MOCK ENGINE DATA ====================
  // Simulate engine RPM (0-8000, varying)
  mockRpm = 1000 + (int)(sin(millis() / 1000.0) * 2000 + 2000);
  
  // ==================== BLUETOOTH DATA TRANSMISSION ====================
  // Send at 30Hz (every 33ms)
  if (btConnected && (millis() - lastSend >= 33)) {
    // CSV Format: lean,pitch,yaw,accelX,accelY,accelZ,rpm,temp,battery
    SerialBT.print(leanAngle, 2);
    SerialBT.print(",");
    SerialBT.print(pitchAngle, 2);
    SerialBT.print(",");
    SerialBT.print(yaw, 2);
    SerialBT.print(",");
    SerialBT.print(accelX, 3);
    SerialBT.print(",");
    SerialBT.print(accelY, 3);
    SerialBT.print(",");
    SerialBT.print(accelZ, 3);
    SerialBT.print(",");
    SerialBT.print(mockRpm);
    SerialBT.print(",");
    SerialBT.print(mockTemp, 1);
    SerialBT.print(",");
    SerialBT.println(mockBattery, 2);
    
    lastSend = millis();
    
    // Debug output (every 500ms)
    static unsigned long lastDebug = 0;
    if (millis() - lastDebug > 500) {
      Serial.printf("📊 Lean:%.1f° Pitch:%.1f° RPM:%d Temp:%.1f°C Bat:%.1fV\n",
                    leanAngle, pitchAngle, mockRpm, mockTemp, mockBattery);
      lastDebug = millis();
    }
  }
  
  // Small delay for stability
  delay(5);
}
