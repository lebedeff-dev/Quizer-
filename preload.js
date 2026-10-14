'use strict';
// Ponte segura entre o painel (/host) e o programa. O painel só enxerga estas funções.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quizer', {
  desktop: true,
  copiar: (texto) => ipcRenderer.invoke('quizer:copiar', String(texto)),
  abrirHotspot: () => ipcRenderer.invoke('quizer:abrir-hotspot'),
  reabrirTela: () => ipcRenderer.invoke('quizer:reabrir-tela'),
  encerrar: () => ipcRenderer.invoke('quizer:encerrar'),
});
