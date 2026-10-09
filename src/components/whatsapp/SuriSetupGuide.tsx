import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabasePublicKey, supabasePublicUrl } from '@/integrations/supabase/client';
import { CopyField } from './CopyField';

const PAYLOAD_FIELDS: { key: string; description: string }[] = [
  { key: 'primeiro_nome', description: 'Primeiro nome do paciente' },
  { key: 'nome', description: 'Nome completo' },
  { key: 'telefone', description: 'WhatsApp com DDI (caminho do telefone)' },
  { key: 'data', description: 'Data da consulta (DD/MM/AAAA)' },
  { key: 'dia_semana', description: 'Dia da semana (ex.: segunda-feira)' },
  { key: 'horario', description: 'Horário de início (HH:MM)' },
  { key: 'horario_fim', description: 'Horário de término' },
  { key: 'procedimento', description: 'Procedimento / serviço' },
  { key: 'profissional', description: 'Nome do profissional' },
  { key: 'clinica', description: 'Nome da clínica' },
  { key: 'evento', description: 'booking, day_before ou same_day' },
  { key: 'teste', description: 'true quando for envio de teste' },
  { key: 'token', description: 'Código da consulta (usado nos botões)' },
];

const TEMPLATES: { title: string; text: string; vars: string[] }[] = [
  {
    title: 'Confirmação do agendamento',
    text: 'Olá, {{1}}! Seu agendamento de {{2}} com {{3}} foi recebido para {{4}} às {{5}}. Podemos confirmar sua presença?',
    vars: ['primeiro_nome', 'procedimento', 'profissional', 'data', 'horario'],
  },
  {
    title: 'Lembrete da véspera',
    text: 'Olá, {{1}}! Passando para lembrar: amanhã, {{2}}, às {{3}}, você tem {{4}} com {{5}} na {{6}}. Confirma sua presença?',
    vars: ['primeiro_nome', 'data', 'horario', 'procedimento', 'profissional', 'clinica'],
  },
  {
    title: 'Lembrete do dia',
    text: 'Olá, {{1}}! Sua consulta de {{2}} é hoje às {{3}} com {{4}}. Te esperamos na {{5}}!',
    vars: ['primeiro_nome', 'procedimento', 'horario', 'profissional', 'clinica'],
  },
];

const REPLY_ACTIONS: { button: string; action: string }[] = [
  { button: 'Confirmar', action: 'confirmar' },
  { button: 'Remarcar', action: 'remarcar' },
  { button: 'Cancelar', action: 'cancelar' },
];

export function SuriSetupGuide() {
  const [identifier, setIdentifier] = useState('smarthub');
  const id = identifier.trim() || 'smarthub';
  const macro = (key: string) => `@Integrations.${id}.${key}`;
  const replyUrl = `${supabasePublicUrl}/rest/v1/rpc/smart_hub_appointment_reply`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Como configurar na Suri</CardTitle>
        <CardDescription>
          Faça uma vez para cada mensagem (confirmação, véspera e dia). Você também pode usar um único fluxo e
          separar as mensagens pela variável <code className="font-mono">evento</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <ol className="list-decimal space-y-4 pl-5">
          <li className="space-y-2">
            <p className="font-medium">Crie o modelo de mensagem (template)</p>
            <p className="text-muted-foreground">
              Em <strong>Configurações › Modelos de Mensagem › Novo Modelo</strong>, marque{' '}
              <strong>Mensagem Template do WhatsApp</strong>, categoria <strong>Utilidade</strong>, e adicione os
              botões de resposta rápida <strong>Confirmar</strong>, <strong>Remarcar</strong> e{' '}
              <strong>Cancelar</strong>. Sugestões de texto:
            </p>
            <div className="grid gap-3 lg:grid-cols-3">
              {TEMPLATES.map((t) => (
                <div key={t.title} className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-semibold">{t.title}</p>
                  <CopyField value={t.text} multiline />
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {t.vars.map((v, i) => (
                      <li key={v} className="truncate">
                        <span className="font-mono">{`{{${i + 1}}}`}</span> →{' '}
                        <code className="font-mono text-foreground">{macro(v)}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </li>

          <li className="space-y-2">
            <p className="font-medium">Crie o fluxo com gatilho de webhook</p>
            <p className="text-muted-foreground">
              No fluxo, adicione o gatilho <strong>Webhook</strong> do tipo <strong>Customizado</strong>, escolha o
              canal WhatsApp da clínica e preencha:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="suri-identifier" className="text-xs text-muted-foreground">
                  Identificador da integração
                </Label>
                <Input
                  id="suri-identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value.replace(/[^\w]/g, ''))}
                  className="h-9 font-mono text-xs"
                />
              </div>
              <CopyField label="Caminho do telefone no JSON" value="telefone" />
            </div>
            <p className="text-muted-foreground">
              Copie a URL que a Suri mostrar e cole no campo da mensagem correspondente acima. Marque{' '}
              <strong>Funcionar durante atendimento</strong> para os lembretes chegarem mesmo se o paciente estiver
              na fila.
            </p>
          </li>

          <li className="space-y-2">
            <p className="font-medium">Envie o template no fluxo</p>
            <p className="text-muted-foreground">
              Use a ação de envio de template e preencha as variáveis com os dados que o SmartHub manda:
            </p>
            <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {PAYLOAD_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
                  <code className="truncate font-mono text-xs">{macro(f.key)}</code>
                  <span className="shrink-0 text-xs text-muted-foreground">{f.description}</span>
                </div>
              ))}
            </div>
          </li>

          <li className="space-y-2">
            <p className="font-medium">Ligue os botões à Agenda</p>
            <p className="text-muted-foreground">
              Depois de cada botão, adicione uma ação <strong>Requisição HTTP</strong> (método POST) com a URL e os
              cabeçalhos abaixo. A resposta traz o campo <code className="font-mono">mensagem</code>, que você pode
              mostrar ao paciente. A consulta muda para confirmada ou cancelada na Agenda; o pedido de remarcação
              aparece nas observações.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              <CopyField label="URL" value={replyUrl} />
              <CopyField label="Cabeçalho apikey" value={supabasePublicKey} />
              <CopyField label="Cabeçalho Content-Type" value="application/json" />
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {REPLY_ACTIONS.map((r) => (
                <CopyField
                  key={r.action}
                  label={`Corpo do botão ${r.button}`}
                  value={`{ "p_token": "${macro('token')}", "p_action": "${r.action}" }`}
                  multiline
                />
              ))}
            </div>
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
