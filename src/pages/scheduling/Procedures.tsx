import { useMemo, useState } from 'react';
import { CircleDollarSign, Clock3, Layers, ListPlus, Pencil, Plus, Search, Stethoscope, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { useProcedures } from '@/hooks/useScheduling';
import {
  BILLING_UNIT_LABELS,
  type Procedure,
  type ProcedureBillingUnit,
  type ProcedureInput,
} from '@/types/scheduling';

const EMPTY_FORM: ProcedureInput = {
  name: '',
  category: '',
  description: null,
  default_price: 0,
  duration_minutes: 30,
  billing_unit: 'appointment',
  default_commission: null,
  preparation: null,
  is_active: true,
};

function currency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Procedures() {
  const { procedures, createProcedure, addProcedureTemplates, updateProcedure, removeProcedure } = useProcedures();
  const { segment } = useClinicSettings();
  const { singular, plural } = segment.service;
  const singularLower = singular.toLowerCase();
  const pluralLower = plural.toLowerCase();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Procedure | null>(null);
  const [form, setForm] = useState<ProcedureInput>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');

  const categories = useMemo(
    () => Array.from(new Set(procedures.map((item) => item.category))).sort(),
    [procedures],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return procedures.filter((item) => {
      if (term && !`${item.name} ${item.category}`.toLowerCase().includes(term)) return false;
      if (category !== 'all' && item.category !== category) return false;
      if (status === 'active' && !item.is_active) return false;
      if (status === 'inactive' && item.is_active) return false;
      return true;
    });
  }, [procedures, search, category, status]);

  const averageDuration = procedures.length
    ? Math.round(procedures.reduce((sum, p) => sum + p.duration_minutes, 0) / procedures.length)
    : 0;

  const stats = [
    { label: 'Total', value: procedures.length, icon: Stethoscope, color: 'text-blue-600 bg-blue-50' },
    {
      label: 'Ativos',
      value: procedures.filter((p) => p.is_active).length,
      icon: CircleDollarSign,
      color: 'text-emerald-600 bg-emerald-50',
    },
    { label: 'Categorias', value: categories.length, icon: Layers, color: 'text-sky-600 bg-sky-50' },
    {
      label: 'Duração média',
      value: averageDuration ? `${averageDuration} min` : '—',
      icon: Clock3,
      color: 'text-amber-600 bg-amber-50',
    },
  ];

  const missingTemplates = segment.templates.filter(
    (t) => !procedures.some((p) => p.name.trim().toLowerCase() === t.name.toLowerCase()),
  );

  const handleAddTemplates = () => {
    const added = addProcedureTemplates(segment.templates);
    toast.success(`${added} ${added === 1 ? singularLower : pluralLower} sugerido(s) adicionado(s). Revise os preços.`);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, category: segment.categories[0] ?? '' });
    setDialogOpen(true);
  };

  const openEdit = (procedure: Procedure) => {
    const { id: _id, ...rest } = procedure;
    setEditing(procedure);
    setForm({ ...rest, preparation: rest.preparation ?? null });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (!(form.duration_minutes > 0)) {
      toast.error('Informe uma duração válida em minutos');
      return;
    }
    const payload: ProcedureInput = {
      ...form,
      name: form.name.trim(),
      category: form.category.trim() || 'Outros',
      description: form.description?.trim() || null,
      preparation: form.preparation?.trim() || null,
    };

    if (editing) {
      updateProcedure(editing.id, payload);
      toast.success(`${singular} atualizado`);
    } else {
      createProcedure(payload);
      toast.success(`${singular} cadastrado`);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (!editing) return;
    removeProcedure(editing.id);
    toast.success(`${singular} excluído`);
    setDialogOpen(false);
  };

  const examples = segment.templates
    .slice(0, 3)
    .map((t) => t.name)
    .join(', ');

  return (
    <AppLayout
      title={`${plural} e preços`}
      description={`Cadastre os ${pluralLower} ${segment.establishmentOf}, com preço, duração e preparo`}
      actions={
        <div className="flex flex-wrap gap-2">
          {missingTemplates.length > 0 && (
            <Button variant="outline" onClick={handleAddTemplates}>
              <ListPlus className="mr-2 h-4 w-4" />
              Adicionar sugeridos ({missingTemplates.length})
            </Button>
          )}
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo {singularLower}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-3 pt-6">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={`Buscar ${singularLower}...`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="lg:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categories.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="lg:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <div className="space-y-4 py-12 text-center text-muted-foreground">
                {procedures.length === 0 ? (
                  <>
                    <p>
                      Nenhum {singularLower} cadastrado ainda. Clique em "Novo {singularLower}" ou comece pelos
                      sugeridos para {segment.label.toLowerCase()}.
                    </p>
                    <Button variant="outline" onClick={handleAddTemplates}>
                      <ListPlus className="mr-2 h-4 w-4" />
                      Adicionar {segment.templates.length} {pluralLower} sugeridos
                    </Button>
                  </>
                ) : (
                  <p>Nenhum {singularLower} encontrado.</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{singular}</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Preço</TableHead>
                      <TableHead>Comissão sugerida</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((procedure) => (
                      <TableRow key={procedure.id}>
                        <TableCell>
                          <p className="font-medium">{procedure.name}</p>
                          <p className="text-xs text-muted-foreground">
                            por {BILLING_UNIT_LABELS[procedure.billing_unit].toLowerCase()}
                          </p>
                          {procedure.preparation && (
                            <p className="mt-1 max-w-xs text-xs text-amber-700">Preparo: {procedure.preparation}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{procedure.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                            {procedure.duration_minutes} min
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{currency(procedure.default_price)}</TableCell>
                        <TableCell>
                          {procedure.default_commission == null ? '—' : `${procedure.default_commission}%`}
                        </TableCell>
                        <TableCell>
                          <Badge className={procedure.is_active ? 'bg-emerald-500' : 'bg-muted text-muted-foreground'}>
                            {procedure.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(procedure)}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Editar {procedure.name}</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${singularLower}` : `Novo ${singularLower}`}</DialogTitle>
            <DialogDescription>
              Preço, duração e preparo são usados automaticamente ao criar um agendamento na Agenda.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="procedure-name">Nome do {singularLower}</Label>
              <Input
                id="procedure-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={`Ex.: ${examples}`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="procedure-category">Categoria</Label>
              <Input
                id="procedure-category"
                list="procedure-categories"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                placeholder={segment.categories.slice(0, 2).join(' ou ')}
              />
              <datalist id="procedure-categories">
                {Array.from(new Set([...segment.categories, ...categories])).map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="procedure-price">Preço padrão</Label>
              <CurrencyInput
                id="procedure-price"
                value={form.default_price}
                onValueChange={(value) => setForm({ ...form, default_price: value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="procedure-duration">Duração (minutos)</Label>
              <Input
                id="procedure-duration"
                type="number"
                min="5"
                step="5"
                value={form.duration_minutes}
                onChange={(event) => setForm({ ...form, duration_minutes: Number(event.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Unidade de cobrança</Label>
              <Select
                value={form.billing_unit}
                onValueChange={(value) => setForm({ ...form, billing_unit: value as ProcedureBillingUnit })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BILLING_UNIT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="procedure-commission">Comissão sugerida (%)</Label>
              <Input
                id="procedure-commission"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.default_commission ?? ''}
                onChange={(event) =>
                  setForm({
                    ...form,
                    default_commission: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
                placeholder="Opcional"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="procedure-active">{singular} ativo</Label>
              <Switch
                id="procedure-active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="procedure-preparation">Orientações de preparo para o paciente</Label>
              <Textarea
                id="procedure-preparation"
                value={form.preparation || ''}
                onChange={(event) => setForm({ ...form, preparation: event.target.value })}
                placeholder="Ex.: Jejum de 8 horas. Aparece no agendamento e na mensagem de WhatsApp."
                rows={2}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="procedure-description">Descrição interna</Label>
              <Textarea
                id="procedure-description"
                value={form.description || ''}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Observações internas (não enviadas ao paciente)"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!form.name.trim()}>
                Salvar {singularLower}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
