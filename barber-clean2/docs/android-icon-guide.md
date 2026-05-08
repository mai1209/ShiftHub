# Guia de icono Android

Esta app usa `adaptive icon` en Android para que el icono se vea bien en launchers con mascara circular, redondeada o squircle.

## Archivos que controla el icono

- Foreground image:
  - [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_foreground_image.png](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_foreground_image.png)
- Foreground layout:
  - [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_foreground.xml](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_foreground.xml)
- Background:
  - [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_background.xml](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_background.xml)
- Background color:
  - [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/values/colors.xml](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/values/colors.xml)
- Adaptive icon definition:
  - [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml)
  - [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml)
- Manifest:
  - [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/AndroidManifest.xml](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/AndroidManifest.xml)

## Recomendacion para la imagen

- PNG cuadrado
- ideal: `1024 x 1024`
- fondo transparente si queres usar el fondo del adaptive icon
- dejar aire alrededor del logo
- no llevar detalles importantes a los bordes

## Como cambiarlo

1. Reemplazar:
   - [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_foreground_image.png](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_foreground_image.png)
2. Si queres cambiar el color de fondo:
   - editar `ic_launcher_background` en [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/values/colors.xml](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/values/colors.xml)
3. Si queres cambiar el tamano visual del logo:
   - editar los `inset` en [/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_foreground.xml](/Users/maidev/Projects/appBarberiaOrion/barber-clean2/android/app/src/main/res/drawable/ic_launcher_foreground.xml)

## Regla rapida para el tamano

- menos `inset` = logo mas grande
- mas `inset` = logo mas chico

Valor actual:

- `28dp` en cada lado

## Despues del cambio

Tenes que generar una build nueva. El icono no se actualiza solo con recargar la app.

## Si el icono se ve mal

- si queda muy encerrado: bajar `inset`
- si se corta en launchers circulares: subir `inset`
- si se ve cuadrado o con fondo raro: revisar que el launcher este usando los archivos `mipmap-anydpi-v26`
