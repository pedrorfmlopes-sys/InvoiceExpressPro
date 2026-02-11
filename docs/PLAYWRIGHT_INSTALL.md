# Instalação Correta do Playwright (Windows CMD)

Como o PowerShell está bloqueado por políticas de segurança no seu sistema, utilize a **Linha de Comandos (CMD)** normal para executar estes passos.

## 1. Pré-Requisitos
Abra o "Command Prompt" (cmd.exe) e verifique o Node.js:
```cmd
node --version
npm --version
```

## 2. Instalação do Pacote
Navegue até à pasta do projeto e instale as dependências:
```cmd
cd C:\Users\pedro\OneDrive\APPS\GitHub\InvoiceStudioGRVTY-main\client
npm install -D @playwright/test
```

## 3. Instalação dos Browsers (Binários)
Este comando descarrega os browsers necessários. Use `npx` (que deve funcionar em CMD):

```cmd
npx playwright install
```

Se o comando acima falhar, tente invocar o binário localmente:
```cmd
.\node_modules\.bin\playwright install
```

## 4. Verificar Instalação
Para confirmar:
```cmd
npx playwright --version
```

## 5. Executar Testes
Para correr os testes existentes:
```cmd
npx playwright test
```
Ou para abrir a interface visual:
```cmd
npx playwright test --ui
```
