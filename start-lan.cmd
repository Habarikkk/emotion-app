@echo off
cd /d "%~dp0"
set EXPO_NO_TELEMETRY=1
"C:\Program Files\nodejs\node.exe" ".\node_modules\expo\bin\cli" start --go --lan --clear --port 8082
