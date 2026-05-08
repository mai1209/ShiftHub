# Guia Final - Backend BarberApp en Oracle

Fecha: 2026-04-11

## Objetivo final

Dejar la arquitectura asi:

- Frontend web en Vercel: `https://barberappbycodex.com`
- Backend en Oracle: `https://api.barberappbycodex.com`
- App movil apuntando al backend nuevo en Oracle

## Estado final esperado

Cuando todo queda bien, esto tiene que cumplirse:

- `https://barberappbycodex.com` carga el frontend
- `https://api.barberappbycodex.com/` responde el backend
- Vercel frontend consume Oracle, no el backend viejo de Vercel
- La app movil usa Oracle en produccion
- Los cron jobs quedan corriendo en Oracle
- El backend reinicia solo con `systemd`

---

## 1. Problema de base que disparo la migracion

Antes de mover el backend, se detecto esto:

### Problema 1: Vercel estaba sirviendo codigo viejo

Se verifico que el backend deployado en Vercel estaba respondiendo con un commit anterior y no con el codigo actual.

Evidencia:

- el deploy en Vercel mostraba commit viejo
- el codigo local tenia cambios que en produccion no aparecian
- rutas nuevas o campos nuevos no existian en la respuesta publica

Eso explicaba por que en desarrollo funcionaba y en produccion no.

### Problema 2: el flujo de cierre de barberia / cierre de barbero fallaba solo en produccion

En local:

- guardaba bien
- reflejaba bien en app y web

En produccion:

- no reflejaba bien
- quedaban dias mal marcados
- parecia que el backend no estaba actualizado

La conclusion fue correcta: el problema era el deploy stale del backend en Vercel.

### Decision tomada

Mover el backend a Oracle y dejar Vercel solamente para el frontend.

---

## 2. Concepto clave: VCN vs Instancia

Esto es importante porque fue una confusion real durante la migracion.

- VCN = la red
- Instancia = el servidor/computadora

Mas concreto:

- la VCN es el entorno de red donde vive todo
- la instancia es la maquina Ubuntu donde corre Node

La VCN contiene:

- subnet publica
- route table
- internet gateway
- security list
- network security group

La instancia vive adentro de esa red.

Sin VCN no hay red armada.
Sin instancia no hay donde correr el backend.

---

## 3. Recursos creados en Oracle

### Region

- `Brazil East (Sao Paulo)`

### Red creada

- VCN: `barber-vcn`
- Public subnet: `public subnet-barber-vcn`

CIDRs usados:

- VCN: `10.0.0.0/16`
- Public subnet: `10.0.0.0/24`
- Private subnet: `10.0.1.0/24`

### Instancia creada

- Nombre: `barber-backend-prod`
- Sistema: Ubuntu
- IP publica: `147.15.76.141`
- IP privada: `10.0.0.116`

### Acceso SSH

```bash
ssh ubuntu@147.15.76.141
```

Nota:

La primera vez Oracle muestra el aviso de autenticidad del host. Hay que responder `yes`.

---

## 4. Preparacion inicial del servidor

### Actualizacion del sistema

Durante la preparacion aparecio el mensaje de kernel pendiente (`Pending kernel upgrade`).

Eso no era un error del backend. Era un aviso del sistema indicando que habia un kernel mas nuevo instalado.

Si aparece una pantalla morada tipo `Pending kernel upgrade`:

- no es problema del proyecto
- es un dialogo de Ubuntu
- si se traba, se puede salir con `Enter`, `Tab`, `Ctrl+C` o cerrar el dialogo y seguir

### Node

Al principio el servidor tenia Node viejo:

```bash
node -v
# v12.22.9
```

Despues se instalo la version correcta y quedo:

```bash
node -v
# v20.20.2

npm -v
# 10.8.2
```

### Repo clonado

```bash
cd /home/ubuntu
git clone https://github.com/mai1209/barberApp.git
cd /home/ubuntu/barberApp/backend
npm install
```

---

## 5. Variables de entorno del backend en Oracle

Archivo:

- `/home/ubuntu/barberApp/backend/.env`

Base final recomendada:

