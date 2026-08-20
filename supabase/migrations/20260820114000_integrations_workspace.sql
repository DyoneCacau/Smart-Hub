do $$
begin
  if to_regclass('public.integrations') is not null then
    alter table public.integrations add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
    create index if not exists idx_integrations_workspace on public.integrations(workspace_id);
  end if;

  if to_regclass('public.integration_connection_logs') is not null then
    alter table public.integration_connection_logs add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
    create index if not exists idx_integration_connection_logs_workspace on public.integration_connection_logs(workspace_id);
  end if;

  if to_regclass('public.automation_flows') is not null then
    alter table public.automation_flows add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
    create index if not exists idx_automation_flows_workspace on public.automation_flows(workspace_id);
  end if;

  if to_regclass('public.automation_logs') is not null then
    alter table public.automation_logs add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
    create index if not exists idx_automation_logs_workspace on public.automation_logs(workspace_id);
  end if;

  if to_regclass('public.api_tokens') is not null then
    alter table public.api_tokens add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
    create index if not exists idx_api_tokens_workspace on public.api_tokens(workspace_id);
  end if;

  if to_regclass('public.webhook_logs') is not null then
    alter table public.webhook_logs add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
    create index if not exists idx_webhook_logs_workspace on public.webhook_logs(workspace_id);
  end if;
end $$;
