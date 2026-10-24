@echo off
echo ========================================
echo Subiendo proyecto EPDF a GitHub...
echo ========================================

git add -A
set /p mensaje="Introduce el mensaje para el commit: "
git commit -m "%mensaje%"
git branch -M main
git push -u origin main --force

echo ========================================
echo ¡Proceso finalizado!
echo ========================================
pause