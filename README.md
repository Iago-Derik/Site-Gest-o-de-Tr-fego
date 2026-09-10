# 🎬 Video Hub • Local Pro 2.0

Uma plataforma web moderna, rápida e intuitiva para organizar, assistir e estudar cursos e videoaulas armazenados localmente no seu computador.

---

## ✨ Principais Funcionalidades e Melhorias

1. **Visual Escuro Tech (Dark Theme)**
   - Interface com estética dark moderna inspirada em produtos como Linear, Vercel e YouTube Dark.
   - Efeito _Ambilight_ (brilho ambiente em volta do player que reflete as cores do vídeo em tempo real).
   - Transições e micro-animações suaves em todos os botões, cards e modais.
   - Seletor de cores de destaque (Índigo, Ciano Cyber, Esmeralda Matrix, Âmbar e Rose).

2. **Remoção Inteligente de Numerações**
   - Elimina automaticamente numerações e prefixos na frente do nome das aulas (ex: `0 `, `0.0 `, `01 - `, `1 `, `M001 - `, `Aula 01 - `).
   - O título é exibido limpo e elegante tanto nos cards quanto no player e nas anotações, mantendo a ordem sequencial correta.

3. **Home com "Continuar Assistindo"**
   - Card Hero de destaque no topo da página que identifica a última aula que você estava assistindo.
   - Mostra o minuto exato em que você parou, a porcentagem concluída, miniatura e botão de retomada imediata com um clique.
   - Prateleira com as aulas em andamento para acesso rápido.

4. **Trilha Organizada de Módulos e Aulas**
   - Estrutura hierárquica automática: **Curso > Módulos > Aulas**.
   - Módulos em formato de acordeão colapsável com barra de progresso individual.
   - Lista sequencial de aulas com indicação de duração, status e anotações.

5. **Barra de Progresso do Curso**
   - Barra de progresso geral no topo do cabeçalho mostrando o percentual total concluído e o total de aulas.
   - Barras de progresso nos cards de cada aula e em cada módulo.

6. **Player Dedicado com Controles Profissionais**
   - Suporte completo a **HTTP Range Requests (206 Partial Content)** para avanço e retrocesso instantâneo sem travamentos.
   - Modos de visualização: **Padrão**, **Cinema (Teatro)**, **Tela Cheia (F)** e **Picture-in-Picture (P)**.
   - Controle de velocidade de reprodução (0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 1.75x, 2.0x).
   - Auto-avanço para a próxima aula com contagem regressiva de 5 segundos ao término do vídeo.
   - Botões de navegação rápida para Aula Anterior (`B`) e Próxima Aula (`N`).

7. **Miniaturas e Pré-Carregamento**
   - Geração automática de miniaturas via `ffmpeg` salvas em cache local (`data/thumbs/`).
   - Pré-visualização instantânea da aula no hover e antes do início da reprodução.
   - Fallback inteligente com gradiente tech e título caso o arquivo ainda não tenha gerado miniatura.

8. **Registro e Histórico do que já Assistiu**
   - Salvamento contínuo da posição do vídeo a cada poucos segundos.
   - Conclusão automática ao atingir 90% da aula assistida (ou botão manual de marcar como concluída `C`).
   - Filtros rápidos na Home e na Trilha: **Todas**, **Em Andamento**, **Concluídas**, **Não Assistidas** e **Favoritas**.

9. **Sistema de Anotações por Aula**
   - Adicione notas vinculadas ao segundo exato do vídeo com o botão rápido **"Adicionar Nota em [MM:SS]"**.
   - Ao clicar no selo de tempo de qualquer anotação, o vídeo pula diretamente para o momento correspondente.
   - Aba exclusiva "Anotações" para pesquisar em todas as notas do curso e botão para exportar tudo em formato **Markdown (.md)**.

10. **Busca Global e Favoritos**
    - Atalho `Ctrl + K` (ou `⌘K`) para buscar instantaneamente por título da aula, módulo ou texto de anotações.
    - Botão de favoritar com estrela em cada card e no player.

---

## ⌨️ Atalhos de Teclado no Player

| Tecla                                                      | Ação                                       |
| :--------------------------------------------------------- | :----------------------------------------- |
| <kbd>Espaço</kbd> ou <kbd>K</kbd>                          | Play / Pause                               |
| <kbd>←</kbd> / <kbd>→</kbd> ou <kbd>J</kbd> / <kbd>L</kbd> | Voltar / Avançar 10 segundos               |
| <kbd>↑</kbd> / <kbd>↓</kbd>                                | Aumentar / Diminuir volume (5%)            |
| <kbd>M</kbd>                                               | Mudo (Mute) / Ativar som                   |
| <kbd>F</kbd>                                               | Tela cheia (Fullscreen)                    |
| <kbd>P</kbd>                                               | Picture-in-Picture (Mini-player flutuante) |
| <kbd>T</kbd>                                               | Alternar Modo Cinema (Teatro)              |
| <kbd>N</kbd>                                               | Próxima aula                               |
| <kbd>B</kbd>                                               | Aula anterior                              |
| <kbd>C</kbd>                                               | Alternar status de Concluída               |
| <kbd>0</kbd> a <kbd>9</kbd>                                | Pular para 0% até 90% do vídeo             |
| <kbd>Ctrl + K</kbd>                                        | Focar na barra de busca                    |

---

## 🚀 Como Executar

