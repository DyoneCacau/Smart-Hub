import { useState } from 'react';
import { Check, Copy, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { buildIntegrationsApiUrl } from '@/lib/integrationSecurity';

const LEAD_FIELD_ALIASES: { field: string; aliases: string; note: string }[] = [
  {
    field: 'Nome',
    aliases: 'name, nome, full_name, first_name + last_name, cliente, contato',
    note: 'Sem nome, o telefone ou e-mail é usado como identificação',
  },
  {
    field: 'Telefone',
    aliases: 'phone, telefone, celular, whatsapp, mobile, fone',
    note: 'Guardado só com dígitos; o 55 do país é removido',
  },
  { field: 'E-mail', aliases: 'email, e-mail, mail, email_address', note: 'Validado e minúsculo' },
  { field: 'CPF', aliases: 'cpf, documento, document', note: 'Aceito só com 11 dígitos' },
  {
    field: 'Origem',
    aliases: 'source, origem, canal, utm_source, plataforma',
    note: 'Traduzida para Instagram, Facebook, WhatsApp, Indicação ou Tráfego pago',
  },
  {
    field: 'Interesse',
    aliases: 'interest, interesse, procedimento, tratamento, assunto',
    note: 'Aparece no card do Kanban',
  },
  {
    field: 'Valor',
    aliases: 'estimated_value, valor, orçamento, budget',
    note: 'Aceita "R$ 1.500,00" e "1500.50"',
  },
  {
    field: 'Observação',
    aliases: 'notes, observacao, mensagem, message, comentario',
    note: 'Concatenada com avisos da normalização',
  },
  {
    field: 'Id externo',
    aliases: 'external_lead_id, lead_id, leadgen_id, submission_id',
    note: 'Base da idempotência: o mesmo id nunca duplica',
  },
];

const CURL_EXAMPLE = `curl -X POST "${buildIntegrationsApiUrl('leads')}" \\
  -H "Authorization: Bearer SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "nome": "Maria Souza",
    "telefone": "(11) 98888-7777",
    "origem": "instagram",
    "interesse": "Harmonização facial",
    "valor": "R$ 1.500,00",
    "external_lead_id": "form-2026-0001"
  }'`;

const BATCH_EXAMPLE = `{
  "dedupe": "auto",
  "leads": [
    { "nome": "Ana", "telefone": "11988887777" },
    { "name": "Bruno", "email": "bruno@exemplo.com", "source": "facebook" }
  ]
}`;

function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.');
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? (
            <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="mr-1 h-3.5 w-3.5" />
          )}
          Copiar
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-[11px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Documentação viva da API de leads: a URL já vem preenchida com o projeto
 * da clínica, então é só copiar para o n8n / Make / Zapier.
 */
export function LeadsApiPanel() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Inbox className="h-4 w-4 text-primary" />
              API universal de leads
            </h3>
            <p className="text-sm text-muted-foreground">
              Qualquer integração cria lead no CRM desta clínica com um token de escopo
              <span className="font-mono text-xs"> leads:write</span>. O formato do payload
              não importa: campos em português ou inglês, <span className="font-mono text-xs">field_data</span> do
              Meta e listas de formulário são reconhecidos.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Endpoint</Label>
            <Input readOnly value={buildIntegrationsApiUrl('leads')} className="font-mono text-xs" />
          </div>

          <CopyBlock label="Exemplo (curl)" code={CURL_EXAMPLE} />
          <CopyBlock label="Lote de leads" code={BATCH_EXAMPLE} />

          <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-medium">Sem lead duplicado no Kanban</p>
            <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
              <li>
                Mesmo <span className="font-mono">external_lead_id</span> na mesma integração
                nunca entra duas vezes.
              </li>
              <li>
                Mesmo telefone ou e-mail nos últimos 30 dias reaproveita o card e só
                completa os campos vazios.
              </li>
              <li>
                Para forçar a criação, envie{' '}
                <span className="font-mono">&quot;dedupe&quot;: &quot;none&quot;</span>.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="font-semibold">Campos reconhecidos</h3>
            <p className="text-sm text-muted-foreground">
              Qualquer um destes nomes chega no campo certo do CRM.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo no CRM</TableHead>
                  <TableHead>Nomes aceitos</TableHead>
                  <TableHead>Como é tratado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {LEAD_FIELD_ALIASES.map((row) => (
                  <TableRow key={row.field}>
                    <TableCell className="font-medium">{row.field}</TableCell>
                    <TableCell className="font-mono text-[11px]">{row.aliases}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <h3 className="font-semibold">Outras rotas de lead</h3>
            <p className="text-sm text-muted-foreground">
              Mesmo endpoint base, autenticação por token da clínica.
            </p>
          </div>
          <div className="space-y-2 text-sm">
            {[
              { method: 'GET', path: '/leads', scope: 'leads:read', desc: 'Lista leads (stage, lead_source, phone, since, limit)' },
              { method: 'GET', path: '/leads/:id', scope: 'leads:read', desc: 'Detalha um lead' },
              { method: 'PATCH', path: '/leads/:id', scope: 'leads:write', desc: 'Move etapa, follow-up, interesse ou observação' },
            ].map((route) => (
              <div
                key={`${route.method}-${route.path}`}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2"
              >
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {route.method}
                </Badge>
                <span className="font-mono text-xs">{route.path}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {route.scope}
                </Badge>
                <span className="text-xs text-muted-foreground">{route.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
