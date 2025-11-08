# GPR Simulation – FLL Innovation Project

## Overview
This is the simulation component of the Lego Dynamics FIRST LEGO League (FLL) Team #65266's Innovation Project for the 2025–2026 season, UNEARTHED. The simulation, part of Project D.A.R.T.A., is built using Electron and Node.js. It receives motion delta data from an Arduino-based BLE device and visualizes directional movement in a virtual environment, simulating a ground-penetrating radar (GPR) system.

## Features
- Electron-based desktop application
- Receives BLE or Serial data from an Arduino device
- Parses and interprets delta movement commands
- Visualizes movement in a 3D or 2D simulation space
- Supports smoothing, decay, and joystick-like control modes

## Expected Input Format
The simulation expects data in the following format:
dX=45,dY=-30
Where:
- `dX` = delta movement along the X-axis
- `dY` = delta movement along the Z-axis (mapped to forward/backward)

## Technologies Used
- [Electron](https://www.electronjs.org/) – for cross-platform desktop app
- [Node.js](https://nodejs.org/) – backend logic and BLE communication
- [p5.js](https://p5js.org/) – for WebGL rendering and GPU acceleration
- [noble-winrt]([https://serialport.io/](https://github.com/Timeular/noble-winrt)) – for BLE data parsing


## Setup Instructions
1. Clone this repository
2. Run `npm install` to install dependencies
3. Start the app with `npm run start`
4. Ensure your Arduino device is powered and transmitting BLE data
5. The simulation window will open and begin visualizing movement

## Development Notes
- BLE data is parsed in `main.js`
- Visualization logic is handled in `visualizer.js` (or similar)
- Movement smoothing and decay can be toggled via `doPostProcess` flag

## License
MIT License — feel free to use, modify, and build upon this project.

---

Made by the Lego Dynamics FLL Team #65266
