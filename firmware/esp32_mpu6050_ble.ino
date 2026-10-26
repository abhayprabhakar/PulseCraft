// ============================================================
//  Raptor Bike – ESP32 + MPU6050  (Bluetooth Classic / SPP)
//  Converted from BLE → BT Classic
//  Lean angle via Complementary Filter + Gyro Bias Calibration
//  Output: CSV over BluetoothSerial at 30 Hz
//  Format: lean,pitch,yaw,accelX,accelY,accelZ,rpm,temp,battery
// ============================================================

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

void btCallback(esp_spp_cb_event_t event, esp_spp_cb_param_t *param) {
  if (event == ESP_SPP_SRV_OPEN_EVT) {
    btConnected = true;
    Serial.println("✅ Bluetooth client connected!");
  } else if (event == ESP_SPP_CLOSE_EVT) {
    btConnected = false;
    Serial.println("❌ Bluetooth client disconnected");
  }
}

// ==================== SENSOR ====================
MPU6050 mpu;

int16_t ax, ay, az;
int16_t gx, gy, gz;

// Angles
float roll = 0, pitch = 0, yaw = 0;
float previousLeanAngle = 0;  // raw comp-filter value — used for gyro integration

// Windowed average accumulators (reset each send interval)
float   leanSum   = 0;
float   pitchSum  = 0;
float   yawSum    = 0;
uint16_t leanCount = 0;

// Hysteresis tracking (prevents 1-2 degree micro-jitter)
float lastSentLean = 0;
float lastSentPitch = 0;
float lastSentYaw = 0;
const float HYSTERESIS_THRESHOLD = 2.0f;

// Gyro & Accel bias (calibrated at startup while bike is upright & stationary)
float gyroBiasRoll = 0, gyroBiasPitch = 0, gyroBiasYaw = 0;
float accelBiasRoll = 0, accelBiasPitch = 0;

// Corner detection
bool  cornerDetected  = false;
float peakLeanAngle   = 0;
unsigned long cornerStartTime = 0;
unsigned long cornerDuration  = 0;

// Timing
unsigned long lastMicros;
unsigned long lastSend = 0;

// ==================== FILTER WEIGHTS ====================
#define GYRO_WEIGHT  0.98f
#define ACC_WEIGHT   0.02f
// 200Hz internal loop; samples averaged in a 100ms window before sending.
// Window average = noise suppression without any temporal trailing lag.

// Loop rate 200 Hz; send rate 10 Hz (every 100ms)
#define LOOP_INTERVAL_US  5000UL   // 5ms  = 200 Hz
#define SEND_INTERVAL_MS  100UL    // 100ms = 10 Hz

// ==================== CALIBRATION ====================
void calibrateSensors() {
  Serial.println("📐 Calibrating Sensor Bias... keep bike COMPLETELY UPRIGHT and STATIONARY");

  float gxSum = 0, gySum = 0, gzSum = 0;
  float axAngleSum = 0, ayAngleSum = 0;
  const int N = 1000;

  for (int i = 0; i < N; i++) {
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

    // Gyro
    gxSum += (gx / 65.5f);
    gySum += (gy / 65.5f);
    gzSum += (gz / 65.5f);

    // Accel
    float accelX = ax / 8192.0f;
    float accelY = ay / 8192.0f;
    float accelZ = az / 8192.0f;

    // Lean uses Y-axis rotation (gy) → forward tilt angle
    axAngleSum += atan2(-accelX, sqrt(accelY * accelY + accelZ * accelZ)) * 180.0f / PI;
    // Pitch uses X-axis rotation (gx) → side tilt angle
    ayAngleSum += atan2(accelY, accelZ) * 180.0f / PI;

    delay(2);
  }

  // Averages
  gyroBiasRoll  = gxSum / N;
  gyroBiasPitch = gySum / N;
  gyroBiasYaw   = gzSum / N;
  accelBiasRoll  = axAngleSum / N;
  accelBiasPitch = ayAngleSum / N;

  Serial.println("✅ Calibration complete!");
  Serial.printf("Gyro Bias  – Roll: %.4f  Pitch: %.4f  Yaw: %.4f\n", gyroBiasRoll, gyroBiasPitch, gyroBiasYaw);
  Serial.printf("Accel Bias – Roll: %.4f  Pitch: %.4f\n", accelBiasRoll, accelBiasPitch);
}

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("🏍️ Raptor Bike – ESP32 Bluetooth Classic");
  Serial.println("==========================================");

  // I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  // MPU6050
  Serial.println("🔧 Initializing MPU6050...");
  mpu.initialize();
  mpu.setSleepEnabled(false);

  // DLPF ~21 Hz — kills engine vibration noise
  mpu.setDLPFMode(4);

  // Gyro ±500 °/s  →  sensitivity 65.5 LSB/(°/s)
  mpu.setFullScaleGyroRange(MPU6050_GYRO_FS_500);

  // Accel ±4g  →  sensitivity 8192 LSB/g
  mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_4);

  Serial.println("✅ MPU6050 configured (DLPF + ±500°/s + ±4g)");

  // Sensor bias calibration
  calibrateSensors();

  // Bluetooth Classic (SPP)
  Serial.println("📡 Starting Bluetooth Classic...");
  SerialBT.begin("Raptor Bike");
  SerialBT.register_callback(btCallback);
  Serial.println("✅ Bluetooth ready – device name: Raptor Bike");
  Serial.println("Waiting for connection...");

  lastMicros = micros();
}

