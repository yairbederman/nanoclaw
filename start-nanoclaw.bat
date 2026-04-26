@echo off
REM start-nanoclaw.bat — Start NanoClaw on Windows
cd /d "C:\Users\YAIR\nanoclaw"
start /b "" "C:\Program Files\nodejs\node.exe" "C:\Users\YAIR\nanoclaw\dist\index.js" >> "C:\Users\YAIR\nanoclaw\logs\nanoclaw.log" 2>> "C:\Users\YAIR\nanoclaw\logs\nanoclaw.error.log"
