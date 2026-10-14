# Etapa 8b: novas habilidades (fonte da verdade)

Texto da especificação da Etapa 8b, gravado como veio do usuário. **Fonte da verdade** para tudo o que diz respeito a habilidades, ofertas, estoque, Escudo, Passe, Aposta, Dica 50/50 e pontos negativos. Onde este documento conflitar com `docs/prompt-oficina-completo.md` (seção 6) ou com o `CLAUDE.md`, vale este. A seção final registra as **decisões de interpretação** tomadas durante a implementação.

## Como trabalhar

- Autorizado alterar `src/game.js` apenas para o que está descrito aqui. Se algo conflitar com uma regra existente ou for ambíguo, não inventar: usar o padrão mais simples e listar o caso no relatório.
- Manter todos os testes passando e acrescentar testes para cada regra nova. Sem som, sem CDN, sem imagens externas.
- Ícones: `public/assets/escudo.png`, `passe.png`, `dica-50-50.png` e `aposta.png`. Se algum não existir, SVG provisório simples na identidade visual (sem emojis), avisando no relatório.
- **Subetapa 8b-1:** estoque, ofertas, Dobro como oferta, Escudo e Passe. Parar para aprovação ao terminar.
- **Subetapa 8b-2** (só depois da aprovação da 8b-1): Aposta, Dica 50/50 e pontos negativos. Ao terminar, rodar `npm run empacotar`, repetir o teste do `Quizer.exe` em pasta limpa e atualizar o `LEIA-ME.txt` com as habilidades novas. Parar para aprovação antes de qualquer etapa seguinte.
- **Jogos salvos:** um `data/jogo.json` criado na versão anterior (Dobro automático, sem estoque de habilidades) deve carregar sem erro e continuar funcionando. Há teste para isso.

## Quem decide

Todas as decisões abaixo (ofertas, Escudo, Passe, Dica 50/50, Aposta) são **do grupo**. Desde a Etapa 8d o grupo decide **no próprio celular** (ações validadas no servidor); o responsável confirma só o alvo do Bloqueio, e os botões do painel valem como reserva ("Registrar no lugar do grupo"). Nenhuma regra mudou.

## Regras gerais (8b-1)

- **Acertos seguidos viram moeda (Etapa 8f; substitui a escada de ofertas das etapas 8b a 8e):**
  - A sequência é um contador de 0 a 7 (topo = `seqDica`): para em 7 e continua zerando só em erro, desqualificação ou "Sem resposta". Não há mais oferta automática (`g.oferta`, bloqueio do Continuar, recusa automática ao fim da meta, "Seguir acumulando" e "Recusar" foram removidos).
  - O grupo **troca todos os acertos por UMA habilidade quando quiser**, enquanto a janela de 30 s não abriu. Fases permitidas: `explicacao`, `so_correta`, `placar`, `pergunta`, `alternativas`. Não vale na janela, na ordem, na resposta, no desempate nem depois de atingida a meta.
  - Faixas cumulativas (marcos `seqBloqueio`, `seqDobro`, `seqDica`): 3 ou mais = Bloqueio, Escudo ou Passe; 5 ou mais = essas e o Dobro; 7 = essas e a Dica 50/50.
  - Cada grupo faz no máximo `compraMax` trocas por jogo (padrão 3, configurável de 1 a 7); a contagem é por grupo (`g.trocas`), zera em novo jogo e o Desfazer devolve a troca. No limite: "Seu grupo já usou as 3 trocas do jogo." (vale também para a reserva do painel).
  - Comprar **zera o contador inteiro** (sem troco). Com o estoque cheio, o grupo escolhe qual habilidade guardada será trocada.
  - Bloqueio comprado segue o fluxo da 8d (alvo no celular, confirmação do responsável, decisão do Escudo do alvo).
- **Estoque:** cada grupo guarda até 2 habilidades (de qualquer tipo, repetidas permitidas). Com 2 guardadas, a troca de acertos exige escolher qual guardada sai.
- **Uso:** só 1 habilidade usada por rodada por grupo (Bloqueio, Dobro, Aposta, Passe e Dica 50/50). O Escudo não conta no limite. Bloqueio, Dobro e Aposta são ativadas antes da janela de 30 s, como hoje. Passe e Dica 50/50 são usadas durante a rodada.
- Nenhuma habilidade vale no desempate (como o Dobro hoje).