```env
NODE_ENV=production
PORT=3002

JWT_SECRET=TU_JWT_SECRET_REAL
JWT_EXPIRES_IN=365d

MONGODB_URI=TU_MONGODB_URI_REAL
MONGODB_DB_NAME=barberiaApp
MONGODB_TIMEOUT_MS=15000

MAIL_USER=TU_MAIL_REAL
MAIL_APP_PASSWORD=TU_MAIL_APP_PASSWORD_REAL
MAIL_FROM_NAME=barberAppByCodexCorp

MERCADO_PAGO_CLIENT_ID=TU_CLIENT_ID_REAL
MERCADO_PAGO_CLIENT_SECRET=TU_CLIENT_SECRET_REAL
MERCADO_PAGO_WEBHOOK_SECRET=TU_WEBHOOK_SECRET_REAL
MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN=TU_TOKEN_REAL

PUBLIC_BOOKING_BASE_URL=https://barberappbycodex.com
BACKEND_PUBLIC_BASE_URL=https://api.barberappbycodex.com
MERCADO_PAGO_REDIRECT_URI=https://api.barberappbycodex.com/api/auth/mercadopago/callback

SUBSCRIPTIONS_CURRENCY_ID=ARS
SUBSCRIPTIONS_ADMIN_SECRET=TU_ADMIN_SECRET_REAL
REMINDERS_CRON_SECRET=TU_REMINDERS_CRON_SECRET_REAL
CRON_SECRET=TU_CRON_SECRET_REAL

ALLOWED_WEB_ORIGINS=https://barberappbycodex.com,https://www.barberappbycodex.com

FIREBASE_SERVICE_ACCOUNT=TU_JSON_DE_FIREBASE_EN_UNA_LINEA
```

### Importante sobre secretos

Durante la migracion se pegaron secretos reales en consola/chat.

Tecnica y operativamente, lo correcto despues es rotar:

- JWT secret
- password de mail
- client secret de Mercado Pago
- token de suscripciones
- webhook secret
- secrets admin / cron

No porque el backend quede mal, sino porque los secretos ya quedaron expuestos en historial.

---

## 6. Cambio clave en el codigo para Oracle

Archivo modificado:

- `/Users/maidev/Projects/appBarberiaOrion/backend/server.js`

### Problema real

El backend estaba preparado para Vercel, pero no para correr como proceso Node clasico en una VM.

Antes:

- si `NODE_ENV=production`, no hacia `app.listen()`
- eso en Vercel no molesta porque Vercel maneja el request handler
- en Oracle si molesta, porque el servidor tiene que abrir un puerto real

### Cambio aplicado

Se reemplazo la condicion final para que:

- en Vercel solo exporte `app`
- en Oracle / VM abra puerto real con `listen()`

Cambio conceptual:

```js
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT ?? 3002);
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
  });
}
```

### Mejora extra agregada

Tambien se agrego soporte para:

- `ALLOWED_WEB_ORIGINS`

Eso permite definir origenes web explicitos por variable de entorno.

---

## 7. Levantar el backend manualmente y validar localmente

```bash
cd /home/ubuntu/barberApp/backend
npm start
```

Salida esperada:

```bash
✅ Usando Firebase desde Variable de Entorno
🚀 Servidor corriendo en http://0.0.0.0:3002
[MongoDB] ✅ Conectado exitosamente a la DB: barberiaApp
```

Validaciones correctas:

```bash
curl http://127.0.0.1:3002/
ss -tulpn | grep 3002
sudo ufw status
```

Resultado esperado:

- `curl` devuelve JSON
- `ss` muestra `*:3002`
- `ufw` puede estar inactivo, y aun asi seguir bloqueando otra capa local via iptables/nftables

---

## 8. Error grande de conectividad: por que no abria desde internet

Este fue el error mas importante de toda la migracion.

### Sintoma

Dentro del servidor funcionaba:

```bash
curl http://127.0.0.1:3002/
curl http://10.0.0.116:3002/
```

Pero desde la Mac fallaba:

```bash
curl http://147.15.76.141:3002/
```

### Lo que ya estaba bien y NO era el problema

- Node levantado
- Mongo conectado
- IP publica correcta
- VCN creada
- subnet publica creada
- internet gateway existente

### Capa 1: Security List de la subnet publica

Hubo que agregar ingress TCP:

- Source CIDR: `0.0.0.0/0`
- Destination Port Range: `3002`

Despues, para HTTPS:

- puerto `80`
- puerto `443`

### Capa 2: Network Security Group (NSG)

Oracle habia creado:

- `ig-quick-action-NSG`

Ese NSG inicialmente tenia solo egress.

Hubo que agregar ingress TCP para:

- `3002`
- `80`
- `443`

