# Demonstração — Link da bio → Briefing → CRM

## Objetivo
Usar a própria plataforma como demonstração comercial para captação de projetos de sites, sistemas, plataformas, automações e integrações.

## Workspace recomendado
- Segmento: `B2B / consultoria`
- Objetivo: `Orçamentos`
- Funil sugerido:
  1. Novo
  2. Briefing recebido
  3. Qualificação
  4. Reunião
  5. Proposta
  6. Negociação
  7. Fechado
  8. Perdido

## Formulário
Em **Formulários**, criar usando o preset **Desenvolvimento de software — briefing completo**.

Configuração recomendada para Instagram:
- Origem: `instagram`
- Mídia: `bio`
- Campanha: `link-da-bio`

O formulário pergunta:
- tipo de projeto;
- segmento do negócio;
- público que utilizará a solução;
- problema que precisa ser resolvido;
- sistema atual;
- necessidade de integração;
- nome;
- WhatsApp;
- e-mail;
- empresa.

## Smart Hub
Criar ou editar um botão com:
- Título: `Quero criar meu projeto`
- Tipo/ação: formulário ou link interno
- Destino: `/f/<slug-do-formulario>`

Outros botões sugeridos:
- Conhecer soluções
- Falar pelo WhatsApp
- Ver projetos / portfólio

## Tracking demonstrável
A plataforma registra a jornada pública:

`visita → clique → form_view → form_started → form_submitted → lead → mudança de etapa → conversão`

O dashboard mostra:
- visitantes únicos;
- cliques/interações;
- briefings iniciados;
- briefings enviados;
- leads;
- conversões;
- taxa visitante → lead;
- taxa de conclusão do briefing;
- taxa lead → conversão;
- origem e campanha.

## CRM
Ao enviar o formulário, o lead é criado/atualizado pelo motor universal de ingestão. O briefing completo fica em `metadata.briefing` e aparece na tela de detalhes do lead.

## Uso por outros clientes
O mesmo recurso não é específico para tecnologia. O onboarding combina **segmento + objetivo**, cria um funil inicial e um formulário em rascunho. O cliente pode depois alterar etapas, formulário, origem, campanha e canais de captação sem mudar o core da plataforma.

## Antes de publicar uma demonstração real
1. Criar um projeto Supabase standalone.
2. Aplicar somente as migrations da plataforma standalone, na ordem.
3. Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. Criar a conta do proprietário.
5. Criar o workspace.
6. Criar/publicar o formulário.
7. Configurar o Smart Hub e apontar o CTA para o formulário.
8. Testar com parâmetros UTM antes de colocar o link na bio.

Não executar a pasta de migrations legadas do HealthCare em bloco.