### Pré-requisitos

- Node.js instalado (v14 ou superior, recomendado v18+).
- _Opcional:_ `ffmpeg` instalado no sistema para geração de miniaturas das aulas (se não tiver, o sistema gera miniaturas dinâmicas tech automaticamente).

### Iniciando o Servidor

No terminal, dentro da pasta do projeto, execute:

```bash
node server.js
```

ou:

```bash
npm start
```

Abra o navegador no endereço:
👉 **[http://localhost:3000](http://localhost:3000)**

### Integração local com Meta Ads

Antes de usar a integração, revogue tokens que tenham sido compartilhados ou expostos e gere um novo token com as permissões adequadas no Meta Business. O token deve existir somente como variável de ambiente do backend:

```powershell
$env:META_ACCESS_TOKEN = "SEU_TOKEN_NOVO"
$env:META_GRAPH_VERSION = "v23.0"
npm start
```

Nunca coloque o token em `config.json`, `public/app.js`, `workspace.json`, commits ou chamadas feitas pelo navegador. O backend disponibiliza:

```text
GET /api/meta/adaccounts
GET /api/meta/insights?accountId=act_<ID>&datePreset=last_30d&level=campaign
```

As permissões e a validade dependem do tipo de token e do app no Meta. Para produção, use OAuth, armazenamento seguro de secrets e autenticação própria no portal antes de publicar o site.

### Integração local com Google Analytics 4

Para a conta de serviço, crie uma conta no Google Cloud, habilite a Google Analytics Data API, compartilhe a propriedade GA4 com o e-mail da conta de serviço como leitor e salve o JSON baixado em:

```text
credentials/ga4-api-123456.json
```

Essa pasta está protegida no `.gitignore`. O backend usa esse caminho por padrão. Para usar outro caminho, configure:

```powershell
$env:GA4_PROPERTY_ID = "553354770"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\caminho\\seguro\\ga4-api.json"
```

Na seção `Trabalho > Relatórios e dashboards`, informe o ID da propriedade e clique em `Buscar dados`. A rota local usada é `GET /api/ga4/insights?propertyId=123456789&datePreset=last_7d`.

---

## 🌐 Como Publicar Online e Servir Vídeos Remotamente

Para disponibilizar o Video Hub online e assistir às aulas de qualquer lugar:

1. **Hospedagem da Aplicação Node.js:**
   - Faça o deploy do projeto em serviços como **Render, Railway, Fly.io, Vercel ou uma VPS (DigitalOcean / AWS / Hetzner)**.
   - Configure as variáveis de ambiente em produção (`PORT`, `NODE_ENV=production`, `META_APP_ID`, `META_APP_SECRET`, `GA4_PROPERTY_ID`, etc.).

2. **Hospedagem dos Vídeos em Nuvem / CDN (S3 ou Cloudflare R2):**
   - Faça o upload da pasta de vídeos para um bucket como **Cloudflare R2, AWS S3, BunnyCDN ou DigitalOcean Spaces**.
   - No modal de Configurações (ou no arquivo `config.json`), defina o campo `remoteVideosUrl`:
     ```json
     {
       "remoteVideosUrl": "https://meustorage.r2.cloudflarestorage.com/cursos"
     }
     ```
   - O player passará a buscar os vídeos diretamente da URL remota com streaming rápido via CDN/Range Requests.

---

## 📊 Gerador de Dashboards Visuais (Meta Ads & GA4)

Na aba **Trabalho > Relatórios e dashboards**, você conta com um gerador de dashboards analíticos em tempo real:

1. **Meta Ads Dashboard:**
   - Selecione a conta de anúncios (`act_<ID>`), o nível de detalhamento (**Campanha**, **Conjunto de Anúncios**, **Anúncio** ou **Conta**) e o período.
   - O dashboard exibe KPIs de **Investimento, Impressões, Alcance, CTR, CPM, CPC, ROAS, Leads e Conversas**, além de gráficos de barras para análise por campanha.

2. **Google Analytics 4 (GA4) Dashboard:**
   - Informe o ID da propriedade GA4 e o período.
   - O dashboard traz métricas de **Sessões, Conversões Totais, Taxa de Conversão, Usuários Totais/Novos/Ativos, Pageviews e Engajamento**, com detalhamento por grupo de canais de aquisição.

3. **Exportação / Relatórios para Clientes:**
   - Botão **Imprimir / PDF** para gerar relatórios visuais limpos para envio aos clientes.

---

## 📁 Como Adicionar Seus Vídeos

Basta colocar seus vídeos dentro da pasta `videos/` (ou alterar o caminho no arquivo `config.json` ou pelo botão de configurações na interface).

A estrutura recomendada de pastas é:

```text
videos/
└── Nome do Curso/
    ├── Módulo 01 - Introdução/
    │   ├── 0.0 Boas vindas.mp4
    │   ├── 0.1 Visão Geral.mp4
    │   └── 1.0 Primeiros Passos.mp4
    └── Módulo 02 - Prática/
        ├── 01 Configuração.mp4
        └── 02 Execução.mp4
```

O sistema limpa os prefixos automaticamente e exibe:

- **Boas vindas**
- **Visão Geral**
- **Primeiros Passos**
- **Configuração**
- **Execução**

Ao adicionar novos vídeos, basta clicar no botão de **Reescanear** (ícone de recarregar no topo da tela) para atualizar a lista instantaneamente.
