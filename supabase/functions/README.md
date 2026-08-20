# Edge Functions — HealthCare

Modelo **vendas diretas B2B**, com pagamentos manuais mantidos e integração
Asaas opcional por clínica. Mercado Pago permanece removido.

## Funções ativas

| Função | Descrição | Secrets necessários |
|--------|-----------|---------------------|
| `check-subscriptions` | Cron: alertas de vencimento, inadimplência e suspensão | `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` |
| `init-superadmin` | Cria o primeiro superadmin (uma vez) | `INIT_SECRET` |
| `reset-user-password` | Reset de senha administrativo | `SUPABASE_SERVICE_ROLE_KEY` |
| `delete-clinic-and-user` | Exclusão de clínica e usuário | `SUPABASE_SERVICE_ROLE_KEY` |
| `create-complete-client` | Criação segura de cliente completo por superadmin | `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` |
| `add-clinic-unit` | Nova unidade no grupo do dono, com assinatura própria e limite do plano | `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` |
| `meta-webhook` | Webhook Meta WhatsApp (receber mensagens + fluxo bot) | `META_WEBHOOK_VERIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` |
| `meta-send-message` | Enviar mensagem outbound via Cloud API | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |
| `meta-save-channel` | Salva credenciais Meta sem expô-las ao PostgREST | `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` |
| `meta-oauth` | OAuth Facebook/Instagram (start + callback) — Central de Integrações | `META_APP_ID`, `META_APP_SECRET`, `APP_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `meta-connection` | Página, status, Lead Ads on/off, reconectar/desconectar | `META_APP_ID`, `META_APP_SECRET`, `APP_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `meta-leadgen-webhook` | Webhook app-level Page `leadgen` → CRM | `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` |
| `asaas-webhook` | Persistência e processamento idempotente de eventos | `ASAAS_WEBHOOK_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` |
| `asaas-create-checkout` | Cria cliente/assinatura e taxa de adesão opcional | `ASAAS_API_KEY`, `ASAAS_API_BASE_URL`, `ASAAS_ENV` |
| `asaas-list-payments` | Lista faturas da assinatura com isolamento por clínica | Secrets Asaas |
| `asaas-cancel-subscription` | Cancela recorrência Asaas e estado local | Secrets Asaas |
| `asaas-set-card-recurring` | Atualiza assinatura para cartão e abre fatura para cadastro | Secrets Asaas |
| `asaas-choose-payment-method` | Cliente escolhe Pix, boleto ou cartão na plataforma | Secrets Asaas |
| `asaas-reconcile` | Reconciliação diária de eventos/cobranças | Secrets Asaas e `CRON_SECRET` |
| `integrations-webhook` | Webhook genérico de entrada por integração; cria lead no CRM | `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `META_APP_SECRET` (provedores Meta) |
| `integrations-api` | API REST do tenant (leads, fluxos, logs) para n8n / Make / Zapier / ERPs | `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` |
| `integrations-dispatch` | Ações do app: testar conexão, disparar fluxo, reprocessar webhook | `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` |
| `smart-hub-capture` | Captação pública do Smart Hub → CRM (visitante anônimo) | `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` |
| `smart-hub-booking` | Catálogo, disponibilidade e confirmação de agendamento online | `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` |

## Legado (não usar em vendas diretas)

| Função | Status |
|--------|--------|
| `create-clinic-on-signup` | Descontinuada — cadastro é manual pelo SuperAdmin |

## Deploy

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF

supabase functions deploy check-subscriptions
supabase functions deploy init-superadmin
supabase functions deploy reset-user-password
supabase functions deploy delete-clinic-and-user
supabase functions deploy create-complete-client
supabase functions deploy meta-webhook
supabase functions deploy meta-send-message
supabase functions deploy meta-save-channel
supabase functions deploy asaas-webhook --no-verify-jwt
supabase functions deploy asaas-create-checkout
supabase functions deploy asaas-list-payments
supabase functions deploy asaas-cancel-subscription
supabase functions deploy asaas-set-card-recurring
supabase functions deploy asaas-choose-payment-method
supabase functions deploy asaas-reconcile --no-verify-jwt

# Integrações (execute antes: PRODUCAO_25 … PRODUCAO_29)
supabase functions deploy integrations-webhook --no-verify-jwt
supabase functions deploy integrations-api --no-verify-jwt
supabase functions deploy integrations-dispatch
# Central Meta (OAuth callback é público; start/gestão usam JWT do usuário)
supabase functions deploy meta-oauth --no-verify-jwt
supabase functions deploy meta-connection
supabase functions deploy meta-leadgen-webhook --no-verify-jwt

# Smart Hub (visitante anônimo; clinic_id só pelo slug no banco)
supabase functions deploy smart-hub-capture --no-verify-jwt
supabase functions deploy smart-hub-booking --no-verify-jwt
```

