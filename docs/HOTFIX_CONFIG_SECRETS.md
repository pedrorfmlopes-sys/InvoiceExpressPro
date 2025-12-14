# Hotfix: Config Secrets Endpoint

Este documento detalha o hotfix para o endpoint `POST /api/config/secrets` que estava a retornar 404.

## O Problema
O frontend tentava fazer POST para `/api/config/secrets` mas recebia 404 Not Found, impedindo a gravação da chave da OpenAI.

## A Solução
1. **Backend**: Garantido que o ficheiro `server/src/routes/configRoutes.js` tem a rota `router.post('/secrets', ...)` e que o controller implementa a lógica correta.
2. **Frontend**: Verificada a utilização de `qp` para incluir o parâmetro `project`. Atualizada a gestão de erros para mensagens mais amigáveis.

## Como Testar

### 1. Teste via cURL (Backend)

Executar o seguinte comando no terminal (com servidor a correr na porta 3000):

```bash
curl.exe -i -X POST "http://localhost:3000/api/config/secrets?project=teste_2" -H "Content-Type: application/json" -d "{\"apiKey\":\"sk-test-12345\"}"
```

**Resultado Esperado (200 OK):**
```json
{
  "openaiApiKeyPresent": true,
  "openaiApiKeyMasked": "sk-...2345"
}
```

### 2. Teste Manual (Frontend)

1. Abrir a aplicação.
2. Ir à tab **Config**.
3. Inserir uma API Key (ex: `sk-test-12345`).
4. Clicar em "Guardar (Server)".
5. Deve aparecer um alerta "Chave guardada no servidor ✓".
6. Recarregar a página e verificar que o input mostra a chave mascarada.

### Troubleshooting
Se ainda ocorrer 404, confirmar que o servidor foi reiniciado após as alterações.
