# Revisão final: seções 5 e 6, regra por regra

Conferência feita na Etapa 8 (e atualizada na 8b-1, para habilidades) contra `src/game.js` e os testes. Resultado: **nenhuma divergência encontrada**; `src/game.js` não foi alterado nesta revisão. Cada linha aponta onde a regra é garantida e qual teste a cobre.
`g` = `test/game.test.js`, `j` = `test/jogo.test.js` (servidor de ponta a ponta), `r` = `test/revisao.test.js`.

## Seção 5: regras do jogo

| Regra | Onde | Teste |
|---|---|---|
| Rodada final em dobro (13 respondidas), selo desde a pergunta | `iniciarRodada` (`final`), `visaoTela.rodadaFinal` | g "rodada final em dobro", g "rodada final: 20 e 10", j "partida completa" |
| Sem tentativa, a final continua final; multiplica com Dobro; desempate nunca em dobro | `multiplicador`, `iniciarRodada` | g "rodada final em dobro...", g "desempate..." |
| Perguntas usadas na ordem da lista; reserva só no desempate | `iniciarRodada` | r "5.3 perguntas na ordem" |
| Padrões: meta 14, janela 30 s, 10/5 pontos, 3 e 5 de sequência (configuráveis) | `CONFIG_PADRAO`, aba Configurações | `config-registro` "Configurações do jogo", r "limites de sequência" |
| Só o 1º clique de cada grupo conta; fora da janela e em pausa são ignorados | `clicar` | g "clique duplicado, fora da janela e em pausa", integração |
| Grupos bloqueados não clicam | `clicar` | g "Bloqueio impede o clique" |
| Janela termina por tempo, por todos aptos terem clicado, ou pelo responsável | `clicar`, `encerrarJanela`, cronômetro do servidor | r "5.3 ... a janela fecha", j "pausa", `config-registro` "Registro" |
| Ninguém clicou: vai direto ao desfecho "só a correta" | `encerrarJanela`/`resolver` | g "desfecho", j "desfecho sem tentativa" |
| No máximo 2 respondentes | `MAX_TENTATIVAS` | g "no máximo 2 tentativas" |
| Errada fica vermelha, não repete; 2º escolhe entre as 3 restantes | `responder` (`erradas`) | g "alternativa errada não pode ser repetida" |
| 10 para o 1º, 5 para o 2º; 10 se o 1º foi desqualificado | `pontosBase` | g "pontuação", g "desqualificar o 1º" |
| Desfecho: explicação se acertou ou se as duas tentativas erraram; senão só a correta | `resolver` | g "desfecho", r "desqualificar o 1º e o 2º errar" |
| Respondida = ao menos uma tentativa; rodada sem tentativa não conta | `resolver` | g "rodada sem tentativas não conta" |
| Jogo termina na meta ou com o banco esgotado | `continuar` | g "rodada sem tentativas... esgotar perguntas" |
| Desqualificação: consome a tentativa, sem pontos, zera a sequência; 2º recebe 10 | `desqualificar` | g "desqualificar o 1º / o 2º" |
| "Sem resposta" conta como erro sem marcar alternativa; quem não apertou mantém | `semResposta` | g "sem resposta conta como erro" |

## Seção 6: habilidades (regras da Etapa 8b-1)

As regras de habilidades passaram a ser as de `docs/regras-habilidades.md` (fonte da verdade); a tabela abaixo é a revisão dessa versão. `ga` = `test/game.test.js`, `hs` = `test/habilidades-servidor.test.js`.

