@echo off
:: 1. Check if dependencies are already installed
if not exist node_modules (
    echo [Setup] First-time setup detected. Installing packages...
    call npm init -y
    call npm install express multer dotenv
) else (
    echo [Setup] Dependencies already installed. Skipping setup...
)

:: 2. Start the server
echo [Server] Starting server...
node server.js

:: 3. Keep the window open if the server crashes or closes
pause