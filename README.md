# GPR Simulation – FLL Innovation Project

## Overview

This is the simulation component of the Lego Dynamics FIRST LEGO League (FLL) Team #65266's Innovation Project for the 2025–2026 season, UNEARTHED. The simulation, part of Project D.A.R.T.A., is built using Electron and Node.js. It receives motion delta data from an Arduino-based BLE device and visualizes directional movement in a virtual environment, simulating a ground-penetrating radar (GPR) system.

## Features

- Electron-based desktop application
- Receives Wi-Fi data from an Arduino device via WebSocket
- Parses and interprets delta movement commands
- Visualizes movement in a 3D or 2D simulation space
- Supports smoothing, decay, and joystick-like control modes
- City map on the right btw

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
- [noble-winrt](<[https://serialport.io/](https://github.com/Timeular/noble-winrt)>) – for BLE data parsing

## License

MIT License — feel free to use, modify, and build upon this project.

---

Made by the Lego Dynamics FLL Team #65266
