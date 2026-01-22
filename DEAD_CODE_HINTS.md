# DEAD_CODE_HINTS.md

Candidatos a remoção ou refactorização. Estão no código mas não parecem ser usados pelo fluxo principal atual.

1.  **`ProcessV2Tab.jsx`**: A aplicação usa `CoreV2Tab` como dashboard principal. Este ficheiro parece ser uma versão abandonada ou duplicada.
2.  **Rota `/api/v2/extract`**: O backend implementa uma lógica de extração superior aqui, mas o frontend chama a rota antiga `/api/extract`. Este código é tecnicamente "morto-vivo" (runnable but unused).
3.  **Módulo `server/src/routes/extractRoutes.js`**: Parece redundante face a `server/src/modules/processing/routes.js` e `server/src/modules/coreV2`.
4.  **`TeacherTab.jsx`**: Funcionalidade de "ensino" não parece integrada no fluxo de trabalho principal.

**Recomendação:** Confirmar antes de apagar, mas estes são os principais candidatos a limpeza.