### Capa 3: firewall local Ubuntu

Este fue el bloqueo final real.

Se reviso:

```bash
sudo iptables -L -n
sudo nft list ruleset
```

Y se vio que el INPUT chain permitia:

- trafico establecido
- ICMP
- loopback
- SSH 22

Y despues hacia `REJECT` del resto.

### Solucion aplicada

Se abrieron puertos en iptables antes del reject:

```bash
sudo iptables -I INPUT 5 -p tcp --dport 3002 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
```

Despues se persistieron:

```bash
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
sudo netfilter-persistent reload
```

### Validacion que confirmo el fix

Despues de eso, desde la Mac:

```bash
curl http://147.15.76.141:3002/
```

Respondio:

```json
{"message":"🚀 BarberApp Backend Online - Powered by CODEX®","status":"Ready","database":"Connected"}
```

### Conclusion tecnica real

El bloqueo final NO estaba en Node.

El bloqueo final estaba en la combinacion de:

- Security List
- NSG
- firewall local Ubuntu

Habia que abrir las tres capas.

---

## 9. Dejar el backend persistente con systemd

Archivo:

- `/etc/systemd/system/barber-backend.service`

Contenido:

```ini
[Unit]
Description=Barber Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/barberApp/backend
EnvironmentFile=/home/ubuntu/barberApp/backend/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Comandos:

```bash
sudo systemctl daemon-reload
sudo systemctl enable barber-backend
sudo systemctl start barber-backend
sudo systemctl status barber-backend
```

Logs en vivo:

```bash
journalctl -u barber-backend -f
```

Estado correcto esperado:

- `Loaded: enabled`
- `Active: active (running)`

---

## 10. DNS y subdominio del backend

No hace falta comprar otro dominio para el backend.

Se usa un subdominio del principal:

- `api.barberappbycodex.com`

Configuracion DNS hecha:

- A record
- `api.barberappbycodex.com -> 147.15.76.141`

Validacion:

```bash
nslookup api.barberappbycodex.com
```

Resultado esperado:

- responde `147.15.76.141`

---

## 11. HTTPS con Caddy

Se eligio Caddy porque simplifica mucho HTTPS en Oracle.

### Instalacion

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### Configuracion

Archivo:

- `/etc/caddy/Caddyfile`

Contenido:

```caddy
api.barberappbycodex.com {
    reverse_proxy 127.0.0.1:3002
}
```

### Reinicio

```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

Estado esperado:

- `Active: active (running)`

### Requisito para que funcione HTTPS

Ademas del Caddyfile, habia que tener abiertos en Oracle y Ubuntu:

- `80`
- `443`

Si no, Caddy esta levantado pero desde afuera no entra nadie.

---

## 12. Cambios de codigo locales para cerrar la migracion

Se dejaron preparados estos archivos:

### Backend

Archivo:

- `/Users/maidev/Projects/appBarberiaOrion/backend/server.js`

Cambios:

- `listen()` real para Oracle/VM
- soporte `ALLOWED_WEB_ORIGINS`

### Frontend web

Archivo:

- `/Users/maidev/Projects/appBarberiaOrion/barber-web/barber-web/vercel.json`

Cambio:

- `Content-Security-Policy` ahora permite conectar con:
  - `https://api.barberappbycodex.com`

### App movil

Archivo:

- `/Users/maidev/Projects/appBarberiaOrion/barber-clean2/src/services/api.ts`

Cambio:

- `PROD_API_URL` paso a:
  - `https://api.barberappbycodex.com`

### Documento tecnico

Archivo:

- `/Users/maidev/Projects/appBarberiaOrion/docs/oracle-backend-migration-guide.md`

---

## 13. Que sigue despues del commit

Hacer commit y push del repo local.

Archivos importantes:

- `backend/server.js`
- `barber-web/barber-web/vercel.json`
- `barber-clean2/src/services/api.ts`
- `docs/oracle-backend-migration-guide.md`

Despues, seguir este orden.

### Paso 1: actualizar el backend en Oracle

```bash
ssh ubuntu@147.15.76.141
cd /home/ubuntu/barberApp
git pull
cd /home/ubuntu/barberApp/backend
npm install
sudo systemctl restart barber-backend
sudo systemctl restart caddy
```

Nota:

- `npm install` solo hace falta si cambian dependencias
- si solo cambia codigo JS, con `git pull` + restart alcanza

### Paso 2: cambiar variable del frontend en Vercel