| Regra | Onde | Teste |
|---|---|---|
| Acertos seguidos viram moeda (8f): contador 0 a 7 que para em 7; faixas 3 (Bloqueio, Escudo, Passe), 5 (+ Dobro), 7 (+ Dica 50/50); troca zera o contador inteiro; erro, desqualificação e "Sem resposta" zeram; uma habilidade por compra | `resolver`, `opcoesDaSequencia`, `trocarAcertos` | `test/troca-acertos.test.js` "faixas", "o contador sobe...", "uma habilidade por compra" |
| Limite de trocas por grupo (`compraMax`, padrão 3): a 4ª é recusada com o motivo; por grupo; configurável; Desfazer devolve; novo jogo zera; migração começa em 0; vale na reserva do painel | `motivoTroca`, `trocarAcertos`, `migrarEstado` | troca-acertos "3 trocas liberam...", "o limite de trocas é configurável", "Desfazer devolve a troca...", "a reserva do painel respeita o limite" |
| Fases permitidas (explicação, só a correta, placar, pergunta, alternativas) e proibidas (janela, ordem, resposta, desempate, depois da meta) | `motivoTroca` | troca-acertos "fases permitidas..." |
| Não há oferta automática: o Continuar nunca trava e a meta não recusa nada; jogo salvo da 8e perde a oferta pendente e mantém a sequência (até 7), também no histórico | `continuar`, `migrarEstado` | troca-acertos "o Continuar nunca é travado", "migrarEstado" |
| Estoque de até 2 (repetidas permitidas); cheio, a troca exige escolher qual guardada sai | `trocarAcertos` | troca-acertos "estoque cheio", celular-8d "troca pelo celular com estoque cheio" |
| Desfazer desfaz a compra (contador e estoque) | `desfazer` | troca-acertos "Desfazer desfaz a compra" |
| Sem validade de uma rodada: a habilidade fica guardada até ser usada | `resolver` (sem expiração) | ga "estoque: a habilidade fica guardada" |
| 1 habilidade usada por rodada por grupo (Bloqueio, Dobro, Passe); o Escudo não conta | `usou`, `ativarHabilidade`, `usarPasse` | ga "habilidade ativada é consumida...", ga "Passe: uma habilidade por rodada", ga "Passe: o Escudo não conta" |
| Bloqueio/Dobro só antes da janela; consumidas mesmo sem pontos; alvo ≠ o próprio grupo | `ativarHabilidade` | ga "ativações travam", ga "Bloqueio impede o clique do alvo" |
| Dois Bloqueios no mesmo alvo não acumulam | `bloqueios` | ga "dois bloqueios no mesmo alvo", ga "Escudo: dois Bloqueios..." |
| Escudo: pergunta antes da janela; usar anula o Bloqueio e consome os dois (o uso conta para o atacante); guardar mantém o Bloqueio e o Escudo; não altera a sequência | `decidirEscudo`, `abrirJanela` | ga "Escudo: Bloqueio contra quem tem Escudo...", ga "Escudo usado...", ga "Escudo guardado...", ga "Escudo não altera a sequência", hs "Escudo pelo servidor", hs "Escudo guardado pelo servidor" |
| Passe: só o 1º respondente; não é erro nem tentativa; sequência mantida; as 4 alternativas ficam para o 2º, que ganha 5; sem 2º, só a correta e a rodada não conta | `usarPasse`, `pontosBase` | ga "Passe: só o 1º respondente...", ga "Passe: depois do 2º...", ga "Passe: não conta nas respondidas...", hs "Passe pelo servidor", hs "Passe sem 2º respondente" |
| Nenhuma habilidade vale no desempate | `ativarHabilidade`, `usarPasse` | ga "nenhuma habilidade vale no desempate" |
| Jogo salvo da versão anterior carrega e continua | `migrarEstado` | ga "migrarEstado...", hs "jogo.json da versão anterior" |

## Habilidades da Etapa 8b-2

`b2` = `test/habilidades-8b2.test.js`, `b2s` = `test/habilidades-8b2-servidor.test.js`, `tx` = `test/textos.test.js`.