## Escudo

- Guardado até ser usado, sempre opcional. Defende somente de Bloqueio de outro grupo e não mexe na sequência de acertos.
- Quando um Bloqueio é ativado contra um grupo que tem Escudo, o painel pergunta, antes da janela de 30 s e antes de saberem a ordem dos cliques: "Registre a decisão do grupo: usar o Escudo, ou aceitar o bloqueio e guardar o Escudo."
- Se usar: o Bloqueio é anulado e os dois são consumidos (o atacante perde o Bloqueio do mesmo jeito, e o uso conta para ele na rodada).
- Se não usar: o Bloqueio vale e o Escudo continua guardado.
- Dois Bloqueios no mesmo alvo continuam não acumulando.
- A `/tela` mostra "Escudo anulou o Bloqueio" numa animação de ativação no estilo da Etapa 7 (tela cheia de ~2 s).

## Passe

- Só quem é o 1º respondente pode usar. O responsável aperta "Passou" no painel.
- Não conta como erro, a sequência continua, o Passe é consumido e as 4 alternativas ficam disponíveis para o 2º.
- O 2º, se acertar, ganha 5 pontos (não 10).
- O Passe não conta como tentativa: a rodada só entra nas 14 respondidas se o 2º tentar. Se ninguém mais tentar, aparece só a alternativa correta.

## Aposta (8b-2)

Ativada antes da janela de 30 s, como Dobro e Bloqueio. Dois modos de pagamento, escolhidos no painel conforme a decisão do grupo:

- **Modo 1, trocar 2 habilidades:** bônus fixo de +10 somado aos pontos da rodada (não é dobrado pela rodada final nem pelo Dobro). Erro, desqualificação ou "Sem resposta": −5. As 2 habilidades escolhidas ficam reservadas e só saem do estoque quando a aposta é cobrada.
- **Modo 2, pagar 10 pontos:** os pontos da rodada são triplicados, menos os 10 pagos (1º acerta: +20; 2º acerta: +5; erro, desqualificação ou "Sem resposta": −10). Bloqueado na rodada final.
- **Cobrança:** só quando o grupo realmente responde (acerta, erra, é desqualificado ou diz "Sem resposta"). Se não apertar ou ficar fora dos 2 primeiros, nada é cobrado, as habilidades reservadas voltam e a aposta continua disponível para a próxima rodada.
- **Limites:**
  - No máximo 2 apostas por grupo por jogo, somando os dois modos (contadas ao serem cobradas).
  - O saldo pode ficar negativo. O modo 2 não é permitido se o saldo depois de pagar ficaria abaixo de −20. Penalidades já cobradas (−5 ou −10) podem passar desse limite (o ajuste manual de pontos foi removido na 8k).
  - Não combina com Dobro nem com Bloqueio na mesma rodada (já decorre do limite de 1 uso).
  - Não vale no desempate.
  - O modo 1 vale na rodada final.
- A troca simples "2 habilidades por Dobro" não existe.
- Ranking, ajuste manual, desempate, Registro e `/tela` devem aceitar pontos negativos, mostrando o sinal "−" com clareza.

## Dica 50/50 (8b-2)

- Oferecida no 7º acerto seguido. Só o 2º respondente pode usar, no momento em que vira o respondente atual: o painel pergunta "Registre a decisão do grupo: usar a Dica 50/50?".
- Elimina uma alternativa errada das 3 restantes (escolha no servidor, aleatória, sem vazar a correta antes da hora). Sobram 2 alternativas, uma delas a correta. Conta como o uso da rodada.

## Interface e documentos

