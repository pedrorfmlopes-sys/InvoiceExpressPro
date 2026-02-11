# Auditoria Técnica: Extrator de Proformas Nicolazzi

Este documento detalha o funcionamento interno, a estrutura e os problemas identificados no sistema de extração de proformas Nicolazzi, conforme solicitado.

## 1. Arquitetura e Orquestração

O fluxo de extração é desencadeado pelo módulo `extraction_v2`. O processo segue este caminho:

1.  **Entrada**: Upload do PDF via `server/src/modules/extraction_v2/controller.js`.
2.  **Conversão Base**: O PDF é lido pelo `pdf-parse`, que gera um dump de texto bruto (sem coordenadas mantidas nativamente pelo fluxo de fallback).
3.  **Classificação**: O `server/src/engine/classifyDocType.js` identifica o documento como `proforma` (regra de prioridade sobre fatura).
4.  **Roteamento**: No `server/src/engine/engine.js`, o sistema **bloqueia** explicitamente o uso de coordenadas para proformas (Linha 30: `!/Proforma/i.test(text)`).
5.  **Execução**: O documento cai no fallback `extractFromText.js`, que invoca o `server/src/engine/nicolazziProformaTableExtraction.js`.

## 2. Mecanismo de Extração (Lógica Interna)

Diferente das faturas (que usam `pdfCoords`), o extrator de proformas é **100% baseado em Regex e heurísticas de texto plano**.

### Estrutura do Extrator (`nicolazziProformaTableExtraction.js`)
-   **Header**: Usa deslocamento de linha (ex: procura "Number" e lê a linha seguinte) para capturar o número e a data.
-   **Entidades (Customer/ShipTo)**: Utiliza uma lógica de "fatiamento horizontal" por `indexOf`. Procura as posições de "Delivery Address" e "Spett.le" e tenta extrair substrings.
    -   *Ponto Crítico*: Se o `pdf-parse` misturar as colunas (o que acontece frequentemente com textos em grelha), as posições X são perdidas e a substring captura lixo ou dados cruzados.
-   **Tabela de Itens**: Usa um buffer de linhas e procura padrões de "Preço Unitário" e "Total" no final da linha para identificar itens.
    -   *Ponto Crítico*: Linhas de descrição que quebram para a linha seguinte são concatenadas cegamente, o que pode poluir os dados se a quebra de página ocorrer no meio de um item.
-   **Totais**: Tenta somar "Goods" + "Transport" para validar o "Total Amount".

## 3. Persistência e Dados Satélite

Foi identificada uma inconsistência grave entre o armazenamento e a visualização:

-   **Onde é guardado**: O `extraction_v2` guarda o objeto `normalized` dentro do campo `raw_json` da tabela principal (PostgreSQL/SQLite).
-   **Onde o Visualizador lê**: O visualizador restaurado tenta ler de uma base de dados SQLite independente (`nicolazzi_proformas.sqlite`) via `/api/corev2/extraction-data/...`.
-   **O Conflito**: Atualmente, o fluxo de extração V2 **não escreve** no SQLite satélite. Como resultado, o visualizador abre vazio ou com dados obsoletos, sendo forçado a fazer um fallback para `doc.raw_data` que possui uma estrutura de nesting diferente (`{ normalized: { ... } }`), quebrando a UI.

## 4. Diagnóstico de Falhas (O Porquê do "Shit Results")

1.  **Falta de Coordenadas**: O proforma extractor ignora a geometria do PDF. No layout da Nicolazzi, onde o endereço de entrega e o do cliente estão lado a lado, o texto bruto torna impossível separar as colunas sem coordenadas.
2.  **Desalinhamento de Dados**: O visualizador espera encontrar `lines` e `totals` na raiz do objeto de dados, mas o sistema V2 aninha-os em `raw_json.normalized`.
3.  **Ambientes de Execução**: O extrator de proformas está a comportar-se como um "legacy fallback" em vez de uma implementação de alta fidelidade como a das faturas.

## 5. Conclusão

O extrator de proformas atual é uma solução frágil baseada em texto que não tira proveito do motor de coordenadas disponível no projeto. Para recuperar o comportamento original, é necessário unificar o motor de coordenadas para ambos os tipos (Invoice/Proforma) e alinhar a camada de persistência para que o visualizador e o extrator falem a mesma língua.

---
**Nota**: Nenhuma alteração de código foi efetuada durante esta análise.
