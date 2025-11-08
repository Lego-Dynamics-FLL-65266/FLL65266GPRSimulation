# Arduino Sketch – FLL Innovation Project

## Overview
This Arduino sketch is for the Lego Dynamics FIRST LEGO League (FLL) Team #65266's Innovation Project, for the season UNEARTHED, Project D.A.R.T.A. It reads motion data from an MPU6050 (GY-521) sensor and outputs movement deltas that simulate directional control. The data is sent over BLE to be interpreted by an Electron + Node.js GPR simulation.

## Features
- Reads acceleration and gyroscope data from the MPU6050
- Calculates delta movement values
- Outputs formatted data over Serial/BLE
- Designed for integration with external visualization or simulation systems

## Example Output
dX=45,dY=-30
dX=0,dY=0
dX=-20,dY=15
## Dependencies
- `Wire.h` (I2C communication)
- `MPU6050.h` or `Adafruit_MPU6050.h` depending on your library choice

## Upload Instructions
1. Connect your Arduino board via USB
2. Open the sketch in Arduino IDE
3. Select the correct board and port
4. Upload the sketch
5. Open Serial Monitor at 115200 baud to view output

## License
MIT License — feel free to use, modify, and build upon this project.

---

Made by our FLL team
