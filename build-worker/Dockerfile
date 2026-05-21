FROM node:20-alpine

# Install Python + PlatformIO
RUN apk add --no-cache python3 py3-pip git curl
RUN pip3 install --break-system-packages platformio

# Pre-install ESP32 platform + all firmware libraries (so builds don't re-download)
RUN platformio platform install espressif32
RUN platformio lib --global install \
  "zinggjm/GxEPD2@^1.6.2" \
  "bblanchon/ArduinoJson@^7.0.0" \
  "tzapu/WiFiManager@^2.0.17" \
  "ricmoo/QRCode@^0.0.1"

WORKDIR /app
COPY package.json ./
RUN npm install
COPY src ./src

EXPOSE 3001
CMD ["node", "src/index.js"]