- `/host` no notebook e no celular (390x844): janelas de oferta, de decisão do Escudo, botão "Passou", ativação da Aposta com os dois modos e confirmação clara do que será cobrado. Não pode haver rolagem horizontal, e o botão lua/sol não pode cobrir nenhum campo (mesma medição de retângulos).
- Celular do grupo: chips "Você tem: ..." com até 2 habilidades, ícones novos e estados de aviso.
- `/tela`: animações de ganhar e ativar no estilo da Etapa 7, `prefers-reduced-motion` respeitado, capturas determinísticas de 3 quadros por momento novo.
- Configurações: limites editáveis com os valores padrão acima (acertos para cada oferta, acertos para a Dica 50/50, custo e bônus da Aposta, penalidade, limite de dívida −20, máximo de apostas).
- Registro: cada oferta, uso, decisão e cobrança, em português.
- Cena Regras, README, `docs/revisao-regras.md` e `CLAUDE.md`: atualizar todos.
- Testes novos para cada regra, incluindo: Escudo não altera a sequência após erro; Bloqueio anulado pelo Escudo consome os dois; Passe não conta como tentativa; Aposta não cobrada quando o grupo não responde; modo 2 bloqueado na final; limite de dívida; limite de 2 apostas; estoque de 2 com substituição; carga de `jogo.json` antigo.

## Ao terminar cada subetapa

Rodar `npm test`, gerar as capturas dos novos estados nos dois temas (notebook e celular), fazer um resumo curto, listar os casos de borda decididos e parar.

---

## Decisões de interpretação (8b-1)

Registradas durante a implementação, onde o texto acima é omisso ou ambíguo. Em cada caso foi usado o padrão mais simples.

1. **Sem validade de uma rodada.** A regra antiga ("ganha na rodada N, vale só na N+1, expira no fim dela") some: com estoque, a habilidade fica guardada até ser usada (ou substituída). Como a habilidade só é ganha no fim de uma rodada, ela só pode ser usada a partir da seguinte.
2. **A escada recomeça depois de aceitar.** Aceitar zera a sequência, então os marcos 3, 5 e 7 valem de novo a partir do zero. "Depois do 7 não há mais ofertas" vale enquanto a sequência segue sem ser zerada (8, 9, ...).
3. **Oferta é por marco exato.** A oferta aparece quando a sequência chega a exatamente 3, 5 ou 7 (valores configuráveis); recusar não repete a oferta no mesmo marco.
4. **Nomes de configuração mantidos** (`seqBloqueio`, `seqDobro`) por compatibilidade com jogos salvos; passam a significar o 1º e o 2º marco da escada.
5. **Escudo contra vários Bloqueios (alterado na 8b-2).** A pergunta é feita a cada ativação de Bloqueio contra um grupo que tenha Escudo guardado. Se o grupo usa o Escudo, anula apenas aquele Bloqueio; se isso esgota os Escudos livres do grupo, as decisões pendentes contra o mesmo alvo são resolvidas sozinhas como "aceitou o Bloqueio, sem Escudo" (e registradas no Registro). Se ainda sobrar um Escudo, a pergunta continua. Dois Bloqueios que valem no mesmo alvo continuam não acumulando.
6. **A janela de 30 s não abre** enquanto houver decisão de Escudo pendente.
7. **Passe sem 2º respondente (alterado na 8b-2).** Se só um grupo apertou, o Passe não pode ser usado: `usarPasse` falha ("Não há 2º respondente para receber a vez") e o botão "Passou" fica desabilitado com esse motivo. O 1º ainda responde normalmente.
8. **Passe e limite de respondentes.** Quem passou conta como um dos 2 respondentes: depois do 2º, a rodada encerra (não chama um 3º).
9. **Passe e pontuação.** Quem responde depois de um Passe recebe a pontuação do 2º (5), nunca a inteira, mesmo que o respondente anterior não tenha errado.
10. **Substituir no estoque cheio.** A oferta aceita escolhe qual das 2 habilidades guardadas sai; recusar mantém tudo.

## Decisões de interpretação (8b-2)

Valores padrão em `CONFIG_PADRAO` (editáveis em Configurações): `seqDica` 7 (maior que `seqDobro`; configurações antigas são corrigidas ao carregar), `apostaCusto` 10, `apostaMult` 3, `apostaTrocaQtd` 2, `apostaTrocaBonus` 10, `apostaTrocaPenal` 5, `apostaDivida` 20, `apostaMax` 2.