En Vercel del frontend:

- `REACT_APP_API_BASE_URL=https://api.barberappbycodex.com`

Despues redeploy del frontend.

### Paso 3: mobile

Como la URL productiva quedo hardcodeada en el codigo mobile, hay que:

- subir version
- generar nuevo `AAB` / `APK`
- subir a Play Console o testers

Sin nueva build, la app sigue apuntando a la URL vieja.

---

## 14. Validaciones finales

### API directa

```bash
curl https://api.barberappbycodex.com/
```

Debe devolver JSON del backend.

### Shop publica

```bash
curl https://api.barberappbycodex.com/api/public/shops/orion
```

Debe devolver informacion publica de la barberia.

### Frontend

Abrir:

- `https://barberappbycodex.com`

Y probar:

- cargar landing
- pedir turno
- cargar barberos
- ver servicios

### App movil

Probar:

- login
- carga de turnos
- cierres por dia / barbero
- metricas
- push notifications

---

## 15. Cron jobs finales en Oracle

Como ya no dependemos del cron de Vercel, se recomienda correr cron local en Oracle.

Editar crontab:

```bash
crontab -e
```

Agregar:

```cron
*/10 * * * * curl -fsS -X POST http://127.0.0.1:3002/api/appointments/reminders/run -H "Authorization: Bearer TU_REMINDERS_CRON_SECRET" >/dev/null 2>&1
0 11 * * * curl -fsS -X POST http://127.0.0.1:3002/api/auth/subscription/lifecycle/run -H "Authorization: Bearer TU_REMINDERS_CRON_SECRET" >/dev/null 2>&1
```

Nota importante:

En tu proyecto quedaron variables parecidas como:

- `REMINDERS_CRON_SECRET`
- `CRON_SECRET`

No son necesariamente lo mismo. Hay que mirar que secret espera exactamente cada endpoint y usar ese valor en el cron correspondiente.

---

## 16. Push notifications: error real y solucion final

Despues de dejar Oracle operativo, aparecio un problema puntual:

- los turnos web se guardaban
- el backend respondia bien
- el usuario tenia `pushToken` guardado
- pero la notificacion push instantanea no llegaba al telefono

### Prueba que confirmo el problema

Se hizo una prueba manual en Oracle enviando una push directamente al token:

```bash
cd /home/ubuntu/barberApp/backend
node --input-type=module -e 'import "dotenv/config"; import admin from "./firebase.js"; const resp = await admin.messaging().send({ token: "TOKEN_REAL", notification: { title: "Prueba push Oracle", body: "Si ves esto, Firebase y el token están bien." }, android: { priority: "high" } }); console.log(resp);'
```

Firebase devolvio:

```text
FirebaseMessagingError: SenderId mismatch
code: 'messaging/mismatched-credential'
```

### Causa real

La app movil estaba registrada en un proyecto Firebase, pero el backend estaba usando una service account de otro proyecto.

App movil:

- proyecto: `barberapp-codex`
- sender id: `856164090518`

Backend Oracle al principio:

- usaba `firebase-key.json` de otro proyecto (`growth-219b1`)

Eso hace que Firebase rechace cualquier envio push hacia tokens emitidos por la app.

### Como se detecto

Se verifico:

- `pushToken` del usuario existia en Mongo
- `notificationSettings` estaban activas
- el backend intentaba enviar la push
- Firebase rechazaba el envio por credenciales cruzadas

### Solucion aplicada

Se descargo desde Firebase Console la service account correcta del proyecto:

- `barberapp-codex`

Archivo descargado:

- `barberapp-codex-firebase-adminsdk-fbsvc-0ba42efa59.json`

Luego se reemplazo en Oracle el archivo del backend:

```bash
scp /Users/maidev/Projects/appBarberiaOrion/barber-clean2/barberapp-codex-firebase-adminsdk-fbsvc-0ba42efa59.json ubuntu@147.15.76.141:/home/ubuntu/barberApp/backend/firebase-key.json
```

Y despues:

```bash
ssh ubuntu@147.15.76.141
chmod 600 /home/ubuntu/barberApp/backend/firebase-key.json
sudo systemctl restart barber-backend
```

### Validacion final correcta

Despues del reemplazo:

- la prueba manual de push funciono
- la push instantanea de turno web llego al telefono

Conclusion:

- la infraestructura de Oracle estaba bien
- el problema no era el token
- el problema no era la app
- el problema era usar Admin SDK de Firebase del proyecto equivocado

