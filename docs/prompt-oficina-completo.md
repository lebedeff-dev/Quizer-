# Prompt para o Claude Code: Oficina Gamificada (jogo de perguntas com botão no celular)

Você vai construir, do zero e em uma pasta nova, uma aplicação web que roda no notebook do responsável por uma oficina em sala de aula. Ela conduz um jogo de perguntas e respostas entre grupos, em que cada grupo usa o próprio celular como botão (buzzer) silencioso. Escreva todo o texto da interface, comentários e README em português do Brasil.

Leia o documento inteiro antes de escrever código.

## 0. Como trabalhar (obrigatório)

**Passo a passo, com aprovação.** Construa em **etapas** (seção 12). Ao fim de cada etapa: rode os testes, tire capturas de tela e **abra-as para olhar**, resuma em poucas linhas o que ficou pronto e **pare, esperando minha aprovação** antes da etapa seguinte. Não avance sozinho.

**Pasta nova.** Crie o projeto na pasta `<PASTA_NOVA>` (já existe, está vazia). Não leia, altere nem apague nada fora dela. Se a pasta tiver outro projeto, pare e me avise.

**Skills.** Antes de começar, verifique quais estão instaladas e **use-as**. Se alguma faltar, diga qual e siga sem ela (não instale nada de fonte desconhecida sem me avisar):
- `frontend-design` e `ui-ux-pro-max-skill`: hierarquia, espaçamento, tipografia e contraste das telas.
- `webapp-testing`: abrir o app em navegador headless, tirar capturas e conferir cada tela.
- `superpowers`: planejar antes, testar e **verificar antes de declarar pronto**.
- `slack-gif-creator`: só como referência de técnica para animações curtas e leves das habilidades.
- `canvas-design`, `algorithmic-art`, `web-artifacts-builder`: só se ajudarem em algo pontual (por exemplo, ilustração SVG decorativa).
- **Nenhuma skill pode mudar a stack** da seção 2 (nada de React, build ou CDN).

**Verificação visual obrigatória.** Use `webapp-testing` (ou Playwright em Chromium headless) para capturas em `/tela` 1920x1080, `/host` 1366x768 e celular 390x844. Quem escreve o CSS erra: **olhe cada imagem** e, se a tela estiver poluída, simplifique. Nunca diga que uma tela está boa sem ter visto a captura.

---

## 1. Contexto

- Uso: apresentação de trabalho na faculdade, turma com cerca de 8 grupos de 6 pessoas. A aula acontece enquanto outras turmas têm aula nas salas ao lado, por isso **o jogo não pode emitir nenhum som**.
- O notebook do responsável roda o servidor e fica ligado ao projetor. Os celulares dos grupos se conectam ao notebook por uma rede local (roteador Wi-Fi simples sem internet, ou a rede da sala). **Não pode depender de internet em hora nenhuma depois da instalação.**
- Ninguém cria conta ou instala aplicativo. Os grupos entram escaneando um QR code.
- Prazo de uso: 23 de outubro de 2026. **Prioridade de design: limpo e legível de longe.** Menos elementos, mais espaço em branco. Priorize robustez e simplicidade. Evite funcionalidades que não estejam neste documento.

## 2. Stack e restrições técnicas

- Node.js 18 ou superior. `express` para servir arquivos e a API, `ws` para WebSocket, `qrcode` para gerar o QR (gere no servidor ou no navegador a partir de um módulo local, sem CDN).
- Front-end em HTML, CSS e JavaScript puro, sem etapa de build. Um arquivo JS por tela, mais um módulo compartilhado.
- **Tudo offline**: nada de CDN, Google Fonts ou imagens externas. Use a fonte Poppins instalada pelo pacote npm `@fontsource/poppins` (arquivos locais servidos pelo próprio servidor) e, como reserva, fontes de sistema.
- Lógica do jogo em um módulo puro (`src/game.js`), sem acesso a rede ou disco, para ser testado com `node:test`. O servidor é a única fonte de verdade do estado. O front-end só mostra o estado e envia ações.
- Persistência em arquivos JSON na pasta `data/` (banco de perguntas, configurações, estado do jogo). Grave o estado a cada mudança. Se o servidor reiniciar, o jogo retoma de onde estava e os celulares se reconectam sozinhos.
- Ordem dos cliques decidida no servidor, pelo instante de chegada da mensagem (`process.hrtime.bigint()`). Cliques empatados no mesmo instante são ordenados pela ordem de chegada ao servidor, que é a ordem exibida no painel. **Não existe aviso de empate nem decisão manual da ordem**: vale o clique mais rápido e, em empate, a ordem exibida.
- Porta padrão **3100** (a 3000 é de outro projeto meu), configurável por variável de ambiente `PORT`.
- Notebook do responsável: **Windows 10/11**, com saída HDMI para o projetor em tela estendida (a `/tela` fica no projetor e o `/host` na tela do notebook). Garanta que caminhos de arquivo, scripts e comandos funcionem no Windows.
- Ao iniciar, o servidor imprime no terminal: o endereço IP do notebook na rede local (todos os IPv4 não internos, destacando o provável do hotspot), os três endereços (`/host`, `/tela`, `/g/<cor>`) e um **PIN de 4 dígitos do responsável**.

Estrutura de pastas sugerida:

```
oficina/
  package.json
  server.js
  src/game.js          (regras puras)
  src/store.js         (leitura e gravação em data/)
  src/network.js       (descoberta de IP)
  public/
    host/              (painel do responsável)
    tela/              (tela do projetor)
    g/                 (botão do celular)
    shared/            (estilos e utilitários comuns)
    assets/proximo.png   (seta dos botões de avanço)
    assets/bloqueio.png
    assets/dobro-x2.png
  data/                (criada em tempo de execução)
  referencia/slides.pdf   (slides do trabalho, opcional, só para consulta de identidade visual)
  test/
  README.md
```

