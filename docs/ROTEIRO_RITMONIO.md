# RITMONIO LOGISTICS & RECONCILIATION - BLUEPRINT

## 1. Visão Global (O Desafio)
Ao contrário da Nicolazzi (cujas propostas nascem a partir de PDFs de orçamentos enviados pela fábrica), a **Ritmonio** exige a criação manual de propostas pelo utilizador. As faturas da Ritmonio **não apresentam a referência de Confirmação de Encomenda da fábrica**, apenas mencionam a referência interna da Divitek (`Vs. ORDINE`).

## 2. A Nova Engenharia ("O Criador de Propostas")
Para resolver a entrada de dados da Ritmonio, será criado um **Editor de Propostas**:
- **Numeração Automática:** As propostas ganham uma chave própria (ex: `PROP-RIT-202X`).
- **Autocompletar pelo Catálogo:** A aplicação terá a lista de preços Ritmonio carregada numa tabela da Base de Dados. Ao escrever o SKU (ex: `78T002BRX`), a descrição e preço de custo (Tabela) preenchem automaticamente.
- **Conforto de Edição UI:** O utilizador poderá arrastar linhas para reordenar a proposta, ou clicar num botão "Inserir Linha Abaixo" em qualquer ponto, eliminando a frustração do "adicionar apenas no fundo".

## 3. O Sistema de Prazos Inteligentes (Regra de Acabamentos vs Corpos Interiores)
A Ritmonio depende fortemente de "Semanas de Produção" ditadas pelos acabamentos das torneiras. A estimativa das datas de entrega (`predicted_ship_date`) na fase de proposta manual obedecerá a uma Árvore de Decisão:
1. **Regra Base (Standard):** Prazo normal de construção da fábrica estipulado no Catálogo (Tabela Padrão).
2. **Regra Via-Rápida (Corpo Interior):** Identificador oculto de catálogo (`IsInnerBody = Y`). Se for corpo de encastre **sem acabamento**, o sistema reduz o *Lead Time* para 1 ou 2 semanas (acelerado).
3. **Poder de Veto (A Regra Soberana do Acabamento):** O sistema analisa a cauda do SKU (os últimos 3 dígitos ex: `BRX`). Mesmo que a peça seja um Corpo Interior, se detetar um sufixo de Acabamento Colorido/Especial, a Regra 3 esmaga a Regra 2. O prazo sobe imediatamente para a lentidão do revestimento.

### 3.1 Correção com Base na Confirmação da Fábrica
Quando a fábrica responder com o PDF da **Order Confirmation**:
- O sistema deteta e lê as Datas de Entrega estipuladas *pela fábrica em pdf* (`Del. Date`).
- O utilizador anexa ("Linka") esse PDF à proposta manual que criou.
- O sistema pergunta: *"Queres corrigir os prazos das tuas estimativas pelas dadas da fábrica?"*. Isto corrige a linha de tempo no motor logístico de Reconciliação em tempo real.

## 4. Motor Heurístico de Correspondência de Faturas (O Algoritmo "Smart Match")
Como a fatura chega sem o N/ Confirmação da Fábrica, a *Reconciliação / Ligar Fatura* atuará como um detetive para resolver a Faturação a 100%:

### Os Pilares do Algoritmo de Confiança (Score de 0% a 100%):
1. **O "Vs. ORDINE" (Peso: 50%):** O sistema pesquisa na fatura pelo N/ Ref de Cliente. Se o valor for exatamente igual ao N.º de Proposta interno (`PROP-RIT`), atribui match quase direto.
2. **Sobreposição Genética de SKUs (Peso: 30%):** A IA lê os artigos extraídos da fatura e pesquisa em todas as Propostas Ritmonio ativas no momento, para ver qual delas tem "em espera" exatamente a mesma lista genérica de materiais.
3. **Matemática de Quantidades (Peso: 10%):** O sistema confere se as quantidades pedidas batem certo com as quantidades ainda pendentes nessa obra.
4. **Cruzamento de Identidade (Peso: 10%):** Valida se a "Morada de Entrega" bate certo com a morada do cliente gravada na proposta.

### Resultado na UI
Quando o utilizador pedir para "Ligar", a App não força uma pesquisa cega, abrindo sim um quadro dinâmico:
> *"Propostas Prováveis para esta Fatura:"*
> 1. Proposta RIT-2026-X (Score 96% - Ref Cliente Bate Certo + 4 SKUs encontrados) [ BOTÃO: LIGAR ]
> 2. Proposta RIT-2026-Y (Score 40% - 2 SKUs iguais) [ BOTÃO: LIGAR ]

## 5. Adeus Poppler, Olá Nativo (Migração de Extrator)
Para permitir que toda a Extração (Fases de Importação PDF) ocorra sem dependências de Sistemas Operativos ou servidores arcaicos, o Extrator atual da Ritmonio (que usa a biblioteca nativa do computador `poppler` `pdftotext -layout`) será rescrito numa única linha para utilizar o sistema de coordenadas virtuais já a circular na aplicação (`pdfjs-dist`), unificando a tecnologia e evitando o erro local `ENOENT pdftotext`.