| Regra | Onde | Teste |
|---|---|---|
| Dica 50/50 no marco 7; `seqDica` configurável e maior que `seqDobro` | `opcoesDoMarco`, `normalizarConfig` | b2 "marco 7", b2 "seqDica é configurável", ga "escada" |
| Dica: só o 2º respondente; elimina 1 (após erro) ou 2 (Passe, desqualificação, "Sem resposta"); sobram a correta e uma errada; não vale no desempate; conta como o uso | `usarDica5050` | b2 "Dica 50/50: ..." (4 testes), b2s "Dica 50/50 pelo servidor" |
| Eliminadas não vazam a correta e aparecem só na /tela e no celular do grupo | `visaoTela`, `visaoGrupo` | b2 "Dica 50/50 nas visões" |
| Aposta com pontos (+20, +5, −10), final e desempate bloqueados, limite de dívida −20 | `apostar`, `cobrarAposta` | b2 "Aposta com pontos", b2 "limite de dívida", b2 "Aposta com habilidades vale na rodada final", b2 "Aposta no desempate" |
| Aposta com 2 habilidades (+10 / −5), reservadas só saem quando cobrada | `apostar`, `cobrarAposta`, `livres` | b2 "Aposta com 2 habilidades", b2 "habilidades reservadas" |
| Aposta só é cobrada se o grupo responde; habilidades voltam; não conta no limite | `resolver` | b2 "Aposta não cobrada" (3 testes), b2s "Aposta não cobrada pelo servidor" |
| Máximo de 2 apostas por grupo por jogo; não combina com Dobro/Bloqueio | `apostar` | b2 "no máximo 2", b2 "não combina" |
| Pontos negativos no ranking e no vencedor | `classificacao` | b2 "pontos negativos", b2s "Aposta com pontos pelo servidor" |
| Passe sem 2º respondente falha; Escudo esgotado resolve os outros Bloqueios do alvo | `usarPasse`, `decidirEscudo` | ga "Passe sem 2º respondente", ga "Escudo: ao usar o único Escudo", b2s "Escudo pelo servidor" |
| Configurações novas validadas; textos exatos do pedido | `salvarConfigJogo`, `textos.js` | b2s "Configurações da 8b-2", tx |
| `jogo.json` da 8b-1 carrega | `migrarEstado` | b2 "migrarEstado", b2s "jogo.json da 8b-1" |

## Etapa 8c

`c` = `test/etapa-8c.test.js`.

| Regra | Onde | Teste |
|---|---|---|
| Placar parcial: só na 7ª com os padrões; Ranking (sem placar) na 14ª; muda com N; toda rodada; desligado; ocultar nas últimas K | `placarDevido`, `continuar` | c "placar parcial: com os padrões", c "muda com N", c "ocultar nas últimas K" |
| Não dispara em rodada sem tentativa, no desempate nem junto do Ranking; Desfazer volta à explicação; Continuar sai do placar | `placarDevido`, `continuar` | c "rodada sem tentativa", c "continuar sai do placar" |
| Placar: só cor e pontos, ordem decrescente, empates dividem a posição, negativos; celular mostra "Placar na tela" | `placar`, `visaoTela`, `visaoGrupo` | c "só cor e pontos" |
| Configurações e Registro do placar; jogo salvo antigo carrega | `salvarConfigJogo`, `registro`, `migrarEstado` | c "Configurações do placar parcial", c "jogo salvo antigo" |
| Troféu em todos os empatados no topo; arquivo WebP com extensão certa | `lideres`, `trofeu.webp` | c "troféu" (2 testes) |
| Aleatorizar: ordem muda, mesmo conjunto, reserva no fim, alternativas intactas, backup, desfazer, bloqueio com partida | `aleatorizarOrdem`, `POST /api/perguntas/aleatorizar` | c "aleatorizarOrdem", c "Aleatorizar ordem pela API", c "Aleatorizar ordem fica bloqueado" |

## Etapa 8d: decisão no celular

`d` = `test/celular-8d.test.js`.

