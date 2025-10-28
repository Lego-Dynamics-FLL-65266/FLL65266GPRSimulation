const noble = require("noble-winrt");

const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";

const CHARACTERISTIC_UUID = "abcdefab-1234-1234-1234-abcdefabcdef";

noble.on("stateChange", (state) => {
  if (state === "poweredOn") {
    console.log("Scanning for BLE devices...");

    noble.startScanning([SERVICE_UUID], false);
  } else {
    noble.stopScanning();
  }
});

noble.on("discover", (peripheral) => {
  console.log(`Found device: ${peripheral.advertisement.localName}`);

  noble.stopScanning();

  peripheral.connect((error) => {
    if (error) {
      console.error("Connection error:", error);

      return;
    }

    console.log("Connected to device:", peripheral.advertisement.localName);

    peripheral.discoverSomeServicesAndCharacteristics(
      [SERVICE_UUID],

      [CHARACTERISTIC_UUID],

      (err, services, characteristics) => {
        if (err) {
          console.error("Discovery error:", err);

          return;
        }

        const characteristic = characteristics[0];

        characteristic.subscribe((err) => {
          if (err) {
            console.error("Subscribe error:", err);

            return;
          }

          console.log("Subscribed to notifications");
        });

        characteristic.on("data", (data) => {
          console.log("Received:", data.toString());
        });
      }
    );
  });

  peripheral.on("disconnect", () => {
    console.log("Disconnected from device");

    process.exit(0);
  });
});
