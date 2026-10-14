'use strict';
const os = require('node:os');

// Todos os IPv4 não internos. "provavel" marca o mais provável de ser a rede dos celulares:
// o hotspot do Windows usa 192.168.137.x; depois vêm as redes domésticas comuns.
function listarIps() {
  const lista = [];
  for (const [nome, ifs] of Object.entries(os.networkInterfaces())) {
    for (const i of ifs || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      lista.push({ nome, ip: i.address, pontos: pontuar(i.address, nome) });
    }
  }
  lista.sort((a, b) => b.pontos - a.pontos);
  return lista.map((x, idx) => ({ nome: x.nome, ip: x.ip, provavel: idx === 0 }));
}

function pontuar(ip, nome) {
  let p = 0;
  if (ip.startsWith('192.168.137.')) p += 100;
  else if (ip.startsWith('192.168.')) p += 50;
  else if (ip.startsWith('10.')) p += 30;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) p += 20;
  else if (ip.startsWith('169.254.')) p -= 50; // sem DHCP
  if (/virtual|vmware|vmnet|vbox|vethernet|wsl|docker|hyper-v|vpn|radmin|tailscale|zerotier/i.test(nome)) p -= 150;
  if (/local area connection\*|conex[aã]o local\*/i.test(nome)) p += 20; // hotspot do Windows
  return p;
}

module.exports = { listarIps };