| Regra | Onde | Teste |
|---|---|---|
| Cada celular age só pelo próprio grupo; quem não é o grupo não age | `tratarAcaoGrupo` (servidor), `ws.cor` | d "oferta pelo celular", d "o celular só recebe o que é dele" |
| Ações fora da fase falham; toque duplo não repete | regras de `game.js` + checagens do servidor | d "oferta pelo celular", d "Dobro e Aposta pelo celular", d "Escudo pelo celular" |
| Pedido de Bloqueio: confirmar, recusar, cancelar; a janela espera; nada é gasto antes; Desfazer | `pedirBloqueio`, `confirmarBloqueio`, `recusarBloqueio`, `podarPedidos` | d "pedido de Bloqueio" (2 testes), d "pedido de Bloqueio salvo" |
| Escudo só para o grupo-alvo; a janela espera a decisão | `decidirEscudo` (celular) | d "Escudo pelo celular", d "Escudo: aceitar" |
| Passe só para o 1º e Dica só para o 2º respondente | `tratarAcaoGrupo` | d "Passe só para o 1º ... Dica só para o 2º" |
| Troca com estoque cheio exige escolher qual sai; reserva do painel continua valendo e é registrada "pelo painel"; o celular só troca pelo próprio grupo e não vê dados de outros | `trocarAcertos`, `rodarAcaoJogo`, `visaoGrupo` | d "troca pelo celular com estoque cheio", troca-acertos (servidor) |
| O celular não recebe dados de outros grupos; a reconexão restaura os botões | `visaoGrupo`, `acoesDoGrupo` | d "o celular só recebe o que é dele" |

## Etapa 8i

`t` = `test/tigrinho.test.js`, `tc` = `test/tigrinho-celular.test.js` (navegador de verdade).

| Regra | Onde | Teste |
|---|---|---|
| Troféu só para quem realmente vence (primeiro inelegível, primeiro e segundo inelegíveis, ninguém elegível, empate com desempate pendente, todos elegíveis) | `lideres`, `vencedor` | t "troféu: ..." (5 testes) |
| Contagem de rodadas sem pontuar (0, 1, 2, 3, 6), zera ao pontuar, bloqueado/sem tentativa contam, aposta perdida não conta, desempate não conta, Desfazer, novo jogo, migração | `resolver`, `migrarEstado` | t "contagem...", "rodada em que o grupo não respondeu...", "errar conta...", "a rodada de desempate não conta", "Desfazer devolve..." |
| A mensagem só na preparação, só se puder apostar, dispensar não repete, só o grupo certo vê | `acoesDoGrupo`, `visaoGrupo` | t "a mensagem vem com 3, 6, 9...", "não aparece sem condição...", "dispensar não repete...", "a visão do grupo certo..." |
| Barra: sem horário, balão verde, X de 44 px, abre a Aposta, expira em 10 s, pausa com a página oculta, não cobre APERTE nem a folha | `barraTigrinho` | tc (2 testes) |

## Seção 7 e demais critérios

| Regra | Teste |
|---|---|
| Vencedor = maior pontuação entre os **elegíveis**; empate só entre elegíveis exige desempate | r "7: o vencedor é o de maior pontuação entre os ELEGÍVEIS" |
| Desempate: só os empatados, sem habilidades nem alterar pontos; vence quem acertar primeiro; sem acerto repete com outra pergunta | g "desempate...", j "empate no topo" |
| Pausa congela a janela e ignora cliques | j "pausa congela" |
| Desfazer (20 estados); Novo jogo zera e mantém grupos | g "desfazer", j "desfazer restaura... novo jogo" |
| O servidor valida tudo; ações fora de fase são recusadas | j "o painel recebe a pergunta... fora da fase" |
| A `/tela` e os celulares nunca recebem a resposta antes do desfecho | j "partida completa" (checa campos ausentes por fase) |
| Nenhuma chamada de rede para fora; nenhum som | r "aceite: nenhuma chamada de rede para fora e nenhuma API de som" |
| Estado persiste e é restaurado ao reiniciar; reconexão por token | integração, `tema`, `config-registro` |

## Observações

- A "Rodada final em dobro" também vale quando a 2ª rodada de um jogo com meta 2 é a última (revelado pelo teste r "7"); é o comportamento especificado.
- Fora do escopo do código, por decisão da especificação: rodízio de jogadores e elegibilidade ao prêmio são controlados à mão pelo responsável.