`integrations-webhook`, `integrations-api` e o callback de `meta-oauth` sobem
com JWT desligado no gateway: o chamador é externo ou o redirect da Meta.
Em todos os casos o `clinic_id` vem do banco (token/state), nunca do body sem
validação.

### Autenticação da entrada de webhook

A verificação **falha fechada**: integração sem credencial configurada não
recebe evento.

| Provedor | Esquema | Como autentica |
|----------|---------|----------------|
| Meta, Facebook Lead Ads, Instagram Lead Ads, WhatsApp Business | `meta_hmac` | HMAC-SHA256 do corpo em `X-Hub-Signature-256`, com o secret `META_APP_SECRET` |
| Landing pages, webhook, n8n, Make, Zapier, API externa | `shared_secret` | Segredo da própria integração no header `x-healthcare-secret` |

Cadastro do endpoint na Meta (Callback URL + Verify token):

```
GET /functions/v1/integrations-webhook/<slug>?hub.mode=subscribe&hub.verify_token=<segredo da integração>&hub.challenge=...
```

O `hub.verify_token` conferido é o segredo **daquela conexão**, não um token
global: uma clínica não consegue validar o endpoint de outra. Sem
`META_APP_SECRET` configurado, os eventos da Meta são recusados com 503 em vez
de aceitos.

Requisição que falha na autenticação **não persiste o payload** em
`webhook_logs` — apenas o motivo — para que quem descobrir um slug não consiga
encher a tabela.

## API universal de leads

Qualquer integração cria lead no CRM pelo mesmo caminho. O formato do payload
não importa: `_shared/leadPayload.ts` reconhece JSON plano em português ou
inglês, `field_data` do Meta e listas de campos de formulário.

```bash
curl -X POST "https://SEU-PROJETO.supabase.co/functions/v1/integrations-api/leads" \
  -H "Authorization: Bearer hc_live_SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Maria","telefone":"(11) 98888-7777","origem":"instagram"}'
```

Rotas de lead (escopo exigido no token):

| Método | Rota | Escopo |
|--------|------|--------|
| POST | `/leads` | `leads:write` |
| GET | `/leads` | `leads:read` |
| GET | `/leads/:id` | `leads:read` |
| PATCH | `/leads/:id` | `leads:write` |

Pelo webhook, os provedores de `LEAD_CAPTURE_PROVIDERS`
(`_shared/leadPayload.ts`) criam lead automaticamente. Para inverter em uma
conexão específica, use `integrations.config.lead_capture` (`true` liga em
WhatsApp/API externa, `false` desliga).

Sem lead duplicado: o mesmo `external_lead_id` na mesma integração nunca entra
duas vezes, e o mesmo telefone/e-mail nos últimos 30 dias reaproveita o card
existente preenchendo só os campos vazios. Para forçar a criação, envie
`"dedupe": "none"`.

Secrets adicionais (Dashboard → Edge Functions → Secrets):

- `META_WEBHOOK_VERIFY_TOKEN` — token usado na verificação do webhook no Meta Developers
- `META_APP_ID` — App ID para OAuth da Central de Integrações
- `META_APP_SECRET` — OAuth + validação `X-Hub-Signature-256`
- `META_OAUTH_REDIRECT_URI` — opcional; padrão `{SUPABASE_URL}/functions/v1/meta-oauth/callback`
- `APP_URL` — origem autorizada para chamadas do navegador
- `ASAAS_ENV`, `ASAAS_API_BASE_URL`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`

Antes do deploy Asaas, execute manualmente
`supabase/PRODUCAO_02_ASAAS_BILLING.sql`. Veja `ASAAS_README.md` e
`../../docs/ASAAS_SANDBOX_E_PRODUCAO.md`.

## Cron diário (`check-subscriptions`)

```bash
curl -X POST https://SEU-PROJETO.supabase.co/functions/v1/check-subscriptions \
  -H "Authorization: Bearer SEU_CRON_SECRET" \
  -H "Content-Type: application/json"
```

Frequência recomendada: **1x por dia** (ex.: 6h).

Veja também: [PENDENCIAS_DEPLOY.md](../PENDENCIAS_DEPLOY.md) e [.github/workflows/check-subscriptions-cron.yml](../.github/workflows/check-subscriptions-cron.yml).