1. **Dica 50/50: quando.** Só quando o 2º respondente é o respondente atual (depois de erro, desqualificação, "Sem resposta" ou Passe do 1º) e a rodada não é desempate. O painel abre "Registre a decisão do grupo: usar a Dica 50/50?" (com "Não usar") e mantém o botão "Usar Dica 50/50" na fila de cliques.
2. **Dica 50/50: efeito.** Sempre sobram exatamente duas alternativas: com 1 erro anterior elimina 1; sem erro anterior elimina 2. As eliminadas ficam em `rodada.eliminadas` (separadas de `erradas`), não podem ser escolhidas e aparecem apagadas. No celular só o grupo que usou vê as letras A-D com as eliminadas apagadas (o celular não mostra alternativas).
3. **Aposta: uso da rodada.** Conta como a habilidade usada pelo grupo na rodada (não combina com Bloqueio, Dobro, Passe nem Dica, em qualquer ordem). Só antes da janela. Não pode ser ativada com decisão de Escudo pendente para o próprio grupo.
4. **Aposta: reserva.** As habilidades da troca ficam reservadas por tipo: continuam no estoque, mas não podem ser usadas na rodada (um Escudo reservado também não defende). Saem quando a aposta é cobrada; voltam (nunca saíram) se não for cobrada.
5. **Aposta: cobrança.** Na tentativa do grupo (acerto, erro, desqualificação, "Sem resposta"). Quem só passou a vez, não apertou, ficou fora dos 2 primeiros ou foi bloqueado não paga, e a aposta não conta no limite. A variação total do grupo na rodada fica em `tentativas[].pontos` (pode ser negativa).
6. **Aposta com pontos:** líquido = pontos da rodada × multiplicador − custo; na prática 1º que acerta +20, 2º +5 (+20 se o 1º foi desqualificado), erro −10. Bloqueada na rodada final e se o saldo depois de pagar ficaria abaixo de −20. Penalidades cobradas e ajustes manuais podem passar do limite.
7. **Aposta com habilidades:** +10 somado aos pontos da rodada (não dobrado), erro −5; vale na final.
8. **Pontos negativos** aparecem com o sinal "−" (U+2212) na /tela, no /host e no Registro; pontos negativos só vêm da Aposta (o ajuste manual saiu na 8k).
9. **Registro:** cada uso, decisão e cobrança tem linha própria em português (inclusive "Aposta não cobrada" e Escudo resolvido sozinho).
10. **Cena Regras:** 3 páginas (jogo, habilidades, Aposta); o painel ganhou "Próxima página". `ui.regras` vale 1, 2 ou 3 (`true` abre a 1).
11. **Jogo salvo da 8b-1** (versão 2) carrega: `migrarEstado` acrescenta `apostas`, `eliminadas`, `dicas` e os padrões novos.

## Decisões de interpretação (8d)

1. **Pedido de Bloqueio no servidor, não no jogo.** O pedido (cor → alvo) fica em `server.js` (salvo em `jogo.json`), não em `src/game.js`: a habilidade só é consumida quando o responsável confirma, pela mesma `ativarHabilidade`. `src/game.js` não mudou nesta etapa (só exporta `livres`).
2. **Validade do pedido.** Só vale na preparação da rodada (fases `pergunta` e `alternativas`). Some se a rodada anda, se o jogo é desfeito para outro ponto ou se a regra deixa de permitir (por exemplo, o grupo já usou outra habilidade). Um pedido por grupo; pedir o mesmo alvo de novo é inofensivo; trocar de alvo exige cancelar.
3. **Recusa:** nada é gasto, o celular mostra "O responsável recusou o pedido de Bloqueio. Nada foi gasto." e o grupo pode pedir de novo.
4. **Janela de 30 s:** não abre com pedido pendente (nem com decisão de Escudo pendente).
5. **Ofertas:** abrem no celular na explicação; a `continuar` do painel segue exigindo a decisão (pelo celular ou pelo painel).
6. **Escudo:** o celular decide só quando é o alvo; se o celular estiver offline vale o botão do painel.
7. **Dica 50/50:** a folha abre sozinha para o 2º respondente com a Dica, quando ele vira o respondente atual.
8. **Registro:** toda ação de habilidade termina com "(pelo celular)" ou "(pelo painel)"; o pedido confirmado diz "(pedido pelo celular, confirmado no painel)".
9. **Privacidade:** a visão do celular traz só o próprio estoque, saldo, oferta, pedido, decisão de Escudo, avisos e os parâmetros de regra necessários para os textos.
10. **Fila de animações na /tela:** uma ativação por vez (2,2 s sozinha; 1,6 s quando há outras esperando, mais 0,1 s entre elas): 8 ativações juntas levam cerca de 14,1 s.

## Decisões de interpretação (ofertas cumulativas)

