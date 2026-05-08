/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging'; // 1. Importa esto
import App from './App';
import { name as appName } from './app.json';

// 2. Registra el manejador de mensajes en segundo plano
// Esto debe ir ANTES de registerComponent para que Android lo registre al arrancar
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Mensaje recibido en segundo plano:', remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);