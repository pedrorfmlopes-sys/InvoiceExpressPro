# Padrão Arquitetural: Sandbox-First Extraction (Arquitetura 1:1:1:1)

Este documento define a norma obrigatória para a implementação de novos extratores e a manutenção dos existentes no projeto **InvoiceStudio**.

## 1. O Princípio Fundamental
Todo o documento processado deve passar por uma fase de **Rascunho (Sandbox)** de alta fidelidade antes de ser promovido ao **Arquivo (Ledger)** central.

## 2. Estrutura 1:1:1:1 (Por Marca + Tipo)
Cada fluxo de extração para um par específico de **(Marca + Tipo de Documento)** deve ser composto por:
- **1 Documento**: Uma fonte PDF original preservada.
- **1 Extrator Especializado**: Lógica específica para aquele layout.
- **1 Banco Satélite (SQLite)**: Base de dados independente para dados ricos desse par.
- **1 Visualizador Integrado**: Interface dedicada para esse par (ex: `NicolazziProformaGoldViewer`).

## 3. Fluxo Obrigatório de Dados

### Estágio A: Extração (Sandbox)
1. O motor extrai os dados utilizando **Poppler (-layout)**.
2. Os dados detalhados (JSON completo com linhas de itens) são gravados **exclusivamente no Banco Satélite**.
3. Na **Base Principal (db.sqlite)**, cria-se apenas uma âncora com status `staging` e metadados mínimos (Nº, Data, Total) para visibilidade na lista global.

### Estágio B: Validação (Edição)
1. O visualizador original carrega o JSON do **Satélite**.
2. Qualquer alteração ou correção feita pelo utilizador é persistida **apenas no Satélite**.
3. Os dados detalhados nunca tocam a Base Principal enquanto o documento estiver em "Pendente".

### Estágio C: Finalização (Promoção)
1. Ao clicar em **"Finalizar"**, o sistema:
    - Valida a integridade dos dados finais no Satélite.
    - Promove o status na **Base Principal** para `processado` ou `arquivado`.
    - Move o PDF físico para a pasta definitiva de arquivo.
    - O Satélite passa a ser a "Cópia Detalhada de Arquivo".

## 4. Benefícios
- **Integridade**: A base de dados principal nunca contém "lixo" ou extrações falhadas.
- **Isolamento**: Um erro num extrator não corrompe os dados de outros tipos de documentos.
- **Desempenho**: Consultas globais na base principal permanecem leves (sem JSONs gigantes de tabelas de itens).
