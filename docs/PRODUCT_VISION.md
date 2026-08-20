# Funnel Platform — visão de produto

Este repositório evolui de um módulo Smart Hub para uma plataforma horizontal de aquisição, conversão, CRM e integrações.

## Princípio central

Todo ponto de entrada gera eventos. Toda identificação gera ou atualiza um lead. Todo lead entra no CRM. Toda interação permanece ligada ao lead até a conversão.

## Segmentação no onboarding

O segmento não cria versões diferentes da plataforma. Ele apenas aplica presets de nomenclatura, etapas, campos e automações.

Categorias iniciais:
- Produtos
- Serviços
- Imobiliário
- Educação
- Saúde e bem-estar
- Alimentação e hospitalidade
- B2B / consultoria
- Outro

Cada workspace mantém o mesmo core de dados e pode alterar as configurações depois.

## Core horizontal

- Workspaces e usuários
- CRM universal
- Funis configuráveis
- Eventos e tracking
- First-touch / last-touch attribution
- Lead ingestion multicanal
- Smart Hub
- Landing pages
- Campanhas e UTM
- Integrações / webhooks / API
- Automações
- Analytics de aquisição e conversão

## Regra de desacoplamento

HealthCare, Suri e qualquer outro sistema são integrações externas. Nenhuma integração externa controla o modelo central do funil.
