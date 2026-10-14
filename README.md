# Quizer — Oficina gamificada sobre misoginia na área da saúde

> Projeto da disciplina **Profissão: Competências e Habilidades** (GPE17M40083) — Engenharia de Software, Universidade Católica de Brasília (UCB).
> Orientação: **Prof. Dr. Itacir João Piasson** · Apresentação: **23/10/2026**

## Sobre o trabalho

O tema do trabalho é **"Misoginia na área da saúde"**. Discute como o preconceito de gênero aparece na formação, nos resultados clínicos e no atendimento, por exemplo:

- a manipulação de notas de candidatas em faculdades de medicina japonesas;
- o enigma do cirurgião ("a cirurgiã é a mãe do menino") e o viés de gênero que ele revela;
- estudos que mostram melhores desfechos pós-operatórios em pacientes tratados por cirurgiãs;
- o atraso de até 11 anos no diagnóstico da endometriose e o quanto a dor feminina é minimizada;
- a pouca verba de pesquisa para doenças que afetam mulheres.

Os slides da apresentação estão em [`docs/trabalho/slides.pdf`](docs/trabalho/slides.pdf).

## Sobre o Quizer

Para a apresentação, em vez de uma palestra expositiva, o grupo criou o **Quizer**: uma oficina de perguntas e respostas gamificada. Os participantes se dividem em grupos (cada um com uma cor), respondem pelo celular a perguntas sobre o tema e disputam pontos, enquanto o projetor mostra o jogo. Cada pergunta serve de gancho para uma conversa sobre o assunto.

O Quizer funciona **100% offline**: roda em um notebook, que cria um servidor local, e os celulares entram pela rede Wi-Fi local (basta um roteador, sem internet).

### Telas

| Tela | Endereço | Para quê |
|---|---|---|
| Responsável | `/host` | Conduz o jogo: escolhe perguntas, libera rodadas, edita perguntas e configurações |
| Projetor | `/tela` | Mostra a pergunta, o placar, o ranking e as comemorações |
| Grupo | `/g/<cor>` | Celular de cada grupo: responde, usa habilidades e apostas |

Os celulares entram lendo um QR Code. Dispositivos que não são o notebook do responsável pedem um PIN de 4 dígitos.

### Como o jogo funciona

- Cada rodada tem uma pergunta e uma janela de 30 segundos. No máximo 2 grupos podem responder.
- Acerto vale 10 pontos (5 para o segundo respondente).
- Uma sequência de acertos rende pontos de sequência, que podem ser trocados por **habilidades**: Bloqueio, Escudo, Passe, Dobro e Dica 50/50 (no máximo 3 trocas por grupo).
- Os grupos podem fazer **Apostas** (dois modos) para arriscar pontos.
- Grupos que passam três rodadas sem pontuar recebem uma mensagem do "Tigrinho", sugerindo uma aposta.
- Ao fim, o ranking aponta o vencedor, e o responsável pode **comemorar** com fogos de artifício e uma mensagem de conscientização sobre o tema.
- São 10 cores de time em tons pastel, cada uma com seu ícone, e temas claro e escuro.

As regras detalhadas estão em [`docs/regras-habilidades.md`](docs/regras-habilidades.md).

## Tecnologias

Node.js (18 ou superior), Express, WebSocket (`ws`), `qrcode`, fonte Poppins (`@fontsource/poppins`) e HTML/CSS/JS puro no front-end. O executável é gerado com Electron e electron-builder.

## Como executar

```bash
npm ci
npm start          # servidor em http://localhost:3100
```

Abra `http://localhost:3100/host` no notebook e `http://localhost:3100/tela` no projetor. Os celulares usam o QR Code mostrado na tela do responsável.

Outros comandos:

```bash
npm run app        # abre como aplicativo (Electron)
npm test           # roda os testes automatizados
npm run empacotar  # gera dist/Quizer.exe (portátil, Windows)
```

O arquivo `LEIA-ME.txt` traz as instruções do dia da apresentação (rede, firewall, PIN). O guia técnico completo está em [`docs/guia-tecnico.md`](docs/guia-tecnico.md).

## Estrutura

```
src/        servidor, regras do jogo e protocolo WebSocket
public/     telas (host, projetor, grupo) e assets
data/       perguntas.json (as perguntas) e dados de execução
docs/       guia técnico, regras e material do trabalho
test/       testes automatizados
```

## Autores

- João Henrique Vogado Lima
- Juliana Mel Soares Mutran
- Kawany Beatriz Araújo Sousa
- Luís Guilherme Lebedeff Rocha Mota
- Mariana Cardoso Lima
- Ryan Gabriel Araújo Almeida

## Créditos e observações

- Projeto acadêmico, sem fins lucrativos.
- Os conteúdos e referências do tema estão listados ao final dos [slides](docs/trabalho/slides.pdf).
- O avatar do "Tigrinho" é uma referência humorística a um mascote de jogo de terceiros e pertence aos seus respectivos donos; se não existir, o app usa um avatar "T" no lugar.