// ==================== LOOP ====================
void loop() {
  // ---- 200 Hz rate enforcement ----
  unsigned long now = micros();
  if (now - lastMicros < LOOP_INTERVAL_US) return; // not yet time
  float dt = (now - lastMicros) / 1000000.0f;
  lastMicros = now;

  // ---- Read sensor ----
  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

  // Convert gyro → °/s and subtract bias
  float gx_dps = (gx / 65.5f) - gyroBiasRoll;
  float gy_dps = (gy / 65.5f) - gyroBiasPitch;
  float gz_dps = (gz / 65.5f) - gyroBiasYaw;

  // Convert accel → G  (±4g → 8192 LSB/g)
  float accelX = ax / 8192.0f;
  float accelY = ay / 8192.0f;
  float accelZ = az / 8192.0f;

  // Accelerometer angles (subtract startup physical mounting offset)
  // Lean uses Y-axis rotation (gy) → forward tilt angle
  float angle_accel = (atan2(-accelX, sqrt(accelY * accelY + accelZ * accelZ)) * 180.0f / PI) - accelBiasRoll;
  // Pitch uses X-axis rotation (gx) → side tilt angle
  float pitch_accel = (atan2(accelY, accelZ) * 180.0f / PI) - accelBiasPitch;

  // Gyro integration — swapped axes to match physical mounting
  float angle_gyro = previousLeanAngle + gy_dps * dt;  // lean = Y gyro
  float pitch_gyro = pitch + gx_dps * dt;              // pitch = X gyro
  yaw += gz_dps * dt;

  // Complementary filter (raw — used for integration)
  float rawLean = GYRO_WEIGHT * angle_gyro + ACC_WEIGHT * angle_accel;
  pitch         = GYRO_WEIGHT * pitch_gyro  + ACC_WEIGHT * pitch_accel;

  // ---- Spike rejection ----
  float leanAngle;
  if (abs(rawLean - previousLeanAngle) > 15.0f) {
    leanAngle = previousLeanAngle; // reject glitch, keep previous
  } else {
    leanAngle = rawLean;
  }

  // Hard clamp — lean > 90° is physically impossible
  leanAngle = constrain(leanAngle, -90.0f, 90.0f);

  // Update integration base from raw value — no lag introduced here
  previousLeanAngle = leanAngle;

  // ---- Corner detection ----
  if (abs(leanAngle) > 15.0f) {
    if (!cornerDetected) {
      cornerDetected = true;
      cornerStartTime = millis();
      peakLeanAngle = abs(leanAngle);
    } else if (abs(leanAngle) > peakLeanAngle) {
      peakLeanAngle = abs(leanAngle);
    }
  } else if (cornerDetected) {
    cornerDetected = false;
    cornerDuration = millis() - cornerStartTime;
    // Serial.printf("Corner done – peak %.1f° in %lu ms\n", peakLeanAngle, cornerDuration);
  }

  // ---- RPM / temp / battery come from OBD — not available on this ESP32 ----

  // ---- Window accumulator (200 Hz sensor → 10 Hz averaged output) ----
  // Each sample is added; at send time the mean represents the true current position.
  leanSum  += leanAngle;
  pitchSum += pitch;
  yawSum   += yaw;
  leanCount++;

  // ---- Send at 10 Hz (every 100ms) ----
  if (btConnected && (millis() - lastSend >= SEND_INTERVAL_MS) && leanCount > 0) {
    float avgLean  = leanSum  / leanCount;
    float avgPitch = pitchSum / leanCount;
    float avgYaw   = yawSum   / leanCount;

    // ---- Hysteresis Filter ----
    // Only update the transmitted value if it changed by more than the threshold.
    // This stops jitter (e.g., hovering between 15° and 16° repeatedly).
    if (abs(avgLean - lastSentLean) >= HYSTERESIS_THRESHOLD) {
      lastSentLean = avgLean;
    }
    if (abs(avgPitch - lastSentPitch) >= HYSTERESIS_THRESHOLD) {
      lastSentPitch = avgPitch;
    }
    if (abs(avgYaw - lastSentYaw) >= HYSTERESIS_THRESHOLD) {
      lastSentYaw = avgYaw;
    }

    // Upright snaps: exactly zero if we are basically upright
    if (abs(lastSentLean) < 2.0f) lastSentLean = 0.0f;
    if (abs(lastSentPitch) < 2.0f) lastSentPitch = 0.0f;

    // Reset accumulators — next window starts fresh (no history bleed)
    leanSum = pitchSum = yawSum = 0;
    leanCount = 0;

    // CSV: lean,pitch,yaw,accelX,accelY,accelZ  (6 fields, IMU only)
    SerialBT.print(lastSentLean, 2);    SerialBT.print(',');
    SerialBT.print(lastSentPitch, 2);   SerialBT.print(',');
    SerialBT.print(lastSentYaw, 2);     SerialBT.print(',');
    SerialBT.print(accelX, 3);          SerialBT.print(',');
    SerialBT.print(accelY, 3);          SerialBT.print(',');
    SerialBT.println(accelZ, 3);

    lastSend = millis();

    // Serial debug every 500 ms
    static unsigned long lastDbg = 0;
    if (millis() - lastDbg > 500) {
      Serial.printf("📊 Lean:%.1f° Pitch:%.1f° Yaw:%.1f° aX:%.2fg aY:%.2fg aZ:%.2fg\n",
                    leanAngle, pitch, yaw, accelX, accelY, accelZ);
      lastDbg = millis();
    }
  }
}