**Imagens anexadas a esta mensagem.** O usuário anexa neste prompt as três imagens (seta, sinal de bloqueio e x2) e, se possível, o PDF dos slides. **Você mesmo cria a pasta `public/assets/`** e salva nela as imagens com estes nomes: a seta preta (512x512) como `proximo.png`, o sinal de proibido vermelho como `bloqueio.png` e o "x2" vermelho em 3D como `dobro-x2.png`; o PDF vai para `referencia/slides.pdf`. Identifique cada imagem pelo conteúdo. Se alguma não chegar, use os desenhos SVG substitutos e avise no README onde colocar o arquivo depois.

Os arquivos `bloqueio.png` (sinal de proibido vermelho, 740x740) e `dobro-x2.png` (x2 vermelho em 3D, 360x360) têm fundo transparente e serão salvos por você em `public/assets/`, junto com `proximo.png` (seta preta 512x512 dos botões de avanço), conforme o parágrafo acima. Referencie esses nomes. Enquanto os arquivos não existirem, mostre um desenho SVG simples no lugar, para o app não quebrar.

## 3. Telas e endereços

| Endereço | Quem usa | Observação |
|---|---|---|
| `/host` | Responsável, na tela do notebook | Abre na capa (pública). O botão Iniciar pede o PIN uma vez (guardar em cookie) e leva ao menu (seção 3B). Só o painel e a API de controle exigem PIN. |
| `/tela` | Projetor, em outra janela do mesmo notebook (tela estendida) | Somente leitura, sem PIN. Mostra a capa enquanto o responsável está na capa, no menu ou no editor de perguntas. |
| `/g/<cor>` | Celular do grupo | Aberto pelo QR. Sem PIN. |

O QR de cada grupo aponta para `http://<IP-do-notebook>:<porta>/g/<cor>`. No painel do responsável, deixe escolher qual IP usar se houver mais de um.

## 3A. Identidade visual (baseada nos slides do trabalho)

O trabalho se chama **"Misoginia na área da saúde"** e o site deve parecer a continuação dos slides da apresentação. Se `referencia/slides.pdf` existir, olhe as páginas 1, 4 e 7 antes de desenhar. Se não existir, siga as especificações abaixo, que foram medidas nos slides (valores aproximados).

**Princípio: design limpo (clean).** Muito espaço em branco, poucos elementos por tela, uma ideia por tela, tipografia grande e legível a 5 metros, sem bordas, sombras ou decoração em excesso. As decorações dos slides (cruzes, ondas, mancha rosa) aparecem **só como detalhe sutil e de baixo contraste** no fundo, nunca competindo com o conteúdo. Se houver dúvida entre mais ou menos elementos, escolha menos.

**Botão Voltar** (editor de perguntas): igual ao Próximo (amarelo pastel, só a seta, `aria-label` "Voltar"), com a seta de `proximo.png` **espelhada por CSS** (`transform: scaleX(-1)`), sem imagem nova, no **canto inferior esquerdo**. Ao clicar, salva o que estiver pendente e volta ao Menu. Se houver validação pendente, avise na página, mas permita voltar.

