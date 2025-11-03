const noble = require("noble-winrt");

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let connected = false;
let connecting = false;

// Normalize for scanning (noble prefers uuid without dashes)
const scanUuid = SERVICE_UUID.replace(/-/g, "").toLowerCase();

noble.on("stateChange", (state) => {
  if (state === "poweredOn") {
    console.log("Scanning for BLE devices...");
    console.log("My Service UUID (raw):", SERVICE_UUID);
    console.log("My Service UUID (scan):", scanUuid);
    noble.startScanning([scanUuid], false);
  } else {
    noble.stopScanning();
  }
});

noble.on("discover", (peripheral) => {
  const adv = peripheral.advertisement || {};
  const localName = (adv.localName || "").toLowerCase();
  console.log("Discovered device:", {
    id: peripheral.id,
    address: peripheral.address,
    name: adv.localName,
    localName,
    serviceUuids: adv.serviceUuids,
    rssi: peripheral.rssi,
  });

  // Robust name match
  if (!localName.includes("esp32")) {
    return;
  }

  // Avoid duplicate attempts
  if (connected || connecting) return;

  connecting = true;
  noble.stopScanning();
  console.log("Attempting to connect to", adv.localName || peripheral.id);

  peripheral.connect((error) => {
    if (error) {
      console.error("Connection error:", error);
      connecting = false;
      noble.startScanning([scanUuid], false);
      return;
    }

    connected = true;
    connecting = false;
    console.log("Connected to device:", adv.localName || peripheral.id);

    peripheral.discoverAllServicesAndCharacteristics(
      (err, services, characteristics) => {
        if (err) {
          console.error("Discovery error:", err);
          peripheral.disconnect();
          return;
        }

        const targetUuid = CHARACTERISTIC_UUID;
        const characteristic = characteristics.find(
          (c) => c.uuid === targetUuid
        );

        if (!characteristic) {
          console.error(
            "Characteristic not found -- dumping discovered characteristics:"
          );
          console.log({ services, characteristics });
          peripheral.disconnect();
          return;
        }

        characteristic.subscribe((err) => {
          if (err) {
            console.error("Subscribe error:", err);
            peripheral.disconnect();
            return;
          }
          console.log(
            "Subscribed to notifications on characteristic id:",
            characteristic.uuid
          );
        });

        console.log("Waiting for data...");
        characteristic.on("data", (data, isNotification) => {
          const number = data.readUInt32LE(0);
          console.log("Received:", number);
        });
      }
    );
  });

  peripheral.on("disconnect", () => {
    console.log("Disconnected from device");
    connected = false;
    connecting = false;
    setTimeout(() => {
      console.log("Restarting scan... Press Ctrl+C to exit.");
      noble.startScanning([scanUuid], false);
    }, 500);
  });
});
