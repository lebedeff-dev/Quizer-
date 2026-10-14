# Etapa 8d (planejada; só implementar depois de "aprovado, siga para a 8d")

Texto gravado como veio do usuário.

## Etapa 8d: o grupo decide as habilidades no próprio celular

Objetivo: as decisões de habilidades passam a ser tomadas pelo grupo na tela do botão (celular), com efeito imediato. O responsável fica só com a confirmação do alvo do Bloqueio. Os botões atuais do `/host` continuam existindo como reserva ("registrar no lugar do grupo"), para celular travado, sem bateria ou offline. Nenhuma regra do jogo muda (`docs/regras-habilidades.md` continua valendo). Autorizo mudanças mínimas em `src/game.js` só se o pedido pendente de Bloqueio exigir; prefira resolver no servidor. Jogos salvos antigos devem carregar.

O que o celular do grupo passa a fazer (todas as ações com janela de confirmação grande, texto curto e botões "Confirmar" e "Voltar"; sem som):

1. **Ofertas de 3, 5 e 7 acertos** (fases `explicacao` e `so_correta`, até o responsável avançar): mostra a oferta com os textos aprovados em `public/shared/textos.js`, e o botão "Seguir acumulando". Com o estoque cheio, pede também qual habilidade guardada será trocada.
2. **Antes da janela de 30 s** (fases `pergunta` e `alternativas`): mostra o estoque como botões.
   * Dobro: confirmação e efeito imediato.
   * Aposta: escolher o modo (trocar 2 habilidades, escolhendo quais; ou pagar 10 pontos), com a confirmação do que será cobrado (mesmo texto do painel) e o saldo do próprio grupo. Bloqueios de regra (final, dívida, limite de 2) aparecem com o motivo.
   * Bloqueio: o grupo escolhe o grupo alvo (lista com as cores) e envia um pedido. O painel mostra "Azul quer bloquear Verde" com Confirmar e Recusar. Só ao confirmar, a habilidade é consumida e o Bloqueio vale; se o responsável recusar, nada é gasto. O grupo pode cancelar o pedido antes da confirmação. Enquanto houver pedido pendente, o painel não abre a janela (mostrando o motivo).
   * Escudo: o botão só aparece para o grupo-alvo de um Bloqueio confirmado ("Fulano bloqueou vocês. Usar o Escudo ou aceitar o bloqueio?"). Enquanto a decisão estiver pendente, o painel não abre a janela. Com o celular offline, vale o botão de reserva do painel.
3. **Durante a resposta** (fase `resposta`): Passe, só para o 1º respondente, e Dica 50/50, só para o 2º, com confirmação. A Dica mostra no celular as letras A-D com as eliminadas apagadas (como já existe).
4. Os botões somem quando a janela de 30 s abre (o botão de apertar volta como hoje) e quando a regra não permite o uso. O limite de 1 uso por rodada (o Escudo não conta) é respeitado. Um segundo toque seguido não repete a ação (idempotência).

### Painel do responsável

* Janela de confirmação do pedido de Bloqueio, descrita acima.
* Indicador discreto, em cada cartão de grupo, de quem tem habilidade e ainda não usou nada na rodada (só informativo; o responsável continua decidindo quando abrir a janela).
* Os botões atuais continuam como reserva, rotulados "Registrar no lugar do grupo". Todo uso pelo celular ou pelo painel aparece no Registro em português, dizendo de onde veio ("pelo celular" ou "pelo painel").
* O `Desfazer` continua valendo para qualquer uma dessas ações.

### Servidor e segurança

* As novas ações do celular valem só para o próprio grupo (token do grupo já existente). Nenhum celular age em outro grupo nem vê dados de outros grupos (estoque, saldo, escolhas). O celular recebe apenas o que precisa: o próprio estoque e saldo, o estado da oferta e das decisões pendentes, e seus avisos.
* O servidor valida fase, regra e idempotência, como já faz para o painel. A reconexão restaura o estado dos botões.
* Respeitar `prefers-reduced-motion`, sem som, sem CDN.

### `/tela`

* As animações de ativação (Etapa 7 e 8b) acontecem no momento em que o efeito vale, em fila, uma de cada vez, para vários grupos ativando juntos não se sobreporem. Relatar no resumo como ficou o tempo total com 8 grupos.

### Textos e documentos

* Reutilizar os textos de `public/shared/textos.js`. As confirmações novas devem ser curtas, sóbrias e coerentes com eles. Listar as frases novas no relatório para revisão.
* Atualizar cena Regras (se algo mudar), README, `LEIA-ME.txt` ("o grupo escolhe a habilidade no celular; o responsável confirma o alvo do Bloqueio"), `docs/revisao-regras.md` e `CLAUDE.md`.

### Testes e capturas

* Testes: um grupo não age em outro; ações fora da fase falham; toque duplo é idempotente; pedido de Bloqueio (confirmar, recusar, cancelar); Escudo só para o grupo-alvo; Passe só para o 1º e Dica só para o 2º respondente; ofertas pelo celular com estoque cheio; botões de reserva do painel ainda funcionam; reconexão restaura os botões; o celular não recebe dados de outros grupos; jogos salvos antigos carregam.
* Capturas nos dois temas: celular em cada estado novo (oferta, estoque, confirmações, Aposta, escolha do alvo, pedido pendente, decisão do Escudo, Passe, Dica) e o painel (pedido de Bloqueio, indicador, reserva). Sem rolagem horizontal; o botão lua/sol não cobre nada.
* Ao final: `npm test`, `npm run empacotar`, teste do `Quizer.exe` em pasta limpa, atualização do `LEIA-ME.txt`, resumo curto, casos de borda decididos, e parar para aprovação.