**Botões de avanço (Continuar e Próximo)**: pequenos e discretos, **fixos no canto inferior direito** da `/tela`, sem rótulo de texto, apenas o ícone de **seta para a direita** (arquivo `public/assets/proximo.png`, preto sobre fundo branco, 512x512, anexado pelo usuário; enquanto não existir, desenhe a mesma seta em SVG, arredondada e grossa). Cor de fundo **amarelo pastel** (#FCEBA8, hover #F8E08A), formato de círculo ou quadrado arredondado de cerca de 56 px, **sem sombra forte e sem animação chamativa**, para não roubar a atenção do conteúdo. Mostre também um `aria-label` "Continuar" ou "Próximo". Use `--amarelo-pastel: #FCEBA8` como variável.

**Paleta** (defina como variáveis CSS na raiz e use só elas):

| Variável | Valor | Uso |
|---|---|---|
| `--azul` | #4590BF | Títulos grandes, botões principais, cruzes decorativas |
| `--azul-borda` | #4A86C8 | Borda dos cartões e dos botões |
| `--azul-sombra` | #A7C1D2 | Bloco deslocado atrás dos cartões |
| `--azul-escuro` | #2A4967 | Texto pequeno em azul, contornos |
| `--rosa` | #F3B3D0 | Forma orgânica de destaque atrás de destaques |
| `--fundo` | #FFFFFF | Fundo principal |
| `--fundo-suave` | #F2F5F7 | Fundos de seção e ondas |
| `--onda` | #D5E1E9 | Ondas inferiores |
| `--cruz-clara` | #DCE6F2 | Cruzes grandes e pálidas cortadas na borda da tela |
| `--texto` | #111111 | Títulos em preto, frases de destaque |
| `--texto-corpo` | #1F1A17 | Texto corrido |
| `--certo` | #2E9E6B | Alternativa correta (verde) |
| `--errado` | #D64550 | Alternativa errada (vermelho) |

O azul #4590BF sobre branco tem contraste de apenas 3,5 para 1: use-o **somente em texto grande e em negrito** (a partir de 24 px). Texto pequeno em azul usa `--azul-escuro`.

**Tipografia**: Poppins. Títulos em Bold ou ExtraBold, entrelinha apertada (cerca de 1,05) e tamanho muito grande. Texto corrido em Regular ou Medium. Marca da identidade: **título em duas cores**, com a primeira palavra em preto e o restante em azul (como "Misoginia" em preto e "na área da saúde" em azul na capa dos slides).

**Cartões** (perguntas, alternativas, painéis e modais): **face branca** (`#fff`), borda de 2 px em `--azul-borda`, cantos de cerca de 28 px e, atrás, um bloco `--azul-sombra` deslocado cerca de 14 px para a direita e para baixo. É a assinatura dos slides. **Implemente a sombra com `box-shadow: 14px 14px 0 var(--azul-sombra)`** (não com `::before` e `z-index: -1`, que pinta por cima do branco e deixa o cartão cinza). Nada de sombras difusas. Texto escuro sobre a face branca.

**Cores dos grupos**: sempre **sólidas e cheias** (nunca semitransparentes nem com `opacity`), com texto preto ou branco escolhido pelo contraste calculado.

**Composição**: **centralize verticalmente** o conteúdo de cada cena. Nunca deixe tudo colado no topo com metade da tela vazia. A decoração (cruzes, ondas, mancha rosa) **nunca pode sobrepor texto**: na capa, o título ocupa no máximo 60% da largura, à esquerda, e a mancha rosa com as cruzes fica só à direita.

**Decoração** (SVG e CSS, sem imagens externas): cruz médica azul sólida, cruz de contorno duplo (contorno azul com cópia deslocada), cruzes enormes e pálidas em `--cruz-clara` cortadas pela borda, ondas suaves em `--fundo-suave` e `--onda` na parte de baixo, uma mancha rosa orgânica atrás do destaque principal. Use com moderação: muita decoração na capa, no menu e na `/tela`; quase nenhuma no painel `/host` durante o jogo, onde a velocidade de leitura vem primeiro.

**Tema**: claro em todas as telas (como os slides). A `/tela` deve ter contraste forte e tipografia gigante para a leitura de longe. O tom do texto da interface é sóbrio e respeitoso, porque o assunto do trabalho é sensível. Sem emojis, sem piadas nos textos.

**As cores dos grupos** (seção 4) continuam as mesmas. Elas aparecem em blocos, botões e fichas sobre esse fundo claro. Os ícones de bloqueio e x2 ficam sobre selo branco quando o fundo for vermelho, laranja, rosa ou marrom.

## 3B. Tela inicial (capa) e menu

**A capa é obrigatoriamente a primeira tela do site** (em `/host`, e espelhada na `/tela`). Conteúdo exato:

- Título em duas linhas, em tamanho gigante e duas cores: **"Misoginia"** em preto e **"na área da saúde"** em azul.
- Abaixo do título, o **nome da disciplina**, exatamente assim: **Profissão: Competências e Habilidades**. (O nome do professor **não** aparece na capa, para não parecer que o trabalho é dele. Ele aparece só na tela final.)
- Um botão **Iniciar**, em formato de pílula azul com texto branco, com a mesma sombra deslocada dos cartões. Só aparece em `/host`, não na `/tela`.
- Decoração conforme a seção 3A: pequena cruz médica no canto superior esquerdo, mancha rosa e cruzes pálidas no lado direito, ondas na parte de baixo. Sem imagens externas.
- Nada mais: sem lista de integrantes, sem menus, sem textos extras.

**Fluxo**: Iniciar → (se ainda não autenticado, pedir o PIN em um cartão na própria página) → **menu** com cartões grandes:
1. **Criar novo jogo**: leva à sala de espera (seção 4). Se existir um jogo em andamento salvo, pedir confirmação dentro da página antes de substituí-lo.
2. **Criar e editar perguntas**: leva ao editor (aba Perguntas, seção 12). É aqui que se **importa o JSON, antes de começar o jogo**. Para sair, o botão **Voltar** (seção 3A) leva ao Menu, e só então se clica em **Criar novo jogo**.
3. **Continuar jogo**: só aparece se houver um jogo em andamento salvo.

Enquanto o responsável estiver na capa, no menu ou no editor de perguntas, a `/tela` continua mostrando a capa, para que a turma não veja perguntas nem respostas. Em qualquer momento, um botão "Menu" no painel leva de volta ao menu, sem perder o estado do jogo em andamento.

## 3C. Sequência de telas (obrigatória)

Telas auxiliares **fora da sequência principal** (acessadas por botões no painel, sem alterar o fluxo abaixo): **Regras** (resumo das regras na `/tela`, com botão Fechar no painel: pontuação, habilidades, desqualificação, rodada final em dobro) e **Teste de botões** (na sala de espera, o responsável liga o modo teste: cada vez que um celular conectado aperta o botão, a `/tela` pisca a cor do grupo e mostra a ordem; nada vale ponto; ao sair do modo teste tudo é zerado).

Esta é a ordem exata do jogo na `/tela`. O painel `/host` acompanha cada passo.

1. **Capa** (seção 3B).
2. **Menu**: Criar novo jogo, Criar e editar perguntas (e Continuar jogo, se houver jogo salvo). As perguntas **são salvas automaticamente** em `data/perguntas.json` a cada alteração, com cópia datada em `data/backup/` (guardar as últimas 10) e aviso "Salvo às HH:MM". Assim o responsável pode editar antes e as perguntas estarão lá no dia. Se editar em outro computador, exporta o JSON e importa no notebook da apresentação (documente isso no README).
3. **Cores e times**: a sala de espera da seção 4 (blocos de cor, QR code, nome do representante).
4. **Começar**: botão do responsável. **Não é obrigatório que todos os grupos participem**: o jogo começa com os grupos conectados naquele momento (mínimo de 2). Cores que não conectaram simplesmente ficam de fora.
5. **Pergunta**: enunciado na tela.
6. **Alternativas**: A, B, C e D na tela.
7. **Janela**: as alternativas somem e começa o tempo para apertarem o botão (30 s).
8. **Ordem**: a tela mostra a ordem dos grupos, segundo o clique.
9. **Alternativas de novo**: as alternativas reaparecem. O responsável toca na alternativa escolhida. Se estiver errada, ela fica **vermelha e a tela continua a mesma**, com a alternativa vermelha, e o próximo da ordem responde. Se estiver certa, ela fica **verde**.
10. **Explicação**: ao acertar, a tela mostra a explicação breve e um botão **Continuar** no canto, que leva à próxima rodada (volta ao passo 5).
11. Quando houver **pelo menos 14 perguntas respondidas**, contando as que ninguém acertou e **não contando** as que ninguém quis tentar, vem o **Ranking**, com botão **Próximo** no canto.
12. **Tela final**: nomes dos integrantes do grupo e um agradecimento a quem participou. Abaixo dos integrantes, em destaque menor, a linha **"Professor orientador: Prof. Dr. Itacir João Piasson"**. Os nomes, o professor e a mensagem ficam nas Configurações. Valores padrão: "Obrigado a todos que participaram!" e os integrantes João Henrique Vogado Lima, Juliana Mel Soares Mutran, Kawany Beatriz Araújo Sousa, Luís Guilherme Lebedeff Rocha Mota, Mariana Cardoso Lima e Ryan Gabriel Araújo Almeida.
13. Botão **Próximo** na tela final: volta à capa (passo 1).

**Botões de navegação na `/tela`**: Continuar e Próximo seguem o estilo da seção 3A (amarelo pastel, só a seta, discretos) e ficam no canto inferior direito da `/tela` e podem ser clicados com o mouse pelo responsável, pois a janela do projetor é uma janela do mesmo notebook. Só aparecem quando a janela tem o cookie de autenticação do responsável. Os mesmos avanços existem no painel e na barra de espaço.

---

## 4. Entrada dos grupos (sala de espera)

- Existem **10 cores** disponíveis. O jogo aceita de 2 a 10 grupos conectados e começa quando o responsável clica em **Começar**, sem exigir que todos os grupos participem.

| Cor | Hex | Cor | Hex |
|---|---|---|---|
| Vermelho | #E53935 | Roxo | #8E24AA |
| Azul | #1E88E5 | Rosa | #EC407A |
| Verde | #43A047 | Ciano | #00ACC1 |
| Amarelo | #FDD835 | Marrom | #6D4C41 |
| Laranja | #FB8C00 | Cinza | #546E7A |

- A cor de texto sobre cada cor é preta ou branca, conforme o contraste calculado (não fixe à mão). Cores nunca podem ser o único sinal: sempre mostre também o nome da cor.
- Fluxo: a `/tela` mostra as 10 cores em blocos grandes. O responsável clica, no painel, na cor que um grupo escolheu. A `/tela` passa a mostrar **um QR code grande dessa cor**. O grupo escaneia, o celular abre o botão da cor e pede **apenas o nome do representante do grupo**. Ao confirmar, a cor aparece como "Conectado" com o nome do representante, e o QR some.
- O nome do representante é a única identificação. O **site não registra os jogadores de cada rodada** nem os integrantes do grupo: o rodízio e a elegibilidade ao prêmio são controlados pelo responsável, manualmente (ver seção 8).
- Reconexão: o celular guarda um token no `localStorage`. Se a página recarregar, o celular volta sozinho ao mesmo grupo sem pedir o nome de novo. O responsável pode liberar uma cor (desconectar o grupo) e editar o nome do representante.
- O painel mostra o status de conexão de cada grupo (conectado, perdido). Use ping/pong de WebSocket a cada 5 segundos.

## 5. Regras do jogo (fonte da verdade)

**Rodada final em dobro.** Quando o número de respondidas for 13 (ou seja, a próxima rodada com tentativa será a 14ª), a rodada é marcada como **FINAL** e **todos os pontos dela valem o dobro** (20 e 10 no lugar de 10 e 5), para todos os grupos. O selo "RODADA FINAL: PONTOS EM DOBRO" aparece na `/tela` desde a pergunta. Se ninguém tentar responder, a rodada não conta como respondida e a próxima pergunta continua sendo a final. O multiplicador final se **multiplica** com a habilidade Dobro (x2 da habilidade vezes x2 da final). A pergunta de desempate nunca é em dobro.

Implemente exatamente isto em `src/game.js`.

**Perguntas**
- Cada pergunta tem: enunciado, 4 alternativas (A, B, C, D), alternativa correta, explicação e uma etiqueta opcional (`facil` ou `atencao`).
- O banco tem cerca de 25 perguntas, mais **1 pergunta reserva** para desempate (marcada como reserva). As perguntas são usadas na ordem da lista.

**Metas e tempos (todos configuráveis, com estes padrões)**
- Meta de perguntas respondidas para encerrar o jogo: **14**.
- Janela para apertar o botão: **30 segundos**.
- Pontos: **10** para o primeiro acerto, **5** para o segundo.
- Sequência para Bloqueio: **3**. Sequência para Dobro: **5**.

**Rodada** (uma pergunta = uma rodada). A sequência de telas está na seção 3C.
1. **Pergunta**: a `/tela` mostra o enunciado e o responsável lê em voz alta. Nesta fase e na seguinte, o responsável pode ativar habilidades (seção 6). A `/tela` mostra um aviso com o ícone (por exemplo, "Azul ativou Bloqueio sobre Vermelho").
2. **Alternativas**: a `/tela` mostra A, B, C e D e o responsável lê em voz alta.
3. **Janela de 30 segundos**: as alternativas **somem**, e a `/tela` mostra a pergunta com a contagem regressiva. Os celulares liberam o botão. O servidor registra, por ordem de chegada, o primeiro clique de cada grupo (só o primeiro de cada grupo conta). Cliques fora da janela são ignorados, sem penalidade. Grupos bloqueados não conseguem clicar. A janela termina quando o tempo acaba, quando todos os grupos conectados e não bloqueados já clicaram, ou quando o responsável a encerra antes. Depois disso a ordem dos cliques fica fixa.
4. **Ordem**: a `/tela` mostra a ordem dos grupos que clicaram (1º, 2º, 3º...), com cor e nome do representante. Se ninguém clicou, vá direto ao desfecho do item 9.
5. **Alternativas de novo**: as alternativas reaparecem na `/tela`, junto com a ordem, e o 1º da ordem fica destacado como respondente atual.
6. O respondente atual responde **em voz alta, sem justificar**. O responsável toca na alternativa escolhida (no painel ou na própria `/tela`). O servidor corrige.
7. Cada pergunta tem **no máximo 2 respondentes (tentativas)**:
   - Acertou: a alternativa fica **verde**, os pontos são marcados e a `/tela` exibe a **explicação breve**, com o botão Continuar no canto.
   - Errou: a alternativa fica **vermelha**, na `/tela` e no painel, **permanece na mesma tela** e não pode mais ser escolhida nessa rodada. O 2º da ordem, se houver, passa a ser o respondente atual e escolhe entre as **3 alternativas restantes**.
8. Pontuação por tentativa:
   - 1º respondente que acertar: **10 pontos**.
   - 2º respondente que acertar: **5 pontos**, exceto se o 1º foi desqualificado (ver abaixo), caso em que o 2º recebe **10 pontos** (pontuação inteira).
9. Desfecho da rodada:
   - **Acertou alguém**, ou **os dois respondentes erraram** (a desqualificação conta como uma tentativa): a `/tela` mostra o **slide de explicação** (alternativa correta em **verde** e o texto breve da explicação). Se os dois erraram, as duas alternativas erradas ficam vermelhas e a correta é revelada em verde. O responsável lê e comenta.
   - **Ninguém apertou**, ou **só um respondeu e errou** e ninguém mais apertou: a `/tela` mostra **apenas a alternativa correta**, sem explicação. O responsável lê e segue para a próxima pergunta.
10. **Pergunta respondida** = pelo menos uma tentativa registrada (certa, errada ou desqualificada). Rodadas sem nenhuma tentativa **não contam** para a meta.
11. O jogo termina quando as perguntas respondidas chegam à meta (14) **ou** quando as perguntas do banco acabam, o que ocorrer primeiro.

**Desqualificação (soprar resposta)**
- O responsável pode desqualificar o jogador que está respondendo, em qualquer momento da rodada antes de registrar a pontuação. Botão "Desqualificar jogador" no painel.
- **"Sem resposta"** (o jogador que apertou não sabe responder): conta como **tentativa errada**, sem marcar alternativa (nenhuma fica vermelha): consome a tentativa, zera a sequência do grupo e passa para o próximo da ordem. Já o grupo que **não apertou** o botão não erra e mantém a sequência.
- Efeitos da desqualificação: a tentativa é consumida sem pontos, a sequência do grupo vai a zero e o próximo respondente da fila, se acertar, recebe a pontuação inteira (10). A desqualificação vale só para aquela rodada.

## 6. Habilidades

**As habilidades são animadas.** Use a skill de animação que o usuário instalou no Claude Code para criar essas animações (verifique as skills disponíveis e use a que se aplica). Requisitos:
- **Ganhar a habilidade** (3 ou 5 acertos seguidos): o ícone (`bloqueio.png` ou `dobro-x2.png`) surge no grupo com uma animação de entrada (escala com leve repique e brilho) na `/tela` e no celular do grupo.
- **Ativar a habilidade** (antes da janela de 30 s): animação de ativação em tela cheia na `/tela`, curta (cerca de 2 s): Bloqueio, ícone cai sobre a cor do grupo-alvo; Dobro, "x2" aparece e pulsa sobre a cor do grupo.
- **Habilidade em jogo** na rodada: ícone com movimento sutil e contínuo junto ao grupo afetado.
- **Usar no desfecho**: Dobro mostra os pontos subindo (10 para 20); Bloqueio mostra o grupo-alvo com o botão cinza no celular.
- Tudo em CSS/SVG/JS locais, sem biblioteca externa em tempo de execução, sem som, e respeitando `prefers-reduced-motion` (nesse caso, só troca de estado sem movimento). Combine com o design limpo da seção 3A.

| Habilidade | Como se ganha | Efeito |
|---|---|---|
| **Bloqueio** (ícone `bloqueio.png`) | 3 acertos consecutivos | O grupo escolhe um outro grupo. O jogador desse grupo não consegue apertar o botão **na rodada** (o bloqueio atinge o jogador da rodada, que é o grupo inteiro naquela pergunta). |
| **Dobro** (ícone `dobro-x2.png`) | 5 acertos consecutivos | Dobra os pontos do grupo na rodada (20 se for o 1º a acertar, 10 se for o 2º). |

Regras:
- Acerto consecutivo = o grupo pontuou (1ª ou 2ª tentativa) em rodadas seguidas.
- **A sequência só volta a zero quando o grupo erra**: o jogador do grupo respondeu errado (como 1º ou 2º respondente) ou foi desqualificado. O grupo que **não respondeu** mantém a sequência, pois não houve erro. Isso inclui o grupo bloqueado, o que não ficou entre os dois primeiros cliques, o que não clicou, o que teve falha no celular e todos os grupos em rodada sem respostas. A sequência conta acertos sem erro no meio, mesmo atravessando rodadas em que o grupo não respondeu.
- Ao atingir **3** acertos, o painel pergunta se o grupo **aceita o Bloqueio**. Se aceitar, ganha a habilidade e a sequência volta a zero. Se recusar, a contagem continua. Ao atingir **5**, ganha o Dobro automaticamente e a sequência volta a zero.
- **Validade de uma rodada**: a habilidade ganha ao fim da rodada N só pode ser usada na rodada N+1. Se não for ativada, é perdida no fim da N+1.
- A habilidade precisa ser ativada **antes de abrir a janela de 30 segundos**. Depois que a janela abre, as ativações ficam travadas.
- **Uma habilidade por grupo por rodada.**
- Uma habilidade ativada é **consumida** mesmo que a rodada termine sem pontos (ninguém respondeu, ou os dois erraram). Nesse caso, a sequência do grupo continua em zero.
- Na tela de preparação, o painel lista os grupos que têm habilidade, com botão "Ativar". Para o Bloqueio, o responsável escolhe o grupo-alvo em uma lista de cores (não pode ser o próprio grupo). Dois grupos podem bloquear o mesmo alvo, sem acumular efeito.

## 7. Painel do responsável (`/host`)

Foco em velocidade e **legibilidade**, usando o notebook durante a aula. A entrada é pela capa e pelo menu (seção 3B). Corpo de texto **mínimo de 15 a 16 px**; nada de rótulos minúsculos. Use a altura da tela, sem deixar metade vazia. **Mostre só o que é da fase atual** (por exemplo, "Rede" e "Teste de botões" só na sala de espera).

Hierarquia: (1) **botão principal gigante** no topo com a próxima ação ("Mostrar pergunta", "Mostrar alternativas", "Abrir janela de 30 s", "Encerrar janela", "Próxima pergunta"...), atalho: barra de espaço; (2) fila de cliques e grupos de um lado; (3) prévia da pergunta do outro, só para o responsável, com a resposta correta e a explicação destacadas (nunca vai para a `/tela` nem para os celulares antes da hora).

- **Barra superior**: fase, número da rodada, "Respondidas X/14", cronômetro, Pausar/Retomar (P), Regras, Desfazer, Menu.
- **Resposta do jogador**: quatro botões grandes A, B, C, D (atalhos A, B, C, D), mais "Desqualificar jogador" e "Sem resposta". Alternativa já marcada em vermelho fica desabilitada; a certa fica verde.
- **Fila de cliques**: cada grupo na ordem (1º, 2º...) com cor e nome do representante.
- **Painel dos grupos**: cor, representante, pontos, sequência (bolinhas até 5), habilidade, status de conexão. Ajuste manual de pontos (+/-) com registro no log.
- **Desfazer**: últimos 20 estados. Confirmações destrutivas **dentro da página** (sem `confirm()`).
- **Abas**: Jogo, Perguntas, Configurações, Registro.
- **Começar desabilitado** não pode ficar cinza quase invisível: azul esmaecido, texto legível e o motivo ("Conecte pelo menos 2 grupos").
- **Fim do jogo**: ranking com caixa "Elegível ao prêmio" por grupo, marcada à mão (padrão marcada). Destaque ao grupo elegível de maior pontuação.
- **Desempate**: se houver empate na primeira colocação entre elegíveis, "Iniciar desempate", com a pergunta reserva (ou outra não usada). Só os empatados participam, sem habilidades e sem alterar pontos. Vence quem **acertar primeiro**. Se ninguém acertar, repetir com outra pergunta.
- **Pausa do cronômetro**: congela a janela de 30 s; a `/tela` mostra "Pausado" e cliques são ignorados.
- **Novo jogo**: zera pontos, sequências, habilidades e histórico, mantendo perguntas, configurações e grupos conectados (com confirmação).
- O estado persiste e é restaurado ao reiniciar o servidor.

## 8. O que o site NÃO faz

- Não registra integrantes dos grupos nem quem joga em cada rodada. As regras de rodízio e de elegibilidade ao prêmio (ver abaixo) são fiscalizadas pelo responsável, manualmente.
  - Rodízio: o grupo escolhe um jogador por rodada. Só pode repetir um jogador depois que 4 jogadores diferentes do grupo tiverem participado (grupos com menos de 4 presentes repetem depois que todos tiverem jogado).
  - Elegibilidade: todos os integrantes presentes na aula devem ter jogado ao menos uma vez.
- Não tem clique manual no painel. Se o celular de um grupo cair ou travar, o grupo simplesmente não responde na rodada: fica no fim da ordem, sem erro, sem perder a sequência, e pode voltar na rodada seguinte.
- Não toca nenhum som. Não usa internet, contas, banco de dados externo ou serviços de terceiros.

## 9. Tela do projetor (`/tela`)

Pensada para leitura de longe: tipografia grande, alto contraste, **uma ideia por tela**, tema claro (seção 3A), conteúdo centralizado verticalmente. **Mostre só o que está descrito em cada cena e nada além.**

0. **Capa**: título em duas cores, "Profissão: Competências e Habilidades", decoração à direita. Cena padrão enquanto o responsável está na capa, no menu ou no editor.
1. **Cores e times**: título curto "Escolha a cor do grupo" e as 10 cores em blocos sólidos grandes (nome da cor e, se conectado, nome do representante). Ao escolher uma cor, o **QR code grande e centralizado num cartão branco**, com as outras cores esmaecidas ao fundo, sem cobrir blocos de forma confusa.
2. **Pergunta**: só o enunciado, grande (44 a 56 px), centralizado. Aviso de habilidade ativada, se houver.
3. **Alternativas**: pergunta menor no topo e quatro cartões brancos grandes (A, B, C, D em círculo azul, texto de 36 a 44 px).
4. **Janela**: só a pergunta e a contagem regressiva gigante. Sem alternativas.
5. **Ordem**: chips coloridos com cor, nome do representante e posição. "Ninguém apertou" se ninguém clicou.
6. **Resposta**: alternativas e ordem, respondente atual destacado. Errada: `--errado` sólido com texto branco e a palavra "errada". Certa: `--certo` sólido com texto branco e a palavra "correta".
7. **Explicação**: alternativa correta em verde e o texto breve. Botão Continuar no canto.
8. **Só a correta**: apenas a alternativa correta em verde. Botão Continuar no canto.
9. **Ranking**: ao atingir as 14 respondidas. Barras proporcionais, destaque ao vencedor elegível. Botão Próximo no canto.
10. **Final**: nomes dos integrantes, a linha "Professor orientador: Prof. Dr. Itacir João Piasson" e o agradecimento. Botão Próximo volta à capa.

**Não mostre placar de grupos durante as rodadas** (nenhum rodapé com "Ana 0, Bia 0"). Só o contador "Respondidas X/14", pequeno e discreto no canto superior esquerdo. Selo "RODADA FINAL: PONTOS EM DOBRO" quando for o caso. Sem sons. Animações discretas, respeitando `prefers-reduced-motion`.

## 10. Celular do grupo (`/g/<cor>`)

Mobile primeiro, tela inteira na cor do grupo. Nada de rolagem. Desative o zoom.

- **Primeiro acesso**: campo único "Nome do representante do grupo" e botão "Entrar".
- **Esperando**: nome da cor, nome do representante e a mensagem "Aguarde".
- **Janela aberta**: **um botão enorme ocupando quase toda a tela**, com a cor do grupo e o texto "APERTE". Responda ao evento `pointerdown` (não `click`) para a menor latência possível. Ao apertar, o botão fica desativado, vibra uma vez (`navigator.vibrate`, se existir; sem opção de configuração no app, quem decide é o jogador pelas configurações do próprio celular) e mostra "Registrado, você é o Xº".
- **Bloqueado**: botão cinza desativado com o ícone `bloqueio.png` e o texto "Bloqueado nesta rodada".
- **Fora da janela**: botão desativado.
- Nome do grupo e do representante em tamanho grande no topo. Texto preto ou branco pelo contraste calculado.
- Mantenha a tela acesa com a Screen Wake Lock API, se disponível (tolerar falha).
- Ícones sobre um **selo branco redondo** quando o fundo for vermelho, laranja, rosa ou marrom, para não se perderem.
- Se a conexão cair, mostrar "Reconectando..." e voltar sozinho.

## 11. Testes (obrigatórios)

Use `node --test`.

**Testes unitários de `src/game.js`**, cobrindo no mínimo:
- Pontuação 10 e 5, com e sem Dobro (20 e 10).
- Máximo de 2 tentativas por pergunta.
- Alternativa errada fica vermelha e não pode ser escolhida de novo na mesma rodada. O 2º respondente escolhe entre as 3 restantes.
- Desqualificação do 1º: sem pontos, sequência a zero, 2º acertando recebe 10.
- Desqualificação do 2º: rodada encerra sem pontos.
- Sequência: 3 acertos oferece Bloqueio; aceitar zera a sequência; recusar continua a contagem; 5 acertos dá Dobro e zera.
- Só erro ou desqualificação zeram a sequência. Grupo bloqueado, sem clique, fora dos dois primeiros ou em rodada vazia mantém a sequência.
- Validade de uma rodada e consumo da habilidade mesmo sem pontos.
- Uma habilidade por grupo por rodada e travamento depois da abertura da janela.
- Bloqueio impede o clique do grupo-alvo. Dois bloqueios no mesmo alvo não acumulam.
- Rodada sem tentativas não conta para a meta. Jogo termina ao chegar a 14 respondidas ou ao esgotar as perguntas.
- Desfecho: explicação só com acerto ou duas tentativas erradas. Sem tentativa, ou com uma errada e ninguém mais, mostra só a alternativa correta.
- Desempate: vence o primeiro a acertar, só entre empatados.
- Desfazer restaura o estado anterior.
- "Sem resposta" conta como tentativa errada e zera a sequência; grupo que não apertou mantém.
- Rodada final em dobro (marcação com 13 respondidas; rodada sem tentativa mantém a final; multiplica com Dobro; desempate sem dobro).
- Importar e exportar perguntas: ida e volta devolve as mesmas; arquivo inválido mostra erros sem alterar; Substituir e Acrescentar; fluxo importar, voltar, criar novo jogo usa as importadas; reiniciar o servidor mantém.

**Teste de integração**: um script que sobe o servidor e simula 8 celulares por WebSocket:
- A ordem dos cliques segue a ordem de chegada. Clique duplicado do mesmo grupo é ignorado. Clique fora da janela é ignorado.
- Reconexão com o token devolve o mesmo grupo e o estado atual.
- O estado persiste e é restaurado ao reiniciar o servidor.

Entregue também uma **lista de verificação manual** no README para ensaiar uma partida completa de ponta a ponta com 3 celulares reais.

## 12. Etapas de construção (pare ao fim de cada uma e espere minha aprovação)

**Etapa 1: base e regras.** Pasta nova, `package.json`, `src/game.js` com todos os testes unitários da seção 11 passando.
**Etapa 2: servidor.** Express e WebSocket, persistência em `data/`, descoberta de IP, PIN, QR. Teste de integração com 8 clientes simulados.
**Etapa 3: identidade visual e telas de entrada.** Variáveis CSS, Poppins local, cartões (seção 3A), capa e menu. **Capturas e aprovação do visual antes de seguir.**
**Etapa 4: editor de perguntas e importação.** Aba Perguntas (adicionar, editar, excluir, duplicar, reordenar, marcar reserva, escolher a correta, validar, contador "X de 26", prévia, explicação com contador e aviso acima de 200 caracteres, salvamento automático com cópias em `data/backup/`), **Exportar e Importar JSON** (Substituir ou Acrescentar, resumo e confirmação na página), botão Voltar. Formato: `{"perguntas":[{"id":1,"tipo":"facil|atencao","enunciado":"...","alternativas":["A","B","C","D"],"correta":0,"explicacao":"...","reserva":false}]}` (`correta` é o índice de 0 a 3). **As perguntas definitivas ainda não estão prontas e não foram anexadas**: semeie 5 perguntas de **exemplo** marcadas "[EXEMPLO, substitua]" sobre o tema do trabalho, só para eu ver o fluxo funcionando. Eu importarei as reais depois pelo editor. Não permitir editar a pergunta da rodada em andamento nem importar durante partida.
**Etapa 5: sala de espera e celular.** Cores, QR, nome do representante, reconexão, Teste de botões, tela do celular com todos os estados.
**Etapa 6: o jogo na `/tela` e no `/host`.** Todas as cenas da seção 9, painel da seção 7, Pausa, Regras, rodada final em dobro, ranking, desempate, tela final.
**Etapa 7: habilidades animadas.** Seção 6, em CSS/SVG/JS locais, com capturas em sequência (3 quadros de cada) para eu ver.
**Etapa 8: configurações, registro, README e revisão final.** Aba Configurações (meta, janela, pontos, limites de sequência, lista de integrantes e mensagem de agradecimento da tela final), Registro. README em português: instalar o Node LTS, `npm install` (uma vez, com internet), `npm start`, rede local (**roteador Wi-Fi simples sem internet como primeira opção**; a rede da sala pode isolar aparelhos; o hotspot do Windows aceita no máximo 8 aparelhos, o que com 8 grupos fica sem margem), firewall para redes privadas, impedir suspensão do notebook, abrir `/host` e `/tela`, onde ficam as imagens, backup de `data/`, e uma lista de verificação manual de 15 passos para ensaiar com 3 celulares reais. Revisão final: percorra as seções 5 e 6 regra por regra.

**Etapa 6b: painel responsivo para celular.** O `/host` também deve funcionar no celular (390x844): botão principal grande no topo, botões A, B, C, D grandes, fila de cliques e prévia da pergunta (com a resposta correta) em coluna única, sem rolagem horizontal. Serve de plano B se o projetor não aceitar tela estendida (a `/tela` fica no notebook espelhado e o responsável controla pelo celular, com o PIN).

**Etapa 9 (depois da 8): formas de abrir o app em Windows. Entregue TODAS, o usuário escolhe no dia.** Nenhuma delas pode depender de internet nem mudar `src/game.js`. Todas guardam os dados em uma pasta `data` ao lado do programa, fora do executável.
- **Opção A, desenvolvimento:** `npm start` (já existe).
- **Opção B, início rápido por `.exe` + navegador:** um `.exe` leve (use `@yao-pkg/pkg` ou o Node SEA; se um deles não funcionar, use o plano `iniciar.bat` + pasta portátil com `node.exe` embutido) que, com duplo clique, sobe o servidor local, abre `/host` no navegador padrão e `/tela` em outra janela, e mostra numa janela de console o PIN e os IPs. A janela local abre já autenticada (sem pedir PIN). Para abrir em tela cheia no projetor, use um atalho de teclado documentado (F11) e, se possível, abra a `/tela` com `--app=` no Chrome ou Edge e uma flag para posicionar no segundo monitor.
- **Opção C, aplicativo de desktop (Electron, portátil):** `main.js` que sobe o servidor e abre duas janelas, painel no monitor principal e `/tela` em tela cheia no segundo monitor (se houver apenas um, janela normal com F11), instância única, painel local já autenticado, `npm run empacotar` gera um `.exe` portátil com electron-builder, sem auto-update e sem telemetria.
- `npm run empacotar:tudo` gera B e C em `dist/`. LEIA-ME curto com os passos do dia: copiar a pasta, aceitar o firewall (rede privada), ligar o roteador, abrir o app, o que fazer se o Windows mostrar "Windows protegeu o computador" (Mais informações, Executar assim mesmo), backup de `data/`.
- Teste cada opção em pasta limpa: duas janelas abrem, o celular conecta pelo QR, o estado e as perguntas persistem ao fechar e reabrir. Capturas de tela.

## 13. Critérios de aceite

- A rodada final vale o dobro (testes: marcação com 13 respondidas, rodada sem tentativa não conta e mantém a final, multiplicação com Dobro, desempate sem dobro); a pausa congela o cronômetro.
- Nenhuma tela está poluída: cada cena mostra só o que a seção 9 descreve, centralizada, com texto grande, e as capturas confirmam.
- Uma partida completa com 8 grupos simulados e a meta de 14 respondidas termina sem erros e com o ranking correto.
- Nenhuma regra da seção 5 ou 6 depende de interpretação do front-end. O servidor valida tudo.
- Nenhuma chamada de rede para fora da máquina local em tempo de execução (verifique no código).
- Nenhum som é emitido em nenhuma tela.
- A capa mostra exatamente o título e o nome da disciplina da seção 3B (sem o professor), e o botão Iniciar leva ao menu com as duas opções (e a terceira, quando houver jogo salvo).
- Cores, tipografia e cartões seguem a seção 3A, e a fonte Poppins carrega sem internet.
- A sequência de telas da seção 3C acontece exatamente nessa ordem em uma partida completa, e as perguntas editadas continuam salvas depois de fechar e reabrir o servidor.
- A tela do celular funciona em Chrome e Safari mobile.
- O responsável consegue conduzir uma rodada inteira com no máximo 6 toques.

## 14. Pontos em aberto (não invente, pergunte ao usuário se isso se tornar necessário)

- Texto das 26 perguntas (25 do banco e 1 reserva): o usuário importará as definitivas pelo editor quando estiverem prontas (seção 12, etapa 4).
- Exportação do ranking em CSV: **não** será feita.
- Prêmio e demais detalhes do documento acadêmico: fora do escopo desta aplicação.