1. **Ordem das opções:** Bloqueio, Escudo, Passe, Dobro, Dica 50/50 (a ordem em que as habilidades entram na escada).
2. **Último marco** é o `seqDica` configurado (não o número 7 fixo); é nele que o botão vira "Recusar" e o texto muda.
3. **Jogos salvos com oferta pendente** têm as opções recalculadas a partir do marco ao carregar (inclusive no histórico de Desfazer). Se o marco guardado não coincide mais com nenhum marco da configuração, as opções antigas ficam como estão.
4. **Marcos configuráveis:** `seqBloqueio` < `seqDobro` < `seqDica` continua obrigatório; a oferta de cada marco soma as habilidades dos anteriores.
5. **Aposta e estoque:** nada muda. Uma oferta de 7 acertos que escolha, por exemplo, o Bloqueio, vale como a de 3 acertos (entra no estoque, zera a sequência).

## Decisões de interpretação (8f: acertos como moeda)

1. **Topo do contador:** `seqDica` (7 por padrão). Se a Dica 50/50 for configurada para outro valor, o contador para nele.
2. **Faixas** usam `>=`: com 6 acertos vale a faixa do Dobro; só com o topo entra a Dica.
3. **Fim do jogo:** "depois de atingida a meta" = `respondidas >= meta`; vale já na explicação da última rodada. No Ranking e na tela final também não vale.
4. **Compra durante o placar** vale (`s.rodada` ainda existe); o resultado também aparece no projetor.
5. **Resultado no projetor:** "Grupo X trocou N acertos por Y" (chip na explicação, antes da janela e no placar), sem controles. `rodada.ganhos` guarda `{ cor, tipo, acertos }`.
6. **Celular:** com a janela aberta para o grupo (botão APERTE) só o contador aparece; o botão de troca volta depois. Em qualquer outra fase de jogo o botão aparece, desabilitado com o motivo quando não vale ("Só antes da janela de 30 s.", "Faltam N acertos para trocar.", "Não vale no desempate.", "O jogo está no fim.").
7. **Compatibilidade:** `VERSAO` 4. Oferta pendente de jogo salvo some e a sequência é mantida, limitada ao topo (também no histórico do Desfazer). `decidirOferta` e a ação `decidirOferta` do servidor foram removidas; a ação nova é `trocarAcertos(cor, tipo, substituir)` (celular: `trocarAcertos`).
8. **Registro:** "Decisão do grupo: X trocou N acertos por Y [no lugar de Z] (a sequência volta a zero) (pelo celular | pelo painel)".

## Decisões de interpretação (8f: limite de trocas)

1. **Motivo do limite primeiro:** o limite é checado antes da fase e da faixa em `motivoTroca`, porque é permanente; com 1 troca o texto é "Seu grupo já usou a única troca do jogo.".
2. **Contagem** em `g.trocas`; `VERSAO` 5. Jogo salvo antes do limite começa com 0 trocas (não se reconstrói pelo histórico).
3. **Painel:** o cartão mostra "Trocas X/N" e o botão de reserva some no limite; o celular mostra "Trocas usadas: X de N" junto do contador, com o botão desabilitado e o motivo.

## Decisões de interpretação (8i)

1. **Troféu** (`lideres()`) = `[vencedor()]` ou `[]`: não reinventa a regra de elegibilidade nem de desempate.
2. **Rodadas sem pontuar** (`g.rodadasSemPontos`): conta quando o grupo não teve tentativa com pontos positivos na rodada (não apertou, bloqueado, errou, ou perdeu pontos na aposta); zera ao ganhar ponto. A rodada sem nenhuma tentativa conta para todos. `VERSAO` 6; jogo salvo começa em 0.
3. **Quando a barra aparece:** só na preparação da rodada (`pergunta`/`alternativas`), que é onde a Aposta pode ser ativada; por isso a mensagem de um múltiplo de 3 chega no começo da rodada seguinte, e não na explicação. Condições: múltiplo de 3, ainda não dispensada, sem outra habilidade usada na rodada, sem decisão de Escudo pendente e com algum modo de Aposta possível (2 habilidades ou saldo; limite `apostaMax`; modo com pontos não vale na rodada final).
4. **Dispensar** (`dispensarTigrinho`) fica em `g.tigrinhoVisto`, fora do Desfazer e do Registro; o mesmo vale para expirar (10 s visíveis) e para abrir a Aposta pela barra.