---

## 17. Errores reales que aparecieron en este proceso

### Error A: deploy viejo en Vercel

Sintoma:

- produccion no reflejaba local

Causa:

- Vercel deployando o sirviendo un commit viejo

### Error B: backend no levantaba puerto en Oracle

Sintoma:

- `npm start` no dejaba el backend accesible como servidor real

Causa:

- `server.js` pensado para Vercel, no para VM

### Error C: firewall local Ubuntu bloqueando aunque Oracle estaba bien

Sintoma:

- adentro del server andaba
- desde afuera no

Causa:

- `iptables` / `nftables`

### Error D: Caddy levantado pero HTTPS sin entrar

Sintoma:

- `caddy.service` activo
- `curl https://api.barberappbycodex.com/` colgaba

Causa:

- puertos `80` y `443` no abiertos en todas las capas

### Error E: dialogo de kernel update de Ubuntu

Sintoma:

- pantalla morada rara

Causa:

- mantenimiento del sistema, no del proyecto

### Error F: Node viejo al principio

Sintoma:

- `node -v` devolvia `v12.22.9`

Causa:

- faltaba instalar / activar la version nueva

### Error G: Firebase Admin del proyecto equivocado

Sintoma:

- los turnos web se guardaban
- el usuario tenia `pushToken`
- pero no llegaban las push

Causa:

- `firebase-key.json` del backend pertenecia a otro proyecto Firebase
- Firebase devolvia `SenderId mismatch`

---

## 18. Checklist final resumida

### Codigo local

- [ ] commit de cambios
- [ ] push a GitHub

### Oracle backend

- [ ] `git pull`
- [ ] `.env` final correcto
- [ ] `ALLOWED_WEB_ORIGINS` cargado
- [ ] `firebase-key.json` del proyecto Firebase correcto (`barberapp-codex`)
- [ ] `sudo systemctl restart barber-backend`
- [ ] `sudo systemctl restart caddy`

### Red Oracle

- [ ] Security List con `3002`, `80`, `443`
- [ ] NSG con `3002`, `80`, `443`
- [ ] iptables con `3002`, `80`, `443`
- [ ] reglas persistidas con `netfilter-persistent`

### DNS y HTTPS

- [ ] `api.barberappbycodex.com` apunta a `147.15.76.141`
- [ ] Caddy reverse proxy activo
- [ ] `curl https://api.barberappbycodex.com/` responde

### Frontend

- [ ] `REACT_APP_API_BASE_URL=https://api.barberappbycodex.com`
- [ ] redeploy en Vercel

### Mobile

- [ ] subir version
- [ ] generar nuevo AAB/APK
- [ ] publicar update
- [ ] probar recepcion de push instantanea desde turno web

---

## 19. Comandos utiles de soporte

### Estado del backend

```bash
sudo systemctl status barber-backend
journalctl -u barber-backend -f
```

### Estado de Caddy

```bash
sudo systemctl status caddy
journalctl -u caddy -f
```

### Validar puertos

```bash
ss -tulpn | grep 3002
sudo iptables -L INPUT -n --line-numbers
sudo nft list ruleset
```

### Validar API

```bash
curl http://127.0.0.1:3002/
curl http://147.15.76.141:3002/
curl https://api.barberappbycodex.com/
```

### Validar push manual

```bash
cd /home/ubuntu/barberApp/backend
node --input-type=module -e 'import "dotenv/config"; import admin from "./firebase.js"; const resp = await admin.messaging().send({ token: "TOKEN_REAL", notification: { title: "Prueba push Oracle", body: "Si ves esto, Firebase y el token están bien." }, android: { priority: "high" } }); console.log(resp);'
```

---

## 20. Recomendacion tecnica final

La arquitectura correcta para este proyecto hoy es esta:

- frontend en Vercel
- backend en Oracle
- subdominio `api.barberappbycodex.com`
- cron jobs en Oracle
- app movil nueva build cuando cambia URL o codigo productivo

No hace falta mover el frontend de Vercel ahora.
El punto critico era sacar el backend de Vercel para evitar deploys inconsistentes y limites del plan hobby.

---

## 21. Archivo PDF final

Este documento tambien fue exportado como PDF para tenerlo como guia operativa.

Archivo esperado:

- `/Users/maidev/Projects/appBarberiaOrion/docs/oracle-backend-migration-guide.pdf`
