@echo off
cd /d "%~dp0"
set EXPO_NO_TELEMETRY=1
"C:\Program Files\nodejs\node.exe" ".\node_modules\expo\bin\cli" start --offline --go --clear --port 8082