## Decisões de interpretação (8j: chips tocáveis)

1. **Nenhuma regra mudou:** só o caminho até os fluxos existentes (confirmações, alvo e confirmação do responsável, decisão do Escudo, Passe, Dobro, Dica, Aposta, troca de acertos).
2. **Chip desabilitado continua tocável** (`aria-disabled`): o toque mostra o motivo. Motivos: "Já usaram uma habilidade nesta rodada.", "Só antes da janela de 30 s.", "Não vale no desempate.", "O Escudo é usado quando bloquearem vocês.", "O Passe é usado na hora da resposta, pelo 1º respondente.", "Só o 1º respondente pode passar a vez.", "Não há 2º respondente para receber a vez.", "A Dica 50/50 é usada na hora da resposta, pelo 2º respondente.", "Só o 2º respondente usa, quando for a vez dele.", "Está reservada na Aposta desta rodada.", "Há um pedido de Bloqueio aguardando o responsável." e os da Aposta (limite, saldo).
3. **Bloqueio com pedido enviado:** o chip fica habilitado e abre o pedido (cancelar); os demais esperam o responsável.
4. **A Aposta é sempre um chip**, mesmo sem habilidades guardadas; fora da preparação da rodada fica desabilitada com o motivo.

## Decisões de interpretação (8k-1: cores, imagens, pontuação)

