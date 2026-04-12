const WebSocket = require("ws");

// Connect directly to the ESP32's AP IP
const ws = new WebSocket("ws://192.168.4.1:81");

ws.on("open", () => console.log("Screaming data received!"));
ws.on("message", (data) => {
  console.log(`GY-521 Says: ${data}`);
});