1. **Ajuste manual de pontos removido.** A ação `ajustarPontos` saiu de `src/game.js`, do servidor e do painel (única mudança de regra autorizada na 8k): os pontos só mudam por resposta certa (com bônus e multiplicadores) e pela Aposta; o Desfazer continua. Jogos salvos mantêm pontos e histórico; o Registro guarda o texto já gravado ("Ajuste manual: ...").
2. **Marrom virou Preto** (`preto`, #212121, texto branco, contorno cinza #616161). O jogo salvo, o token do celular e o Registro são convertidos ao carregar; `/g/marrom` redireciona para `/g/preto`.
3. **Opacidade das imagens dos times** (`imagensOpacidade`, 0 a 30, padrão 12): vale na hora, mesmo com partida em andamento (não é regra de jogo).
4. **Testes** que montavam pontuação à mão usam `ajustarPontosTeste` e `ajustarPontosNoServidor` (`test/ajuda.js`, gancho `aplicarNoEstadoParaTeste` do servidor, sem rota nem mensagem de rede).

## Decisões de interpretação (8k-1b: nome do grupo, ícones, aleatorizar)

1. **Nome do grupo no lugar do nome da cor.** O que o grupo digita no celular (campo `representante` do estado, rótulo "Nome do grupo") é o nome de exibição em toda a interface e no Registro; a cor aparece só como cor (fundo, barra, ponto, `aria-label`). Vazio vira "Grupo Vermelho"; repetido (sem diferenciar maiúsculas) vira "Ana (2)", "Ana (3)", pela ordem de entrada. A regra está em `src/nomes.js` e o servidor manda `nomes` pronto nas visões da `/tela` e do painel; o celular recebe `nome` (o próprio) e, só em `acoes.nomes`, os nomes dos grupos citados na tela (alvos do Bloqueio, quem bloqueou, pedido pendente). Cor ainda livre mantém o nome da cor.
2. **Registro:** as linhas falam pelo nome do grupo e cada item novo traz `cor` (a bolinha colorida); linhas antigas continuam lidas pelo nome da cor no texto.
3. **Migração Marrom → Preto** troca só campos de cor (chaves e valores) e as linhas geradas pelo jogo; nunca o nome digitado ("representante"), nem o que está entre parênteses ou aspas nas linhas do Registro, exceto listas só de nomes de cor.
4. **Ícones:** o Preto tem relógio e o Cinza tem olho; os 10 são diferentes. Ficam sempre inteiros (sem posição negativa nem `overflow` escondendo corte): banners 70 px (58 px no painel) no canto inferior direito com 10 px de margem, celular de 56 a 110 px com 12 px de margem e área segura do iPhone; banner estreito encolhe e some.
5. **Aleatorizar ordem** pode ser repetido sem limite. A barra do editor não muda mais de lugar ("Desfazer ordem" fica sempre presente, desabilitado quando não há o que desfazer): antes, o botão aparecia onde o Aleatorizar estava e o clique desfazia a ordem.

## Decisões de interpretação (8k-2: Comemorar)

1. **Comemorar é um evento transitório do servidor**, fora do estado do jogo, do Desfazer e de `jogo.json`. Só existe no Ranking, para o vencedor de `vencedor()` (desempate decidido, só entre elegíveis). Desfazer, mudar a elegibilidade que troque o vencedor, sair do Ranking ou novo jogo a encerram. O Registro anota "Comemoração acionada".
2. **Quem pode acionar:** só o painel do responsável. A `/tela` (mesmo com cookie) e os celulares recebem erro.
3. **O que cada tela recebe:** o celular recebe só `{ id, vencedor (sim/não), mensagem }` (nada de pontos nem de outros grupos); o projetor recebe a cor, o nome do grupo e os pontos do vencedor (que já aparecem no Ranking) e se o banner está na tela.
4. **Avançar com o banner na tela** (Espaço, seta da `/tela` ou botão do painel, que vira "Voltar ao ranking") só fecha o banner e volta ao Ranking; o avanço seguinte vai à tela final. Apertar Comemorar de novo gera um `id` novo: fogos de novo e o pop-up volta para quem o fechou.
5. **Pop-up do celular:** fica até ser fechado; o `id` fechado fica no navegador (`oficina_comem_<cor>`), então não volta para a mesma comemoração. Quem recarrega sem ter fechado vê o pop-up uma vez. Fogos só tocam quando a página já estava aberta ao começar (não ao reconectar ou recarregar).
6. **Fogos:** canvas puro e sem som; limite de partículas (celular 160, projetor 520); com `prefers-reduced-motion` viram um brilho suave. Os do celular ficam abaixo do pop-up e nunca recebem toque.
7. **Mensagem de parabenização** (`config.final.parabens`, até 300 caracteres, vazio volta ao padrão) vale na hora; o vencedor ganha antes a frase "Vocês venceram!".
8. **Nome da cor na seleção:** nome de cor nunca quebra (uma linha, tamanho pela largura do banner); nome de grupo digitado quebra ou encolhe.

## Decisões de interpretação (8l: Preto/Branco e tema global)

1. **Continuam 10 times.** O id `preto` não muda (chave de jogo salvo, token do celular, `/g/preto`); só a aparência: tema claro = "Preto" `#212121`, texto branco, contorno `#616161`; tema noturno = "Branco" `#F2F2F2`, texto preto, contorno `#9E9E9E`. O ícone (relógio) segue a cor de texto calculada. `/g/branco` abre `/g/preto`. Nenhuma regra de jogo mudou; não houve conversão de jogo salvo nem de `VERSAO`.
2. **Nome pelo tema, na hora de mostrar.** `CORES.preto` (em `public/shared/cores.js`) devolve Preto ou Branco conforme o tema aplicado por `aplicarTema`; o servidor manda `nomes` já pelo tema (nome de reserva "Grupo Preto"/"Grupo Branco"). O nome que o grupo digitou nunca muda com o tema. Trocar o tema redesenha todas as telas (seleção, QR, fichas, ranking, banner de parabéns, fila, alvos do Bloqueio, celular).
3. **Registro:** o texto gravado leva uma marca (`U+2063 PRETO U+2063`) no lugar do nome de reserva do time; `GET /api/registro` e `.txt` trocam a marca pelo nome do tema atual. Linhas escritas antes da 8l não têm a marca e mostram o texto como foi gravado.
4. **Aviso no painel:** ao mudar o tema com um grupo de id `preto` no jogo, uma faixa discreta (9 s, com botão de fechar) diz "O grupo Preto aparece como Branco no tema noturno." Uma vez por mudança de tema.
5. **O celular não tem tema próprio:** sem botão nem tecla de tema e sem ler nem gravar tema no `localStorage`. Antes de desenhar, busca o tema do servidor (`/api/capa`, no máximo 2 s; sem resposta, claro) e depois segue o tema de cada visão do servidor (ao conectar, reconectar e ao alternar, sem recarregar). O fundo é a cor do time (Preto ou Branco conforme o tema). O painel e o projetor continuam guardando o último tema só para abrir sem piscar.
